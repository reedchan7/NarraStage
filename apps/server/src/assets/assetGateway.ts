import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import {
  approveOutboundUrl,
  assertRedirectLimit,
  createPinnedLookup,
  type ApprovedOutboundTarget,
  type OutboundResolver,
} from "@/assets/outboundPolicy";
import { detectMediaTypeFromFile } from "@/assets/metadata";
import type { CredentialRef, CredentialVault } from "@/security/credentials/types";

export interface OutboundResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
  dispose(): void;
}

export interface OutboundTransport {
  open(
    target: ApprovedOutboundTarget,
    headers?: Readonly<Record<string, string>>,
  ): Promise<OutboundResponse>;
}

export class PinnedHttpTransport implements OutboundTransport {
  readonly #timeoutMs: number;

  constructor(timeoutMs = 60_000) {
    this.#timeoutMs = timeoutMs;
  }

  open(
    target: ApprovedOutboundTarget,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<OutboundResponse> {
    return new Promise((resolve, reject) => {
      const requestFn = target.url.protocol === "https:" ? https.request : http.request;
      const request = requestFn(
        target.url,
        {
          method: "GET",
          agent: false,
          lookup: createPinnedLookup(target),
          headers: {
            accept: "image/*,video/*,audio/*,application/pdf,application/octet-stream",
            "accept-encoding": "br,gzip,deflate,identity",
            "user-agent": "Toonflow-AssetGateway/2",
            ...headers,
          },
        },
        (response) => {
          const deadline = setTimeout(() => {
            response.destroy(new Error("asset.total_timeout"));
          }, this.#timeoutMs);
          deadline.unref?.();
          const dispose = () => clearTimeout(deadline);
          response.once("end", dispose);
          response.once("close", dispose);
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: response,
            dispose,
          });
        },
      );
      request.once("error", reject);
      request.setTimeout(this.#timeoutMs, () =>
        request.destroy(new Error("asset.request_timeout")),
      );
      request.end();
    });
  }
}

export interface ImportedAsset {
  assetId: string;
  sha256: string;
  path: string;
  mimeType: string;
  bytes: number;
  sourceOrigin: string;
}

export interface AssetGatewayOptions {
  rootDirectory: string;
  resolver?: OutboundResolver;
  transport?: OutboundTransport;
  allowedSchemes?: readonly string[];
  maximumRedirects?: number;
  maximumCompressedBytes?: number;
  maximumDecodedBytes?: number;
  credentialVault?: CredentialVault;
}

export interface AssetImportAuthorization {
  credentialRef: CredentialRef;
  headerName: string;
  allowedOrigins: readonly string[];
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function byteLimit(maximum: number, onBytes?: (bytes: number) => void): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.byteLength;
      onBytes?.(total);
      if (total > maximum) {
        callback(new Error("asset.byte_limit_exceeded"));
        return;
      }
      callback(null, chunk);
    },
  });
}

function contentDecoder(encoding: string | undefined): Transform | undefined {
  switch (encoding?.trim().toLowerCase()) {
    case undefined:
    case "":
    case "identity":
      return undefined;
    case "br":
      return createBrotliDecompress();
    case "gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    default:
      throw new Error("asset.content_encoding_not_supported");
  }
}

export class AssetGateway {
  readonly #rootDirectory: string;
  readonly #resolver?: OutboundResolver;
  readonly #transport: OutboundTransport;
  readonly #allowedSchemes: readonly string[];
  readonly #maximumRedirects: number;
  readonly #maximumCompressedBytes: number;
  readonly #maximumDecodedBytes: number;
  readonly #credentialVault?: CredentialVault;

  constructor(options: AssetGatewayOptions) {
    this.#rootDirectory = path.resolve(options.rootDirectory);
    this.#resolver = options.resolver;
    this.#transport = options.transport ?? new PinnedHttpTransport();
    this.#allowedSchemes = options.allowedSchemes ?? ["https:"];
    this.#maximumRedirects = options.maximumRedirects ?? 5;
    this.#maximumCompressedBytes = options.maximumCompressedBytes ?? 128 * 1024 * 1024;
    this.#maximumDecodedBytes = options.maximumDecodedBytes ?? 512 * 1024 * 1024;
    this.#credentialVault = options.credentialVault;
  }

