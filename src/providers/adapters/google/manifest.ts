import type { OfferingId } from "@/providers/domain/ids";

export const googleManifest = {
  providerId: "google",
  apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  credentialSlot: "apiKey",
  files: {
    maximumBytesPerFile: 2 * 1024 * 1024 * 1024,
    retentionSeconds: 48 * 60 * 60,
  },
  models: {
    "google:gemini-3.7-flash:official": {
      kind: "language",
      providerModelId: "gemini-3.7-flash",
      interactions: false,
      lifecycle: "stable",
      grounding: true,
    },
    "google:nano-banana-2-lite:official": {
      kind: "image",
      providerModelId: "gemini-3.1-flash-lite-image",
      lifecycle: "stable",
      maximumReferenceImages: 14,
      imageSizes: ["1K"],
      grounding: false,
    },
    "google:nano-banana-2:official": {
      kind: "image",
      providerModelId: "gemini-3.1-flash-image",
      lifecycle: "stable",
      maximumReferenceImages: 14,
      imageSizes: ["512", "1K", "2K", "4K"],
      grounding: true,
    },
    "google:nano-banana-pro:official": {
      kind: "image",
      providerModelId: "gemini-3-pro-image",
      lifecycle: "stable",
      maximumReferenceImages: 14,
      imageSizes: ["1K", "2K", "4K"],
      grounding: true,
    },
    "google:gemini-omni-flash:official": {
      kind: "omni-video",
      providerModelId: "gemini-omni-flash-preview",
      lifecycle: "preview",
    },
    "google:veo-3.1:official": {
      kind: "veo-video",
      providerModelId: "veo-3.1-generate-preview",
      lifecycle: "preview",
      referenceImages: true,
      extension: true,
      resolutions: ["720P", "1080P", "4K"],
    },
    "google:veo-3.1-fast:official": {
      kind: "veo-video",
      providerModelId: "veo-3.1-fast-generate-preview",
      lifecycle: "preview",
      referenceImages: true,
      extension: true,
      resolutions: ["720P", "1080P", "4K"],
    },
    "google:veo-3.1-lite:official": {
      kind: "veo-video",
      providerModelId: "veo-3.1-lite-generate-preview",
      lifecycle: "preview",
      referenceImages: false,
      extension: false,
      resolutions: ["720P", "1080P"],
    },
  },
} as const;

export const googleOutputAuthorization = {
  kind: "credential_header",
  credentialSlot: "apiKey",
  headerName: "x-goog-api-key",
  allowedOrigins: ["https://generativelanguage.googleapis.com"],
} as const;

export type GoogleOfferingId = keyof typeof googleManifest.models;

export function resolveGoogleOffering(offeringId: OfferingId) {
  const resolved = googleManifest.models[offeringId as GoogleOfferingId];
  if (!resolved) throw new Error("google.offering_not_supported");
  return resolved;
}
