import type { FilesUploadPort, OperationContext, OperationRequest } from "@/providers/ports";
import {
  fileUploadInputSchema,
  type FileUploadInput,
  type ProviderFileAssetResolver,
} from "@/providers/ports/files";
import { resolveDeepSeekOffering } from "@/providers/adapters/deepseek/manifest";
import { normalizeDeepSeekError } from "@/providers/adapters/deepseek/errors";
import { DeepSeekTransport } from "@/providers/adapters/deepseek/transport";
import { deepSeekManifest } from "@/providers/adapters/deepseek/manifest";
import {
  decodeDeepSeekBase64,
  validateDeepSeekImageBytes,
} from "@/providers/adapters/deepseek/visionAdapter";

export class DeepSeekFilesAdapter implements FilesUploadPort {
  readonly operation = "files.upload" as const;
  readonly #transport: DeepSeekTransport;
  readonly #assetResolver?: ProviderFileAssetResolver;

  constructor(transport = new DeepSeekTransport(), assetResolver?: ProviderFileAssetResolver) {
    this.#transport = transport;
    this.#assetResolver = assetResolver;
  }

  async upload(request: OperationRequest<FileUploadInput>, context: OperationContext = {}) {
    try {
      const offering = resolveDeepSeekOffering(request.offeringId);
      if (!offering.vision) throw new Error("deepseek.files_require_vision_offering");
      const input = fileUploadInputSchema.parse(request.input);
      const owned =
        "source" in input
          ? await this.#assetResolver?.resolveFile(input.assetId, context)
          : undefined;
      if ("source" in input && !owned) throw new Error("provider.asset_resolver_unavailable");
      const bytes =
        "source" in input
          ? Buffer.from(
              await (
                owned!.source.kind === "path" ? Bun.file(owned!.source.path) : owned!.source.blob
              ).arrayBuffer(),
            )
          : decodeDeepSeekBase64(input.dataBase64);
      const byteLength = "source" in input ? owned!.byteLength : input.byteLength;
      const mediaType = "source" in input ? owned!.mimeType : input.mediaType;
      const filename =
        input.filename ?? ("source" in input ? owned!.filename : undefined) ?? "upload";
      if (bytes.byteLength !== byteLength) {
        throw new Error("deepseek.file_byte_length_mismatch");
      }
      if (bytes.byteLength > deepSeekManifest.visionLimits.maximumProviderFileBytes) {
        throw new Error("deepseek.image_byte_limit_exceeded");
      }
      if (
        !deepSeekManifest.visionLimits.supportedMediaTypes.includes(
          mediaType as (typeof deepSeekManifest.visionLimits.supportedMediaTypes)[number],
        )
      ) {
        throw new Error("deepseek.image_media_type_unsupported");
      }
      validateDeepSeekImageBytes(bytes, mediaType);
      if (context.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
      const result = await (
        await this.#transport.files(context.abortSignal)
      ).uploadFile({
        data: { type: "data", data: bytes },
        mediaType,
        filename,
        ...(input.expiresAfterSeconds
          ? { providerOptions: { deepseek: { expiresAfter: input.expiresAfterSeconds } } }
          : {}),
      });
      const fileId = result.providerReference.deepseek;
      if (!fileId) throw new Error("deepseek.file_reference_missing");
      const metadata = result.providerMetadata?.deepseek;
      const expiresAtValue = metadata?.expiresAt;
      const expiresAt =
        typeof expiresAtValue === "number"
          ? new Date(expiresAtValue * 1_000).toISOString()
          : typeof expiresAtValue === "string"
            ? new Date(expiresAtValue).toISOString()
            : undefined;
      return {
        schemaVersion: "1.0.0" as const,
        providerId: "deepseek",
        fileId,
        mediaType: result.mediaType ?? mediaType,
        filename: result.filename ?? filename,
        byteLength,
        ...(expiresAt ? { expiresAt } : {}),
      };
    } catch (cause) {
      throw normalizeDeepSeekError(cause);
    }
  }
}
