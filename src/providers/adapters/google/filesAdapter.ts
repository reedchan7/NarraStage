import type { FilesUploadPort, OperationContext, OperationRequest } from "@/providers/ports";
import {
  fileUploadInputSchema,
  type FileUploadInput,
  type ProviderFileAssetResolver,
} from "@/providers/ports/files";
import { resolveGoogleOffering } from "@/providers/adapters/google/manifest";
import { normalizeGoogleError } from "@/providers/adapters/google/errors";
import { GoogleTransport } from "@/providers/adapters/google/transport";

function waitForFilePoll(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class GoogleFilesAdapter implements FilesUploadPort {
  readonly operation = "files.upload" as const;
  readonly #transport: GoogleTransport;
  readonly #assetResolver?: ProviderFileAssetResolver;

  constructor(transport = new GoogleTransport(), assetResolver?: ProviderFileAssetResolver) {
    this.#transport = transport;
    this.#assetResolver = assetResolver;
  }

  async upload(request: OperationRequest<FileUploadInput>, context: OperationContext = {}) {
    try {
      resolveGoogleOffering(request.offeringId);
      const input = fileUploadInputSchema.parse(request.input);
      if ("source" in input) return await this.#uploadOwnedAsset(input, context);
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (bytes.byteLength !== input.byteLength)
        throw new Error("google.file_byte_length_mismatch");
      if (context.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
      const result = await (await this.#transport.provider()).files().uploadFile({
        data: { type: "data", data: bytes },
        mediaType: input.mediaType,
        filename: input.filename,
        providerOptions: {
          google: { displayName: input.filename, pollTimeoutMs: 5 * 60 * 1_000 },
        },
      });
      const fileId = result.providerReference.google;
      if (!fileId) throw new Error("google.file_reference_missing");
      const metadata = result.providerMetadata?.google;
      const expiresAt =
        typeof metadata?.expirationTime === "string" ? metadata.expirationTime : undefined;
      return {
        schemaVersion: "1.0.0" as const,
        providerId: "google",
        fileId,
        mediaType: result.mediaType ?? input.mediaType,
        filename: input.filename,
        byteLength: input.byteLength,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }

  async #uploadOwnedAsset(
    input: Extract<FileUploadInput, { source: "owned_asset" }>,
    context: OperationContext,
  ) {
    if (!this.#assetResolver) throw new Error("provider.asset_resolver_unavailable");
    const asset = await this.#assetResolver.resolveFile(input.assetId, context);
    if (asset.byteLength > 2 * 1024 * 1024 * 1024) {
      throw new Error("google.file_byte_limit_exceeded");
    }
    const filename = input.filename ?? asset.filename ?? "upload";
    const client = await this.#transport.nativeClient();
    let file = await client.files.upload({
      file: asset.source.kind === "path" ? asset.source.path : asset.source.blob,
      config: {
        mimeType: asset.mimeType,
        displayName: filename,
        ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
      },
    });
    const deadline = Date.now() + 5 * 60 * 1_000;
    let delayMs = 250;
    while (file.state === "PROCESSING") {
      if (!file.name) throw new Error("google.file_reference_missing");
      if (Date.now() >= deadline) throw new Error("google.file_processing_timeout");
      await waitForFilePoll(delayMs, context.abortSignal);
      file = await client.files.get({
        name: file.name,
        ...(context.abortSignal ? { config: { abortSignal: context.abortSignal } } : {}),
      });
      delayMs = Math.min(delayMs * 2, 2_000);
    }
    if (file.state === "FAILED") throw new Error("google.file_processing_failed");
    if (!file.uri) throw new Error("google.file_reference_missing");
    return {
      schemaVersion: "1.0.0" as const,
      providerId: "google",
      fileId: file.uri,
      mediaType: file.mimeType ?? asset.mimeType,
      filename,
      byteLength: file.sizeBytes ? Number(file.sizeBytes) : asset.byteLength,
      ...(file.expirationTime ? { expiresAt: new Date(file.expirationTime).toISOString() } : {}),
    };
  }
}
