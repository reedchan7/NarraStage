import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Knex } from "knex";
import { detectMediaType, detectMediaTypeFromFile } from "@/assets/metadata";
import type { ProviderAssetResolver, ResolvedProviderAsset } from "@/providers/ports/video";
import type { CapabilityAssetInput, MediaKind } from "@/providers/domain/capabilities";
import type { OperationContext } from "@/providers/ports";
import type { ImportedAsset } from "@/assets/assetGateway";
import type { ProviderFileAssetResolver, ResolvedProviderFileAsset } from "@/providers/ports/files";

interface MediaAssetRow {
  id: string;
  sha256: string;
  file_path: string;
  mime_type: string;
  byte_length: number;
  metadata_json: string | null;
  created_at: number;
}

export interface OwnedMediaAsset {
  id: string;
  sha256: string;
  filePath: string;
  mimeType: string;
  byteLength: number;
  kind: "image" | "video" | "audio" | "file";
  metadata?: Record<string, unknown>;
}

function assetIdFor(sha256: string): string {
  return `sha256:${sha256}`;
}

function isUtf8DocumentType(mediaType: string): boolean {
  return (
    mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType.endsWith("+json") ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+xml") ||
    mediaType === "application/rtf" ||
    mediaType === "application/javascript" ||
    mediaType === "application/x-javascript" ||
    mediaType === "application/sql"
  );
}

function rowToAsset(row: MediaAssetRow): OwnedMediaAsset {
  const detectedKind = row.mime_type.split("/", 1)[0];
  const kind = ["image", "video", "audio"].includes(detectedKind)
    ? (detectedKind as "image" | "video" | "audio")
    : "file";
  return {
    id: row.id,
    sha256: row.sha256,
    filePath: row.file_path,
    mimeType: row.mime_type,
    byteLength: Number(row.byte_length),
    kind,
    ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) } : {}),
  };
}

export class MediaAssetRepository {
  readonly #database: Knex;
  readonly #rootDirectory: string;

  constructor(database: Knex, rootDirectory: string) {
    this.#database = database;
    this.#rootDirectory = path.resolve(rootDirectory);
  }

