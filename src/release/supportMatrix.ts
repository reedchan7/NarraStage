import type { OfferingId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";

export interface ReleaseTarget {
  offeringId: OfferingId;
  requiredOperations: readonly Operation[];
  adapterManifestId: "deepseek-v4" | "fal-h3" | "google-generative-ai";
  acceptanceSuiteId: "provider-product-acceptance-v1";
  sdkPackage: "@ai-sdk/deepseek" | "@fal-ai/client" | "@google/genai";
  sdkVersion: string;
  providerApiRevision: string;
  deploymentRegions: readonly string[];
}

function releaseTarget(
  offeringId: OfferingId,
  requiredOperations: readonly Operation[],
  adapterManifestId: ReleaseTarget["adapterManifestId"],
  sdkPackage: ReleaseTarget["sdkPackage"],
  sdkVersion: string,
  providerApiRevision: string,
  deploymentRegions: readonly string[],
): ReleaseTarget {
  return {
    offeringId,
    requiredOperations,
    adapterManifestId,
    acceptanceSuiteId: "provider-product-acceptance-v1",
    sdkPackage,
    sdkVersion,
    providerApiRevision,
    deploymentRegions,
  };
}

const languageOperations = ["language.generate", "language.stream"] as const;
const visionOperations = ["language.generate", "language.stream", "files.upload"] as const;
const imageOperations = ["image.generate", "image.edit"] as const;
const videoOperations = ["video.generate", "video.status", "video.cancel"] as const;
const nonCancellableVideoOperations = ["video.generate", "video.status"] as const;

export const releaseTargets = [
  releaseTarget(
    "deepseek:v4-pro:official",
    languageOperations,
    "deepseek-v4",
    "@ai-sdk/deepseek",
    "3.0.31",
    "v1",
    ["global", "CN"],
  ),
  releaseTarget(
    "deepseek:v4-flash:official",
    languageOperations,
    "deepseek-v4",
    "@ai-sdk/deepseek",
    "3.0.31",
    "v1",
    ["global", "CN"],
  ),
  releaseTarget(
    "deepseek:v4-flash-vision-exp:official",
    visionOperations,
    "deepseek-v4",
    "@ai-sdk/deepseek",
    "3.0.31",
    "v1",
    ["global", "CN"],
  ),
  releaseTarget(
    "minimax:h3:fal",
    videoOperations,
    "fal-h3",
    "@fal-ai/client",
    "1.10.1",
    "queue-v1",
    ["global"],
  ),
  releaseTarget(
    "google:gemini-3.7-flash:official",
    visionOperations,
    "google-generative-ai",
    "@google/genai",
    "2.18.0",
    "v1beta",
    ["global"],
  ),
  ...[
    "google:nano-banana-2-lite:official",
    "google:nano-banana-2:official",
    "google:nano-banana-pro:official",
  ].map((offeringId) =>
    releaseTarget(
      offeringId,
      imageOperations,
      "google-generative-ai",
      "@google/genai",
      "2.18.0",
      "v1beta",
      ["global"],
    ),
  ),
  releaseTarget(
    "google:gemini-omni-flash:official",
    videoOperations,
    "google-generative-ai",
    "@google/genai",
    "2.18.0",
    "v1beta",
    ["global"],
  ),
  ...[
    "google:veo-3.1:official",
    "google:veo-3.1-fast:official",
    "google:veo-3.1-lite:official",
  ].map((offeringId) =>
    releaseTarget(
      offeringId,
      nonCancellableVideoOperations,
      "google-generative-ai",
      "@google/genai",
      "2.18.0",
      "v1beta",
      ["global"],
    ),
  ),
] as const satisfies readonly ReleaseTarget[];

export const enabledReleaseOfferingIds = releaseTargets.map((target) => target.offeringId);
