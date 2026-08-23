import type { CapabilityInput } from "@/providers/domain/capabilities";

export interface ProviderInlineArtifact {
  kind: "image";
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageOperationResult {
  outputs: ProviderInlineArtifact[];
  providerRequestId?: string;
  text?: string;
  usage?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
}

export type ImageOperationInput = CapabilityInput;
