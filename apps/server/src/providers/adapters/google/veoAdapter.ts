import { z } from "zod";
import type {
  OperationContext,
  OperationRequest,
  VideoCancelPort,
  VideoGeneratePort,
  VideoStatusPort,
  VideoStatusResult,
} from "@/providers/ports";
import type { CapabilityInput } from "@/providers/domain/capabilities";
import { validateCapabilityInput } from "@/providers/domain/capabilities";
import { createGoogleVeoCapabilitySchema } from "@/providers/contracts/googleVeo";
import type { ProviderAssetResolver, ResolvedProviderAsset } from "@/providers/ports/video";
import { normalizeGoogleError } from "@/providers/adapters/google/errors";
import { decodeGoogleHandle, encodeGoogleHandle } from "@/providers/adapters/google/handle";
import {
  googleOutputAuthorization,
  resolveGoogleOffering,
} from "@/providers/adapters/google/manifest";
import { GoogleTransport } from "@/providers/adapters/google/transport";

const valuesSchema = z
  .object({
    prompt: z.string().min(1).max(7_000),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    resolution: z.enum(["720P", "1080P", "4K"]),
    aspectRatio: z.enum(["16:9", "9:16"]),
    seed: z.number().int().optional(),
    negativePrompt: z.string().max(7_000).optional(),
    enhancePrompt: z.boolean().optional(),
  })
  .strict();

async function nativeImage(asset: ResolvedProviderAsset) {
  if (asset.kind !== "image") throw new Error("google.veo_image_required");
  if (asset.source.kind === "url") throw new Error("google.veo_remote_image_not_owned");
  return {
    imageBytes: Buffer.from(await asset.source.blob.arrayBuffer()).toString("base64"),
    mimeType: asset.mimeType,
  };
}

async function nativeVideo(asset: ResolvedProviderAsset) {
  if (asset.kind !== "video") throw new Error("google.veo_video_required");
  if (asset.source.kind === "url") throw new Error("google.veo_remote_video_not_owned");
  return {
    videoBytes: Buffer.from(await asset.source.blob.arrayBuffer()).toString("base64"),
    mimeType: asset.mimeType,
  };
}

export class GoogleVeoAdapter implements VideoGeneratePort {
  readonly operation = "video.generate" as const;
  readonly #transport: GoogleTransport;
  readonly #assetResolver?: ProviderAssetResolver;

  constructor(transport = new GoogleTransport(), assetResolver?: ProviderAssetResolver) {
    this.#transport = transport;
    this.#assetResolver = assetResolver;
  }