  async ingestOwnedBytes(input: {
    bytes: Uint8Array;
    declaredKind: MediaKind;
    principalId: string;
    projectId?: number;
    sourceKind: "assets" | "storyboard" | "provider_output";
    sourceId?: string;
    durationSeconds?: number;
  }): Promise<OwnedMediaAsset> {
    const detected = detectMediaType(input.bytes);
    if (!detected || detected.kind === "file") throw new Error("asset.media_type_unsupported");
    if (detected.kind !== input.declaredKind) throw new Error("asset.kind_mismatch");
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const id = assetIdFor(sha256);
    const filePath = await this.#persistBytes(sha256, input.bytes);
    const createdAt = Date.now();
    const metadata = {
      ...(input.durationSeconds === undefined
        ? {}
        : {
            durationSeconds: input.durationSeconds,
            durationSource: "client_declared",
          }),
    };
    await this.#database.transaction(async (transaction) => {
      await transaction("o_media_assets")
        .insert({
          id,
          sha256,
          file_path: filePath,
          mime_type: detected.mimeType,
          byte_length: input.bytes.byteLength,
          metadata_json: JSON.stringify(metadata),
          created_at: createdAt,
        })
        .onConflict("sha256")
        .ignore();
      await transaction("o_media_asset_owners")
        .insert({
          asset_id: id,
          principal_id: input.principalId,
          ...(input.projectId === undefined ? {} : { project_id: input.projectId }),
          source_kind: input.sourceKind,
          ...(input.sourceId === undefined ? {} : { source_id: input.sourceId }),
          metadata_json: JSON.stringify(metadata),
          created_at: createdAt,
        })
        .onConflict(["asset_id", "principal_id"])
        .ignore();
    });
    return (await this.getOwned(id, input.principalId))!;
  }

  async ingestOwnedStream(input: {
    stream: Readable;
    declaredMediaType: string;
    byteLength: number;
    filename: string;
    principalId: string;
    maximumBytes?: number;
  }): Promise<OwnedMediaAsset> {
    const maximumBytes = input.maximumBytes ?? 2 * 1024 * 1024 * 1024;
    if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1) {
      throw new Error("asset.content_length_invalid");
    }
    if (input.byteLength > maximumBytes) throw new Error("asset.byte_limit_exceeded");
    const mediaType = input.declaredMediaType.split(";", 1)[0]!.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mediaType)) {
      throw new Error("asset.mime_not_allowed");
    }
    await mkdir(this.#rootDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(this.#rootDirectory, `.upload-${randomUUID()}.tmp`);
    const hash = createHash("sha256");
    const textDecoder = isUtf8DocumentType(mediaType)
      ? new TextDecoder("utf-8", { fatal: true })
      : undefined;
    let bytes = 0;
    const validator = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.byteLength;
        if (bytes > input.byteLength || bytes > maximumBytes) {
          callback(new Error("asset.byte_limit_exceeded"));
          return;
        }
        try {
          if (textDecoder?.decode(chunk, { stream: true }).includes("\0")) {
            callback(new Error("asset.content_type_mismatch"));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        } catch {
          callback(new Error("asset.content_type_mismatch"));
        }
      },
      flush(callback) {
        try {
          if (textDecoder?.decode().includes("\0")) {
            callback(new Error("asset.content_type_mismatch"));
            return;
          }
          callback();
        } catch {
          callback(new Error("asset.content_type_mismatch"));
        }
      },
    });
    try {
      await pipeline(input.stream, validator, createWriteStream(temporaryPath, { mode: 0o600 }));
      if (bytes !== input.byteLength) throw new Error("asset.content_length_mismatch");
      const detected = await detectMediaTypeFromFile(temporaryPath);
      if ((!detected && !textDecoder) || (detected && detected.mimeType !== mediaType)) {
        throw new Error("asset.content_type_mismatch");
      }
      const sha256 = hash.digest("hex");
      const filePath = path.join(this.#rootDirectory, sha256);
      try {
        await rename(temporaryPath, filePath);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      }
      const id = assetIdFor(sha256);
      const createdAt = Date.now();
      const metadata = { filename: input.filename };
      await this.#database.transaction(async (transaction) => {
        await transaction("o_media_assets")
          .insert({
            id,
            sha256,
            file_path: filePath,
            mime_type: mediaType,
            byte_length: bytes,
            metadata_json: JSON.stringify(metadata),
            created_at: createdAt,
          })
          .onConflict("sha256")
          .ignore();
        await transaction("o_media_asset_owners")
          .insert({
            asset_id: id,
            principal_id: input.principalId,
            source_kind: "client_upload",
            metadata_json: JSON.stringify(metadata),
            created_at: createdAt,
          })
          .onConflict(["asset_id", "principal_id"])
          .ignore();
      });
      return (await this.getOwned(id, input.principalId))!;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async registerImported(input: ImportedAsset, principalId: string): Promise<OwnedMediaAsset> {
    const detected = await detectMediaTypeFromFile(input.path);
    if (!detected) throw new Error("asset.media_type_unsupported");
    if (detected.mimeType !== input.mimeType) throw new Error("asset.content_type_mismatch");
    const id = assetIdFor(input.sha256);
    const createdAt = Date.now();
    await this.#database.transaction(async (transaction) => {
      await transaction("o_media_assets")
        .insert({
          id,
          sha256: input.sha256,
          file_path: input.path,
          mime_type: input.mimeType,
          byte_length: input.bytes,
          metadata_json: JSON.stringify({ sourceOrigin: input.sourceOrigin }),
          created_at: createdAt,
        })
        .onConflict("sha256")
        .ignore();
      await transaction("o_media_asset_owners")
        .insert({
          asset_id: id,
          principal_id: principalId,
          source_kind: "provider_output",
          metadata_json: JSON.stringify({ sourceOrigin: input.sourceOrigin }),
          created_at: createdAt,
        })
        .onConflict(["asset_id", "principal_id"])
        .ignore();
    });
    return (await this.getOwned(id, principalId))!;
  }

  async getOwned(id: string, principalId: string): Promise<OwnedMediaAsset | undefined> {
    const row = (await this.#database("o_media_assets")
      .join("o_media_asset_owners", "o_media_asset_owners.asset_id", "o_media_assets.id")
      .where({
        "o_media_assets.id": id,
        "o_media_asset_owners.principal_id": principalId,
      })
      .select("o_media_assets.*")
      .first()) as MediaAssetRow | undefined;
    return row ? rowToAsset(row) : undefined;
  }

  async #persistBytes(sha256: string, bytes: Uint8Array): Promise<string> {
    await mkdir(this.#rootDirectory, { recursive: true, mode: 0o700 });
    const filePath = path.join(this.#rootDirectory, sha256);
    try {
      const existing = await stat(filePath);
      if (!existing.isFile()) throw new Error("asset.content_path_not_file");
      return filePath;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
    const temporaryPath = path.join(this.#rootDirectory, `.write-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, bytes, { mode: 0o600, flag: "wx" });
      try {
        await rename(temporaryPath, filePath);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return filePath;
  }
}

export class OwnedMediaAssetResolver implements ProviderAssetResolver, ProviderFileAssetResolver {
  readonly #repository: MediaAssetRepository;

  constructor(repository: MediaAssetRepository) {
    this.#repository = repository;
  }

  async resolve(
    asset: CapabilityAssetInput,
    context?: OperationContext,
  ): Promise<ResolvedProviderAsset> {
    if (!context?.principalId) throw new Error("provider.asset_principal_required");
    const stored = await this.#repository.getOwned(asset.assetId, context.principalId);
    if (!stored) throw new Error("provider.asset_not_found");
    if (stored.kind !== asset.kind) throw new Error("provider.asset_kind_mismatch");
    const bytes = await readFile(stored.filePath);
    if (bytes.byteLength !== stored.byteLength) throw new Error("provider.asset_length_mismatch");
    return {
      assetId: stored.id,
      kind: asset.kind,
      mimeType: stored.mimeType,
      byteLength: stored.byteLength,
      sha256: stored.sha256,
      source: { kind: "blob", blob: new Blob([bytes], { type: stored.mimeType }) },
    };
  }

  async resolveFile(
    assetId: string,
    context?: OperationContext,
  ): Promise<ResolvedProviderFileAsset> {
    if (!context?.principalId) throw new Error("provider.asset_principal_required");
    const stored = await this.#repository.getOwned(assetId, context.principalId);
    if (!stored) throw new Error("provider.asset_not_found");
    const file = await stat(stored.filePath);
    if (!file.isFile()) throw new Error("provider.asset_path_not_file");
    if (file.size !== stored.byteLength) throw new Error("provider.asset_length_mismatch");
    const filename =
      stored.metadata && typeof stored.metadata.filename === "string"
        ? stored.metadata.filename
        : undefined;
    return {
      assetId: stored.id,
      mimeType: stored.mimeType,
      byteLength: stored.byteLength,
      sha256: stored.sha256,
      ...(filename ? { filename } : {}),
      source: { kind: "path", path: stored.filePath },
    };
  }
}
