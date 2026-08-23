import { parseH3Input } from "@/providers/adapters/minimax/h3Schema";
import { miniMaxH3Manifest } from "@/providers/adapters/minimax/h3Manifest";
import { normalizeMiniMaxError } from "@/providers/adapters/minimax/errors";
import type { MiniMaxOfficialTransport } from "@/providers/adapters/minimax/officialTransport";
import type {
  ProviderAssetResolver,
  ResolvedProviderAsset,
  VideoCancelPort,
  VideoGeneratePort,
  VideoStatusPort,
} from "@/providers/ports";

export function createMiniMaxOfficialH3Ports(options: {
  transport: MiniMaxOfficialTransport;
  assetResolver: ProviderAssetResolver;
}): readonly [VideoGeneratePort, VideoStatusPort, VideoCancelPort] {
  const generate: VideoGeneratePort = {
    operation: "video.generate",
    async start(request, context) {
      try {
        if (request.offeringId !== miniMaxH3Manifest.offeringId)
          throw new Error("minimax.offering_unsupported");
        const input = parseH3Input(request.input, request.offeringId);
        const resolved = await Promise.all(
          input.assets.map(async (asset) => ({
            asset,
            resolved: await options.assetResolver.resolve(asset, context),
          })),
        );
        const content: Array<Record<string, unknown>> = [
          { type: "text", text: input.values.prompt },
        ];
        for (const { asset, resolved: materialized } of resolved) {
          const url = await miniMaxAssetUrl(materialized);
          if (asset.kind === "image") {
            content.push({ type: "image_url", image_url: { url }, role: asset.role });
          } else if (asset.kind === "video") {
            content.push({ type: "video_url", video_url: { url }, role: asset.role });
          } else {
            content.push({ type: "audio_url", audio_url: { url }, role: asset.role });
          }
        }
        const body = JSON.stringify({
          model: miniMaxH3Manifest.providerModelId,
          content,
          duration: input.values.durationSeconds,
          resolution: input.values.resolution,
          ratio:
            input.mode === "text"
              ? input.values.aspectRatio
              : input.mode === "keyframes"
                ? "adaptive"
                : (input.values.aspectRatio ?? "adaptive"),
        });
        if (Buffer.byteLength(body) > 64 * 1024 * 1024)
          throw new Error("minimax.request_body_too_large");
        const providerHandle = await options.transport.submit(JSON.parse(body), context);
        return { providerHandle, providerOutcome: "queued" };
      } catch (cause) {
        throw normalizeMiniMaxError(cause);
      }
    },
  };

  const status: VideoStatusPort = {
    operation: "video.status",
    async status(providerHandle, context) {
      try {
        const task = await options.transport.status(providerHandle, context);
        if (task.status === "queued") return { outcome: "queued", retryAfterMs: 10_000 };
        if (task.status === "running") return { outcome: "running", retryAfterMs: 10_000 };
        if (task.status === "cancelled") return { outcome: "cancelled" };
        if (task.status === "failed") {
          return {
            outcome: "failed",
            error: {
              category: task.error?.code === "1026" ? "moderation" : "unavailable",
              code: task.error?.code
                ? `minimax.remote_${task.error.code}`
                : "minimax.remote_failed",
              message: task.error?.message ?? "MiniMax generation failed",
              retryable: false,
              providerRequestId: task.id,
            },
          };
        }
        if (!task.content?.url) throw new Error("minimax.result_url_missing");
        return {
          outcome: "succeeded",
          outputs: [{ kind: "video", url: task.content.url, mimeType: "video/mp4" }],
          providerRequestId: task.id,
        };
      } catch (cause) {
        throw normalizeMiniMaxError(cause);
      }
    },
  };

  const cancel: VideoCancelPort = {
    operation: "video.cancel",
    async cancel(providerHandle, context) {
      try {
        const task = await options.transport.status(providerHandle, context);
        if (task.status === "queued") {
          await options.transport.cancelQueued(providerHandle, context);
          return { outcome: "confirmed" };
        }
        if (task.status === "running") return { outcome: "not_supported" };
        return { outcome: "already_terminal" };
      } catch (cause) {
        throw normalizeMiniMaxError(cause);
      }
    },
  };
  return [generate, status, cancel];
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
]);

async function miniMaxAssetUrl(asset: ResolvedProviderAsset): Promise<string> {
  if (!allowedMimeTypes.has(asset.mimeType.toLowerCase()))
    throw new Error("minimax.asset_mime_unsupported");
  const maximum = asset.kind === "image" ? 30 : asset.kind === "video" ? 50 : 15;
  if (asset.byteLength > maximum * 1024 * 1024) throw new Error("minimax.asset_too_large");
  if (asset.source.kind === "url") return asset.source.url;
  const bytes = Buffer.from(await asset.source.blob.arrayBuffer());
  if (bytes.byteLength !== asset.byteLength) throw new Error("minimax.asset_length_mismatch");
  return `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
}