  async import(input: {
    url: string;
    allowedMimePrefixes: readonly string[];
    expectedMimeType?: string;
    authorization?: AssetImportAuthorization;
  }): Promise<ImportedAsset> {
    if (input.allowedMimePrefixes.length === 0) throw new Error("asset.mime_policy_required");
    let target = await this.#approve(input.url);
    let response: OutboundResponse;
    let redirectsFollowed = 0;
    while (true) {
      response = await this.#transport.open(
        target,
        await this.#authorizationHeaders(target.url, input.authorization),
      );
      if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
      assertRedirectLimit(redirectsFollowed, this.#maximumRedirects);
      const location = firstHeader(response.headers.location);
      response.body.destroy();
      response.dispose();
      if (!location) throw new Error("asset.redirect_location_missing");
      target = await this.#approve(new URL(location, target.url).toString());
      redirectsFollowed += 1;
    }

    try {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`asset.http_status:${response.statusCode}`);
      }
      const contentLength = Number(firstHeader(response.headers["content-length"]));
      if (Number.isFinite(contentLength) && contentLength > this.#maximumCompressedBytes) {
        throw new Error("asset.byte_limit_exceeded");
      }
      const responseMimeType = (firstHeader(response.headers["content-type"]) ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      const expectedMimeType = input.expectedMimeType?.toLowerCase();
      if (
        expectedMimeType &&
        !input.allowedMimePrefixes.some((prefix) => expectedMimeType.startsWith(prefix))
      ) {
        throw new Error("asset.mime_not_allowed");
      }
      const mimeType =
        responseMimeType === "application/octet-stream" && expectedMimeType
          ? expectedMimeType
          : responseMimeType;
      if (!mimeType || !input.allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix))) {
        throw new Error("asset.mime_not_allowed");
      }
      if (expectedMimeType && mimeType !== expectedMimeType) {
        throw new Error("asset.provider_mime_mismatch");
      }

      await mkdir(this.#rootDirectory, { recursive: true, mode: 0o700 });
      const temporaryPath = path.join(this.#rootDirectory, `.import-${randomUUID()}.tmp`);
      const hash = createHash("sha256");
      let decodedBytes = 0;
      const hashStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const compressedLimit = byteLimit(this.#maximumCompressedBytes);
      const decodedLimit = byteLimit(this.#maximumDecodedBytes, (bytes) => {
        decodedBytes = bytes;
      });
      const decoder = contentDecoder(firstHeader(response.headers["content-encoding"]));
      try {
        const destination = createWriteStream(temporaryPath, { mode: 0o600 });
        if (decoder) {
          await pipeline(
            response.body,
            compressedLimit,
            decoder,
            decodedLimit,
            hashStream,
            destination,
          );
        } else {
          await pipeline(response.body, compressedLimit, decodedLimit, hashStream, destination);
        }
        const sha256 = hash.digest("hex");
        const finalPath = path.join(this.#rootDirectory, sha256);
        let reusedExisting = false;
        try {
          await rename(temporaryPath, finalPath);
        } catch (error) {
          try {
            await stat(finalPath);
            reusedExisting = true;
            await rm(temporaryPath, { force: true });
          } catch {
            throw error;
          }
        }
        const detected = await detectMediaTypeFromFile(finalPath);
        if (!detected || detected.mimeType !== mimeType) {
          if (!reusedExisting) await rm(finalPath, { force: true });
          throw new Error("asset.content_type_mismatch");
        }
        return {
          assetId: `sha256:${sha256}`,
          sha256,
          path: finalPath,
          mimeType,
          bytes: decodedBytes,
          sourceOrigin: target.url.origin,
        };
      } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
    } finally {
      response.dispose();
    }
  }

  open(asset: ImportedAsset): Readable {
    if (!asset.path.startsWith(`${path.resolve(this.#rootDirectory)}${path.sep}`)) {
      throw new Error("asset.path_outside_gateway");
    }
    return createReadStream(asset.path);
  }

  async #authorizationHeaders(
    url: URL,
    authorization?: AssetImportAuthorization,
  ): Promise<Record<string, string>> {
    if (!authorization) return {};
    if (
      authorization.headerName !== "authorization" &&
      !/^x-[a-z0-9-]+$/.test(authorization.headerName)
    ) {
      throw new Error("asset.authorization_header_invalid");
    }
    const allowedOrigins = authorization.allowedOrigins.map((origin) => {
      const parsed = new URL(origin);
      if (
        parsed.protocol !== "https:" ||
        parsed.origin !== origin ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("asset.authorization_origin_invalid");
      }
      return parsed.origin;
    });
    if (!allowedOrigins.includes(url.origin)) return {};
    if (!this.#credentialVault) throw new Error("asset.credential_vault_unavailable");
    const credential = await this.#credentialVault.get(authorization.credentialRef);
    if (!credential) throw new Error("asset.credential_missing");
    if (/[\0\r\n]/.test(credential)) throw new Error("asset.credential_invalid");
    return { [authorization.headerName]: credential };
  }

  #approve(url: string): Promise<ApprovedOutboundTarget> {
    return approveOutboundUrl(url, {
      allowedSchemes: this.#allowedSchemes,
      ...(this.#resolver ? { resolver: this.#resolver } : {}),
    });
  }
}
