import type { OfferingId } from "@/providers/domain/ids";

export const deepSeekManifest = {
  providerId: "deepseek",
  apiBaseUrl: "https://api.deepseek.com",
  credentialSlot: "apiKey",
  models: {
    "deepseek:v4-pro:official": {
      providerModelId: "deepseek-v4-pro",
      vision: false,
      lifecycle: "stable",
    },
    "deepseek:v4-flash:official": {
      providerModelId: "deepseek-v4-flash",
      vision: false,
      lifecycle: "stable",
    },
    "deepseek:v4-flash-vision-exp:official": {
      providerModelId: "deepseek-v4-flash-vision-exp",
      vision: true,
      lifecycle: "experimental",
    },
  },
  visionLimits: {
    supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maximumRequestBytes: 48 * 1024 * 1024,
    maximumInlineOrUrlImageBytes: 32 * 1024 * 1024,
    maximumProviderFileBytes: 64 * 1024 * 1024,
    maximumImages: 600,
    maximumTotalBytesWithoutProviderFiles: 64 * 1024 * 1024,
    maximumTotalBytesWithProviderFiles: 200 * 1024 * 1024,
    maximumDimension: 8_192,
    maximumDimensionAtFifteenImages: 4_096,
  },
} as const;

export type DeepSeekOfferingId = keyof typeof deepSeekManifest.models;

export function resolveDeepSeekOffering(offeringId: OfferingId) {
  const resolved = deepSeekManifest.models[offeringId as DeepSeekOfferingId];
  if (!resolved) throw new Error("deepseek.offering_not_supported");
  return resolved;
}
