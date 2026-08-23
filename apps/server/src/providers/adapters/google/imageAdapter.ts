import { z } from "zod";
import type {
  ImageEditPort,
  ImageGeneratePort,
  ImageOperationResult,
  OperationContext,
  OperationRequest,
} from "@/providers/ports";
import type { CapabilityInput } from "@/providers/domain/capabilities";
import type { ProviderAssetResolver } from "@/providers/ports/video";
import { detectMediaType } from "@/assets/metadata";
import { resolveGoogleOffering } from "@/providers/adapters/google/manifest";
import { normalizeGoogleError } from "@/providers/adapters/google/errors";
import { GoogleTransport } from "@/providers/adapters/google/transport";

const imageValuesSchema = z
  .object({
    prompt: z.string().min(1).max(32_000),
    aspectRatio: z
      .enum([
        "1:1",
        "1:4",
        "1:8",
        "2:3",
        "3:2",
        "3:4",
        "4:1",
        "4:3",
        "4:5",
        "5:4",
        "8:1",
        "9:16",
        "16:9",
        "21:9",
      ])
      .optional(),
    imageSize: z.enum(["512", "1K", "2K", "4K"]).optional(),
    grounding: z.boolean().optional(),
    includeText: z.boolean().optional(),
  })
  .strict();

export interface GoogleImageAdapterOptions {
  assetResolver?: ProviderAssetResolver;
}

class GoogleImageExecutor {
  readonly #operation: "image.generate" | "image.edit";
  readonly #transport: GoogleTransport;
  readonly #assetResolver?: ProviderAssetResolver;

  constructor(
    operation: "image.generate" | "image.edit",
    transport = new GoogleTransport(),
    options: GoogleImageAdapterOptions = {},
  ) {
    this.#operation = operation;
    this.#transport = transport;
    this.#assetResolver = options.assetResolver;
  }

  async execute(
    request: OperationRequest<CapabilityInput>,
    context: OperationContext = {},
  ): Promise<ImageOperationResult> {
    try {
      const offering = resolveGoogleOffering(request.offeringId);
      if (offering.kind !== "image") throw new Error("google.image_offering_required");
      const values = imageValuesSchema.parse(request.input.values);
      if (
        values.imageSize &&
        !(offering.imageSizes as readonly string[]).includes(values.imageSize)
      ) {
        throw new Error("google.image_size_not_supported");
      }
      if (values.grounding && !offering.grounding) {
        throw new Error("google.image_grounding_not_supported");
      }
      if (request.input.assets.length > offering.maximumReferenceImages) {
        throw new Error("google.image_reference_count_exceeded");
      }
      if (this.#operation === "image.edit" && request.input.assets.length === 0) {
        throw new Error("google.image_edit_reference_required");
      }
      if (request.input.assets.length && !this.#assetResolver) {
        throw new Error("provider.asset_resolver_unavailable");
      }
      const input: Array<Record<string, unknown>> = [{ type: "text", text: values.prompt }];
      for (const asset of request.input.assets) {
        if (asset.kind !== "image" || asset.role !== "reference_image") {
          throw new Error("google.image_reference_role_invalid");
        }
        const resolved = await this.#assetResolver!.resolve(asset, context);
        if (resolved.source.kind === "url") {
          input.push({ type: "image", uri: resolved.source.url, mime_type: resolved.mimeType });
        } else {
          input.push({
            type: "image",
            data: Buffer.from(await resolved.source.blob.arrayBuffer()).toString("base64"),
            mime_type: resolved.mimeType,
          });
        }
      }
      const interaction = await (
        await this.#transport.nativeClient()
      ).interactions.create({
        model: offering.providerModelId,
        input: input.length === 1 ? values.prompt : input,
        store: false,
        stream: false,
        background: false,
        ...(values.grounding ? { tools: [{ type: "google_search" }] } : {}),
        response_format: [
          ...(values.includeText ? [{ type: "text" }] : []),
          {
            type: "image",
            mime_type: "image/jpeg",
            ...(values.aspectRatio ? { aspect_ratio: values.aspectRatio } : {}),
            ...(values.imageSize ? { image_size: values.imageSize } : {}),
          },
        ],
      });
      if (interaction.status !== "completed") throw new Error("google.response_not_completed");
      const output = interaction.output_image;
      if (!output?.data) throw new Error("google.output_image_missing");
      const bytes = Buffer.from(output.data, "base64");
      const detected = detectMediaType(bytes);
      if (!detected || detected.kind !== "image") throw new Error("google.output_image_invalid");
      if (output.mime_type && output.mime_type.toLowerCase() !== detected.mimeType) {
        throw new Error("google.output_image_mime_mismatch");
      }
      return {
        outputs: [{ kind: "image", bytes, mimeType: detected.mimeType }],
        providerRequestId: interaction.id,
        ...(interaction.output_text ? { text: interaction.output_text } : {}),
        ...(interaction.usage ? { usage: interaction.usage } : {}),
        providerMetadata: {
          status: interaction.status,
          ...(interaction.steps ? { steps: interaction.steps } : {}),
        },
      };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }
}

export class GoogleImageGenerateAdapter implements ImageGeneratePort {
  readonly operation = "image.generate" as const;
  readonly #executor: GoogleImageExecutor;

  constructor(transport = new GoogleTransport(), options: GoogleImageAdapterOptions = {}) {
    this.#executor = new GoogleImageExecutor(this.operation, transport, options);
  }

  generate(request: OperationRequest<CapabilityInput>, context?: OperationContext) {
    return this.#executor.execute(request, context);
  }
}

export class GoogleImageEditAdapter implements ImageEditPort {
  readonly operation = "image.edit" as const;
  readonly #executor: GoogleImageExecutor;

  constructor(transport = new GoogleTransport(), options: GoogleImageAdapterOptions = {}) {
    this.#executor = new GoogleImageExecutor(this.operation, transport, options);
  }

  edit(request: OperationRequest<CapabilityInput>, context?: OperationContext) {
    return this.#executor.execute(request, context);
  }
}
