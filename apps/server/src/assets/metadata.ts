import { z } from "zod";
import { open } from "node:fs/promises";

export const mediaMetadataSchema = z
  .object({
    mimeType: z.string().min(1),
    byteLength: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;

export function assertMediaMetadata(
  metadata: MediaMetadata,
  limits: {
    mimePrefixes: readonly string[];
    maximumBytes: number;
    maximumDurationSeconds?: number;
  },
): MediaMetadata {
  const parsed = mediaMetadataSchema.parse(metadata);
  if (!limits.mimePrefixes.some((prefix) => parsed.mimeType.startsWith(prefix))) {
    throw new Error("asset.mime_not_allowed");
  }
  if (parsed.byteLength > limits.maximumBytes) throw new Error("asset.byte_limit_exceeded");
  if (
    limits.maximumDurationSeconds !== undefined &&
    parsed.durationSeconds !== undefined &&
    parsed.durationSeconds > limits.maximumDurationSeconds
  ) {
    throw new Error("asset.duration_limit_exceeded");
  }
  return parsed;
}

export interface DetectedMediaType {
  mimeType: string;
  kind: "image" | "video" | "audio" | "file";
}

export interface InspectedMediaMetadata extends DetectedMediaType {
  width?: number;
  height?: number;
  durationSeconds?: number;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return Buffer.from(bytes.subarray(start, start + length)).toString("ascii");
}

export function detectMediaType(bytes: Uint8Array): DetectedMediaType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", kind: "image" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", kind: "image" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mimeType: "image/webp", kind: "image" };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return { mimeType: brand.startsWith("hei") ? "image/heic" : "image/heif", kind: "image" };
    }
    return {
      mimeType: brand.trim() === "qt" ? "video/quicktime" : "video/mp4",
      kind: "video",
    };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { mimeType: "video/webm", kind: "video" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return { mimeType: "audio/wav", kind: "audio" };
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "fLaC") {
    return { mimeType: "audio/flac", kind: "audio" };
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") {
    return { mimeType: "audio/ogg", kind: "audio" };
  }
  if (
    (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", kind: "audio" };
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") {
    return { mimeType: "application/pdf", kind: "file" };
  }
  return undefined;
}

interface IsoBox {
  type: string;
  payloadStart: number;
  end: number;
}

function isoBoxes(bytes: Buffer, start: number, end: number): IsoBox[] {
  const boxes: IsoBox[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = bytes.readUInt32BE(offset);
    const type = ascii(bytes, offset + 4, 4);
    let size = size32;
    let headerLength = 8;
    if (size32 === 1) {
      if (offset + 16 > end) break;
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(extended);
      headerLength = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < headerLength || offset + size > end) break;
    boxes.push({ type, payloadStart: offset + headerLength, end: offset + size });
    offset += size;
  }
  return boxes;
}

function inspectMp4(
  bytes: Buffer,
): Pick<InspectedMediaMetadata, "width" | "height" | "durationSeconds"> {
  const moov = isoBoxes(bytes, 0, bytes.byteLength).find((box) => box.type === "moov");
  if (!moov) return {};
  const children = isoBoxes(bytes, moov.payloadStart, moov.end);
  const mvhd = children.find((box) => box.type === "mvhd");
  let durationSeconds: number | undefined;
  if (mvhd) {
    const version = bytes[mvhd.payloadStart];
    const timeOffset = mvhd.payloadStart + (version === 1 ? 20 : 12);
    const durationOffset = mvhd.payloadStart + (version === 1 ? 24 : 16);
    if (durationOffset + (version === 1 ? 8 : 4) <= mvhd.end) {
      const timescale = bytes.readUInt32BE(timeOffset);
      const duration =
        version === 1
          ? Number(bytes.readBigUInt64BE(durationOffset))
          : bytes.readUInt32BE(durationOffset);
      if (timescale > 0 && Number.isFinite(duration)) durationSeconds = duration / timescale;
    }
  }
  let width: number | undefined;
  let height: number | undefined;
  for (const trak of children.filter((box) => box.type === "trak")) {
    const tkhd = isoBoxes(bytes, trak.payloadStart, trak.end).find((box) => box.type === "tkhd");
    if (!tkhd || tkhd.end - tkhd.payloadStart < 8) continue;
    const candidateWidth = bytes.readUInt32BE(tkhd.end - 8) / 65_536;
    const candidateHeight = bytes.readUInt32BE(tkhd.end - 4) / 65_536;
    if (candidateWidth > 0 && candidateHeight > 0) {
      width = Math.round(candidateWidth);
      height = Math.round(candidateHeight);
      break;
    }
  }
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
  };
}

function inspectJpeg(bytes: Buffer): Pick<InspectedMediaMetadata, "width" | "height"> {
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.byteLength) break;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  return {};
}

export function inspectMediaMetadata(bytes: Uint8Array): InspectedMediaMetadata | undefined {
  const detected = detectMediaType(bytes);
  if (!detected) return undefined;
  const buffer = Buffer.from(bytes);
  if (detected.mimeType === "image/png" && buffer.byteLength >= 24) {
    return { ...detected, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (detected.mimeType === "image/jpeg") return { ...detected, ...inspectJpeg(buffer) };
  if (detected.mimeType === "video/mp4" || detected.mimeType === "video/quicktime") {
    return { ...detected, ...inspectMp4(buffer) };
  }
  return detected;
}

export async function detectMediaTypeFromFile(
  filePath: string,
): Promise<DetectedMediaType | undefined> {
  const file = await open(filePath, "r");
  try {
    const prefix = Buffer.alloc(4_096);
    const { bytesRead } = await file.read(prefix, 0, prefix.byteLength, 0);
    return detectMediaType(prefix.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}
