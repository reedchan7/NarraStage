import { defineProviderAdapter, unavailableProviderAssetResolver } from "@/providers/ports";
import type { CredentialVault } from "@/security/credentials/types";
import type { ProviderAssetResolver } from "@/providers/ports/video";
import { FalQueueTransport } from "@/providers/adapters/fal/transport";
import { createFalH3Ports } from "@/providers/adapters/fal/h3Adapter";

export function createFalAdapter(options: {
  credentialVault: CredentialVault;
  assetResolver?: ProviderAssetResolver;
  transport?: FalQueueTransport;
}) {
  const transport =
    options.transport ?? new FalQueueTransport({ credentialVault: options.credentialVault });
  return defineProviderAdapter({
    providerId: "fal",
    ports: createFalH3Ports({
      transport,
      assetResolver: options.assetResolver ?? unavailableProviderAssetResolver,
    }),
  });
}

export * from "@/providers/adapters/fal/transport";
