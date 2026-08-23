import { z } from "zod";
import type { OperationContext, OperationRequest, VideoStatusResult } from "@/providers/ports";
import type { CapabilityInput } from "@/providers/domain/capabilities";
import type { ProviderAssetResolver } from "@/providers/ports/video";
import { normalizeGoogleError } from "@/providers/adapters/google/errors";
import { decodeGoogleHandle, encodeGoogleHandle } from "@/providers/adapters/google/handle";
import {
  googleOutputAuthorization,
  resolveGoogleOffering,
} from "@/providers/adapters/google/manifest";
import { GoogleTransport } from "@/providers/adapters/google/transport";

const valuesSchema = z
  .object({
    prompt: z.string().min(1).max(32_000),
    durationSeconds: z.number().int().min(3).max(10).optional(),
    resolution: z.literal("720P").optional(),
    aspectRatio: z.enum(["16:9", "9:16"]).optional(),
  })
  .strict();

export class GoogleOmniAdapter {
  readonly #transport: GoogleTransport;
  readonly #assetResolver?: ProviderAssetResolver;

  constructor(transport = new GoogleTransport(), assetResolver?: ProviderAssetResolver) {
    this.#transport = transport;
    this.#assetResolver = assetResolver;
  }

  async start(request: OperationRequest<CapabilityInput>, context: OperationContext = {}) {
    try {
      const offering = resolveGoogleOffering(request.offeringId);
      if (offering.kind !== "omni-video") throw new Error("google.omni_offering_required");
      const values = valuesSchema.parse(request.input.values);
      if (!["text", "images", "edit"].includes(request.input.mode ?? "")) {
        throw new Error("google.omni_mode_invalid");
      }
      if (request.input.mode === "text" && request.input.assets.length) {
        throw new Error("google.omni_text_assets_not_allowed");
      }
      if (request.input.assets.length > 6) throw new Error("google.omni_image_count_exceeded");
      if (request.input.mode === "edit") {
        if (request.input.assets.length) throw new Error("google.omni_edit_assets_not_allowed");
        if (
          !context.continuation ||
          context.continuation.providerId !== "google" ||
          context.continuation.offeringId !== request.offeringId ||
          context.continuation.providerModelId !== offering.providerModelId
        ) {
          throw new Error("google.omni_edit_continuation_required");
        }
      } else if (context.continuation) {
        throw new Error("google.omni_continuation_requires_edit_mode");
      }
      if (request.input.assets.length && !this.#assetResolver) {
        throw new Error("provider.asset_resolver_unavailable");
      }

      const mediaInput: Array<Record<string, unknown>> = [];
      for (const asset of request.input.assets) {
        if (asset.kind !== "image" || !["first_frame", "reference_image"].includes(asset.role)) {
          throw new Error("google.omni_only_image_references_supported");
        }
        const resolved = await this.#assetResolver!.resolve(asset, context);
        if (resolved.source.kind === "url") {
          mediaInput.push({
            type: "image",
            uri: resolved.source.url,
            mime_type: resolved.mimeType,
          });
        } else {
          mediaInput.push({
            type: "image",
            data: Buffer.from(await resolved.source.blob.arrayBuffer()).toString("base64"),
            mime_type: resolved.mimeType,
          });
        }
      }
      const sourceRoles = request.input.assets
        .map((asset, index) =>
          asset.role === "first_frame" ? `<FIRST_FRAME>@Image${index + 1}` : undefined,
        )
        .filter((value): value is string => Boolean(value));
      const referenceRoles = request.input.assets
        .map((asset, index) =>
          asset.role === "reference_image" ? `<IMAGE_REF_${index}>@Image${index + 1}` : undefined,
        )
        .filter((value): value is string => Boolean(value));
      const declarations = [
        sourceRoles.length ? `[# Sources ${sourceRoles.join(" ")}]` : undefined,
        referenceRoles.length ? `[# References ${referenceRoles.join(" ")}]` : undefined,
      ].filter((value): value is string => Boolean(value));
      const prompt = declarations.length
        ? `${declarations.join(" ")} ${values.prompt}`
        : values.prompt;
      const task =
        request.input.mode === "edit"
          ? "edit"
          : mediaInput.length
            ? request.input.assets.some((asset) => asset.role === "reference_image")
              ? "reference_to_video"
              : "image_to_video"
            : "text_to_video";
      const interaction = await (
        await this.#transport.nativeClient()
      ).interactions.create({
        model: offering.providerModelId,
        ...(context.continuation
          ? { previous_interaction_id: context.continuation.providerRequestId }
          : {}),
        input: mediaInput.length ? [...mediaInput, { type: "text", text: prompt }] : prompt,
        store: true,
        stream: false,
        background: true,
        response_format: {
          type: "video",
          delivery: "uri",
          ...(values.aspectRatio ? { aspect_ratio: values.aspectRatio } : {}),
          ...(values.durationSeconds ? { duration: `${values.durationSeconds}s` } : {}),
          resolution: "720p",
        },
        generation_config: {
          video_config: {
            task,
          },
        },
      });
      return {
        providerHandle: encodeGoogleHandle({
          v: 1,
          kind: "omni",
          modelId: offering.providerModelId,
          interactionId: interaction.id,
        }),
        providerOutcome:
          interaction.status === "queued" ? ("queued" as const) : ("running" as const),
      };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }

  async status(providerHandle: string, context: OperationContext = {}): Promise<VideoStatusResult> {
    try {
      const handle = decodeGoogleHandle(providerHandle);
      if (handle.kind !== "omni") throw new Error("google.omni_handle_required");
      const interaction = await (
        await this.#transport.nativeClient()
      ).interactions.get(handle.interactionId);
      if (["queued", "in_progress", "requires_action"].includes(interaction.status)) {
        return {
          outcome: interaction.status === "queued" ? "queued" : "running",
          retryAfterMs: 5_000,
        };
      }
      if (interaction.status === "cancelled") return { outcome: "cancelled" };
      if (interaction.status !== "completed") {
        return {
          outcome: "failed",
          error: {
            category: "invalid_response",
            code: `google.omni_${interaction.status}`,
            message: "Gemini Omni generation failed",
            retryable: false,
            ...(interaction.errors ? { detail: { errors: interaction.errors } } : {}),
          },
        };
      }
      const output = interaction.output_video;
      if (!output) throw new Error("google.output_video_missing");
      const mimeType = output.mime_type ?? "video/mp4";
      const providerOutput = output.data
        ? { kind: "video" as const, bytes: Buffer.from(output.data, "base64"), mimeType }
        : output.uri
          ? {
              kind: "video" as const,
              url: output.uri,
              mimeType,
              authorization: googleOutputAuthorization,
            }
          : undefined;
      if (!providerOutput) throw new Error("google.output_video_missing");
      return {
        outcome: "succeeded",
        outputs: [providerOutput],
        providerRequestId: interaction.id,
      };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }

  async cancel(providerHandle: string) {
    try {
      const handle = decodeGoogleHandle(providerHandle);
      if (handle.kind !== "omni") throw new Error("google.omni_handle_required");
      const interaction = await (
        await this.#transport.nativeClient()
      ).interactions.cancel(handle.interactionId);
      return {
        outcome:
          interaction.status === "cancelled" ? ("confirmed" as const) : ("accepted" as const),
      };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }
}
