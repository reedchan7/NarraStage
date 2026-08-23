import { defineProviderAdapter, unavailableProviderAssetResolver } from "@/providers/ports";
import type { ProviderAssetResolver } from "@/providers/ports/video";
import type { CredentialVault } from "@/security/credentials/types";
import { MiniMaxOfficialTransport } from "@/providers/adapters/minimax/officialTransport";
import { createMiniMaxOfficialH3Ports } from "@/providers/adapters/minimax/officialAdapter";

export function createMiniMaxAdapter(options: {
  credentialVault: CredentialVault;
  assetResolver?: ProviderAssetResolver;
  transport?: MiniMaxOfficialTransport;
}) {
  const transport =
    options.transport ?? new MiniMaxOfficialTransport({ credentialVault: options.credentialVault });
  return defineProviderAdapter({
    providerId: "minimax",
    ports: createMiniMaxOfficialH3Ports({
      transport,
      assetResolver: options.assetResolver ?? unavailableProviderAssetResolver,
    }),
  });
}

export * from "@/providers/adapters/minimax/officialTransport";
