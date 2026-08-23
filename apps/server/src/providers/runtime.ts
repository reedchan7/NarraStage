import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { createDeepSeekAdapter } from "@/providers/adapters/deepseek";
import { createFalAdapter } from "@/providers/adapters/fal";
import { createMiniMaxAdapter } from "@/providers/adapters/minimax";
import { createGoogleAdapter } from "@/providers/adapters/google";
import type { CredentialVault } from "@/security/credentials/types";
import { getCredentialVault } from "@/security/credentials/runtime";
import type { ProviderAssetResolver, ProviderFileAssetResolver } from "@/providers/ports";

interface ProviderAssetDependencies {
  assetResolver?: ProviderAssetResolver;
  fileAssetResolver?: ProviderFileAssetResolver;
}

let runtimeRegistry: ProviderRegistry | undefined;

export function createBuiltinProviderRegistry(
  credentialVault: CredentialVault = getCredentialVault(),
  dependencies: ProviderAssetDependencies = {},
): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(
    createDeepSeekAdapter({ credentialVault, fileAssetResolver: dependencies.fileAssetResolver }),
  );
  registry.register(
    createFalAdapter({ credentialVault, assetResolver: dependencies.assetResolver }),
  );
  registry.register(
    createMiniMaxAdapter({ credentialVault, assetResolver: dependencies.assetResolver }),
  );
  registry.register(
    createGoogleAdapter({
      credentialVault,
      assetResolver: dependencies.assetResolver,
      fileAssetResolver: dependencies.fileAssetResolver,
    }),
  );
  return registry;
}

export function configureProviderRuntime(
  credentialVault: CredentialVault = getCredentialVault(),
  dependencies: ProviderAssetDependencies = {},
): ProviderRegistry {
  runtimeRegistry = createBuiltinProviderRegistry(credentialVault, dependencies);
  return runtimeRegistry;
}

export function getProviderRegistry(): ProviderRegistry {
  if (!runtimeRegistry) throw new Error("provider.runtime_not_configured");
  return runtimeRegistry;
}

export function resetProviderRuntimeForTests(): void {
  runtimeRegistry = undefined;
}
