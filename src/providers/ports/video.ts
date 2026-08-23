import type {
  CapabilityAssetInput,
  CapabilityInput,
  MediaKind,
} from "@/providers/domain/capabilities";
import type { OperationContext } from "@/providers/ports";

export type VideoAspectRatio = "adaptive" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
export type H3Resolution = "480P" | "768P" | "2K" | "4K";

export interface ResolvedProviderAsset {
  assetId: string;
  kind: MediaKind;
  mimeType: string;
  byteLength: number;
  sha256: string;
  source: { kind: "url"; url: string } | { kind: "blob"; blob: Blob };
}

export interface ProviderAssetResolver {
  resolve(asset: CapabilityAssetInput, context?: OperationContext): Promise<ResolvedProviderAsset>;
}

export const unavailableProviderAssetResolver: ProviderAssetResolver = {
  async resolve() {
    throw new Error("provider.asset_resolver_unavailable");
  },
};

export interface H3VideoInput extends CapabilityInput {
  mode: "text" | "keyframes" | "reference";
  values: {
    prompt: string;
    durationSeconds: number;
    resolution: H3Resolution;
    aspectRatio?: VideoAspectRatio;
    seed?: number;
    enablePromptExpansion?: boolean;
    promptExpansionMode?: "fast" | "balanced" | "quality";
    enableSafetyChecker?: boolean;
  };
}
