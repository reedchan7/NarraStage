import type { LanguageInput } from "@/providers/ports/language";
import { deepSeekManifest } from "@/providers/adapters/deepseek/manifest";
import type { FetchFunction } from "@ai-sdk/provider-utils";

type FetchLike = FetchFunction;

type DeepSeekImageMediaType = (typeof deepSeekManifest.visionLimits.supportedMediaTypes)[number];

interface DeepSeekWireImagePart {
  type?: unknown;
  image_url?: { url?: unknown; detail?: unknown };
}

interface DeepSeekWireMessage {
  content?: unknown;
}

interface DeepSeekWireBody {
  messages?: DeepSeekWireMessage[];
}

export function collectWireImageDetails(
  input: LanguageInput,
): Array<"auto" | "low" | "high" | "original" | undefined> {
  return input.messages.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) =>
          part.type === "image" && part.source.type !== "provider_file" ? [part.detail] : [],
        )
      : [],
  );
}

export function withDeepSeekImageDetail(
  delegate: FetchLike,
  details: readonly (string | undefined)[],
): FetchLike {
  const wrapped = async (input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]) => {
    if (typeof init?.body !== "string") return delegate(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/chat/completions")) return delegate(input, init);
    if (Buffer.byteLength(init.body) > deepSeekManifest.visionLimits.maximumRequestBytes) {
      throw new Error("deepseek.request_body_limit_exceeded");
    }
    if (details.length === 0) return delegate(input, init);

    const body = JSON.parse(init.body) as DeepSeekWireBody;
    const imageParts = (body.messages ?? []).flatMap((message) =>
      Array.isArray(message.content)
        ? (message.content as DeepSeekWireImagePart[]).filter(
            (part) => part.type === "image_url" && part.image_url,
          )
        : [],
    );
    if (imageParts.length !== details.length) {
      throw new Error("deepseek.vision_wire_image_count_mismatch");
    }
    imageParts.forEach((part, index) => {
      const detail = details[index];
      if (detail && part.image_url) part.image_url.detail = detail;
    });
    const serializedBody = JSON.stringify(body);
    return delegate(input, { ...init, body: serializedBody });
  };
  return Object.assign(wrapped, { preconnect: delegate.preconnect });
}

export function decodeDeepSeekBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("deepseek.image_base64_invalid");
  }
  return Buffer.from(value, "base64");
}

function bytesStartWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectDeepSeekImageMediaType(
  bytes: Uint8Array,
): DeepSeekImageMediaType | undefined {
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  const ascii = Buffer.from(bytes.subarray(0, 12)).toString("ascii");
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  return undefined;
}

export function validateDeepSeekImageBytes(bytes: Uint8Array, declaredMediaType: string): void {
  const detected = detectDeepSeekImageMediaType(bytes);
  if (!detected) throw new Error("deepseek.image_format_unsupported");
  if (detected !== declaredMediaType) throw new Error("deepseek.image_media_type_mismatch");
}

export function validateDeepSeekVisionInput(input: LanguageInput, visionModel: boolean): void {
  const images = input.messages.flatMap((message) =>
    message.role === "user" ? message.content.filter((part) => part.type === "image") : [],
  );
  if (images.length > 0 && !visionModel) throw new Error("deepseek.model_does_not_support_images");
  if (images.length > deepSeekManifest.visionLimits.maximumImages) {
    throw new Error("deepseek.image_count_exceeded");
  }

  const maximumDimension =
    images.length >= 15
      ? deepSeekManifest.visionLimits.maximumDimensionAtFifteenImages
      : deepSeekManifest.visionLimits.maximumDimension;
  let knownTotalBytes = 0;
  let hasProviderFile = false;

  for (const image of images) {
    if (image.type !== "image") continue;
    const source = image.source;
    if (source.type === "url") {
      const url = new URL(source.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("deepseek.image_url_invalid");
      }
    }
    if (source.type === "inline") {
      const bytes = decodeDeepSeekBase64(source.dataBase64);
      if (bytes.byteLength !== source.byteLength) {
        throw new Error("deepseek.image_byte_length_mismatch");
      }
      validateDeepSeekImageBytes(bytes, source.mediaType);
    }
    if (source.type === "provider_file") {
      hasProviderFile = true;
      if (source.providerId !== "deepseek") throw new Error("deepseek.foreign_file_reference");
      if (image.detail) throw new Error("deepseek.file_detail_unsupported");
    }
    const maximumBytes =
      source.type === "provider_file"
        ? deepSeekManifest.visionLimits.maximumProviderFileBytes
        : deepSeekManifest.visionLimits.maximumInlineOrUrlImageBytes;
    if (source.byteLength !== undefined) {
      if (source.byteLength > maximumBytes) throw new Error("deepseek.image_byte_limit_exceeded");
      knownTotalBytes += source.byteLength;
    }
    if (
      ("width" in source && (source.width ?? 0) > maximumDimension) ||
      ("height" in source && (source.height ?? 0) > maximumDimension)
    ) {
      throw new Error("deepseek.image_dimension_exceeded");
    }
  }

  const totalLimit = hasProviderFile
    ? deepSeekManifest.visionLimits.maximumTotalBytesWithProviderFiles
    : deepSeekManifest.visionLimits.maximumTotalBytesWithoutProviderFiles;
  if (knownTotalBytes > totalLimit) throw new Error("deepseek.image_total_bytes_exceeded");
}