  async start(request: OperationRequest<CapabilityInput>, context: OperationContext = {}) {
    try {
      const offering = resolveGoogleOffering(request.offeringId);
      if (offering.kind !== "veo-video") throw new Error("google.veo_offering_required");
      const validation = validateCapabilityInput(
        createGoogleVeoCapabilitySchema({
          id: "google:veo-runtime:v1",
          resolutions: [...offering.resolutions],
          advanced: offering.referenceImages || offering.extension,
        }),
        request.input,
        { hasContinuation: Boolean(context.continuation) },
      );
      if (validation.violations[0]) throw new Error(validation.violations[0].code);
      const values = valuesSchema.parse(request.input.values);
      if (!(offering.resolutions as readonly string[]).includes(values.resolution)) {
        throw new Error("google.veo_resolution_not_supported");
      }
      if (values.resolution !== "720P" && values.durationSeconds !== 8) {
        throw new Error("google.veo_high_resolution_requires_eight_seconds");
      }
      if (request.input.assets.length && !this.#assetResolver) {
        throw new Error("provider.asset_resolver_unavailable");
      }
      const resolved = await Promise.all(
        request.input.assets.map((asset) => this.#assetResolver!.resolve(asset, context)),
      );
      const config: Record<string, unknown> = {
        numberOfVideos: 1,
        durationSeconds: values.durationSeconds,
        resolution:
          values.resolution === "720P" ? "720p" : values.resolution === "1080P" ? "1080p" : "4k",
        aspectRatio: values.aspectRatio,
        generateAudio: true,
        ...(values.seed === undefined ? {} : { seed: values.seed }),
        ...(values.negativePrompt ? { negativePrompt: values.negativePrompt } : {}),
        ...(values.enhancePrompt === undefined ? {} : { enhancePrompt: values.enhancePrompt }),
      };
      const params: Record<string, unknown> = {
        model: offering.providerModelId,
        prompt: values.prompt,
        config,
      };

      if (request.input.mode === "text") {
        if (resolved.length) throw new Error("google.veo_text_assets_not_allowed");
        config.personGeneration = "allow_all";
      } else if (request.input.mode === "keyframes") {
        const firstIndex = request.input.assets.findIndex((asset) => asset.role === "first_frame");
        const lastIndex = request.input.assets.findIndex((asset) => asset.role === "last_frame");
        if (firstIndex < 0 || resolved.length > 2)
          throw new Error("google.veo_first_frame_required");
        params.image = await nativeImage(resolved[firstIndex]!);
        if (lastIndex >= 0) config.lastFrame = await nativeImage(resolved[lastIndex]!);
        config.personGeneration = "allow_adult";
      } else if (request.input.mode === "reference") {
        if (!offering.referenceImages) throw new Error("google.veo_references_not_supported");
        if (resolved.length < 1 || resolved.length > 3) {
          throw new Error("google.veo_reference_count_invalid");
        }
        if (values.durationSeconds !== 8)
          throw new Error("google.veo_references_require_eight_seconds");
        config.referenceImages = await Promise.all(
          resolved.map(async (asset) => ({
            image: await nativeImage(asset),
            referenceType: "ASSET",
          })),
        );
        config.personGeneration = "allow_adult";
      } else if (request.input.mode === "extend") {
        if (!offering.extension) throw new Error("google.veo_extension_not_supported");
        if (resolved.length !== 1 || request.input.assets[0]?.role !== "source_video") {
          throw new Error("google.veo_extension_video_required");
        }
        if (values.durationSeconds !== 8 || values.resolution !== "720P") {
          throw new Error("google.veo_extension_requires_eight_seconds_720p");
        }
        params.video = await nativeVideo(resolved[0]!);
        config.personGeneration = "allow_all";
      } else {
        throw new Error("google.veo_mode_invalid");
      }

      const operation = await (await this.#transport.nativeClient()).models.generateVideos(params);
      if (!operation.name) throw new Error("google.response_operation_missing");
      return {
        providerHandle: encodeGoogleHandle({
          v: 1,
          kind: "veo",
          modelId: offering.providerModelId,
          operationName: operation.name,
        }),
        providerOutcome: operation.done ? ("running" as const) : ("queued" as const),
      };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }

  async status(providerHandle: string, context: OperationContext = {}): Promise<VideoStatusResult> {
    try {
      const handle = decodeGoogleHandle(providerHandle);
      if (handle.kind !== "veo") throw new Error("google.veo_handle_required");
      const operation = await (
        await this.#transport.nativeClient()
      ).operations.getVideosOperation({ operation: { name: handle.operationName } });
      if (!operation.done) return { outcome: "running", retryAfterMs: 10_000 };
      if (operation.error) {
        return {
          outcome: "failed",
          error: {
            category: "invalid_response",
            code: "google.veo_generation_failed",
            message: "Veo generation failed",
            retryable: false,
            detail: operation.error,
          },
        };
      }
      const videos = operation.response?.generatedVideos ?? [];
      if (!videos.length) throw new Error("google.output_video_missing");
      const outputs = await Promise.all(
        videos.map(async ({ video }) => {
          if (!video) throw new Error("google.output_video_missing");
          const mimeType = video.mimeType ?? "video/mp4";
          if (video.videoBytes) {
            return {
              kind: "video" as const,
              bytes: Buffer.from(video.videoBytes, "base64"),
              mimeType,
            };
          }
          if (!video.uri) throw new Error("google.output_video_missing");
          return {
            kind: "video" as const,
            url: video.uri,
            mimeType,
            authorization: googleOutputAuthorization,
          };
        }),
      );
      return { outcome: "succeeded", outputs, providerRequestId: handle.operationName };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }

  async cancel(providerHandle: string, _context?: OperationContext) {
    try {
      const handle = decodeGoogleHandle(providerHandle);
      if (handle.kind !== "veo") throw new Error("google.veo_handle_required");
      return { outcome: "not_supported" as const };
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }
}

export class GoogleVeoStatusAdapter implements VideoStatusPort {
  readonly operation = "video.status" as const;
  readonly #delegate: GoogleVeoAdapter;
  constructor(delegate: GoogleVeoAdapter) {
    this.#delegate = delegate;
  }
  status(providerHandle: string, context?: OperationContext) {
    return this.#delegate.status(providerHandle, context);
  }
}

export class GoogleVeoCancelAdapter implements VideoCancelPort {
  readonly operation = "video.cancel" as const;
  readonly #delegate: GoogleVeoAdapter;
  constructor(delegate: GoogleVeoAdapter) {
    this.#delegate = delegate;
  }
  cancel(providerHandle: string, context?: OperationContext) {
    return this.#delegate.cancel(providerHandle, context);
  }
}
