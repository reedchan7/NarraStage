import { z } from "zod";
import { falH3Manifest } from "@/providers/adapters/fal/manifest";
import { normalizeFalError } from "@/providers/adapters/fal/errors";
import { FalQueueTransport } from "@/providers/adapters/fal/transport";
import { parseH3Input } from "@/providers/adapters/minimax/h3Schema";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import type {
  OperationContext,
  OperationRequest,
  ProviderAssetResolver,
  ResolvedProviderAsset,
  VideoCancelPort,
  VideoGeneratePort,
  VideoStatusPort,
} from "@/providers/ports";

const falH3ResultSchema = z
  .object({
    video: z
      .object({
        url: z.string().url(),
        content_type: z.string().min(1).optional(),
        file_name: z.string().optional(),
        file_size: z.number().nonnegative().optional(),
      })
      .passthrough(),
    expanded_prompt: z.string().nullable().optional(),
  })
  .passthrough();

export interface FalH3AdapterOptions {
  transport: FalQueueTransport;
  assetResolver: ProviderAssetResolver;
}

export function createFalH3Ports(
  options: FalH3AdapterOptions,
): readonly [VideoGeneratePort, VideoStatusPort, VideoCancelPort] {
  const generate: VideoGeneratePort = {
    operation: "video.generate",
    async start(request, context) {
      try {
        if (request.offeringId !== falH3Manifest.offeringId)
          throw new Error("fal.offering_unsupported");
        const input = parseH3Input(request.input, request.offeringId);
        const assets = await Promise.all(
          input.assets.map(async (asset) => ({
            asset,
            url: await falAssetUrl(await options.assetResolver.resolve(asset, context), options),
          })),
        );
        const endpoint = falH3Manifest.endpoints[input.mode];
        const wire: Record<string, unknown> = {
          prompt: input.values.prompt,
          duration: input.values.durationSeconds,
          resolution: input.values.resolution,
          sync_mode: false,
          ...(input.values.seed !== undefined ? { seed: input.values.seed } : {}),
          ...(input.values.enablePromptExpansion !== undefined
            ? { enable_prompt_expansion: input.values.enablePromptExpansion }
            : {}),
          ...(input.values.promptExpansionMode
            ? { prompt_expansion_mode: input.values.promptExpansionMode }
            : {}),
          ...(input.values.enableSafetyChecker !== undefined
            ? { enable_safety_checker: input.values.enableSafetyChecker }
            : {}),
        };
        if (input.mode === "text") wire.aspect_ratio = input.values.aspectRatio;
        if (input.mode === "keyframes") {
          wire.image_url = assets.find(({ asset }) => asset.role === "first_frame")?.url;
          const end = assets.find(({ asset }) => asset.role === "last_frame")?.url;
          if (end) wire.end_image_url = end;
        }
        if (input.mode === "reference") {
          wire.aspect_ratio = input.values.aspectRatio ?? "adaptive";
          wire.reference_image_urls = assets
            .filter(({ asset }) => asset.role === "reference_image")
            .map(({ url }) => url);
          wire.reference_video_urls = assets
            .filter(({ asset }) => asset.role === "reference_video")
            .map(({ url }) => url);
          wire.reference_audio_urls = assets
            .filter(({ asset }) => asset.role === "reference_audio")
            .map(({ url }) => url);
        }
        const providerHandle = await options.transport.submit(endpoint, wire, context);
        return { providerHandle, providerOutcome: "queued" };
      } catch (cause) {
        throw normalizeFalError(cause);
      }
    },
  };

  const status: VideoStatusPort = {
    operation: "video.status",
    async status(providerHandle, context) {
      try {
        const remote = await options.transport.status(providerHandle, context);
        if (remote.outcome === "queued") return { outcome: "queued", retryAfterMs: 10_000 };
        if (remote.outcome === "running") return { outcome: "running", retryAfterMs: 10_000 };
        if (remote.outcome === "failed") {
          return {
            outcome: "failed",
            error: {
              category: "unavailable",
              code: remote.code,
              message: remote.message,
              retryable: false,
            },
          };
        }
        const result = falH3ResultSchema.safeParse(
          await options.transport.result(providerHandle, context),
        );
        if (!result.success) throw new Error("fal.result_invalid");
        return {
          outcome: "succeeded",
          outputs: [
            {
              kind: "video",
              url: result.data.video.url,
              ...(result.data.video.content_type
                ? { mimeType: result.data.video.content_type }
                : {}),
            },
          ],
        };
      } catch (cause) {
        const normalized = normalizeFalError(cause);
        if (normalized instanceof ProviderExecutionError) throw normalized;
        throw cause;
      }
    },
  };

  const cancel: VideoCancelPort = {
    operation: "video.cancel",
    async cancel(providerHandle, context) {
      try {
        return { outcome: await options.transport.cancel(providerHandle, context) };
      } catch (cause) {
        throw normalizeFalError(cause);
      }
    },
  };
  return [generate, status, cancel];
}

async function falAssetUrl(
  asset: ResolvedProviderAsset,
  options: FalH3AdapterOptions,
): Promise<string> {
  if (asset.source.kind === "url") return asset.source.url;
  return options.transport.upload(asset.source.blob);
}
