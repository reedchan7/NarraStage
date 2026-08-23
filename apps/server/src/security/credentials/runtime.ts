import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { EnvironmentCredentialVault } from "@/security/credentials/environmentVault";
import type {
  CredentialRef,
  CredentialStatus,
  CredentialVault,
} from "@/security/credentials/types";

export function credentialEnvironmentMap(): Record<string, readonly string[]> {
  return Object.fromEntries(
    builtinCatalog.providers.flatMap((provider) =>
      provider.credentialSlots.map((descriptor) => [
        `${provider.id}:${descriptor.slot}`,
        descriptor.environmentVariables,
      ]),
    ),
  );
}

export class LayeredCredentialVault implements CredentialVault {
  private readonly environment: EnvironmentCredentialVault;
  private readonly persisted: CredentialVault;

  constructor(environment: EnvironmentCredentialVault, persisted: CredentialVault) {
    this.environment = environment;
    this.persisted = persisted;
  }

  async get(ref: CredentialRef): Promise<string | undefined> {
    return (await this.environment.get(ref)) ?? this.persisted.get(ref);
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    if (await this.environment.get(ref)) throw new Error("credential.environment_override");
    await this.persisted.set(ref, value);
  }

  async delete(ref: CredentialRef): Promise<void> {
    if (await this.environment.get(ref)) throw new Error("credential.environment_override");
    await this.persisted.delete(ref);
  }

  async status(ref: CredentialRef): Promise<CredentialStatus> {
    const environmentStatus = await this.environment.status(ref);
    return environmentStatus.configured ? environmentStatus : this.persisted.status(ref);
  }
}

export function createEnvironmentCredentialVault(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EnvironmentCredentialVault {
  return new EnvironmentCredentialVault(credentialEnvironmentMap(), environment);
}

let runtimeVault: CredentialVault = createEnvironmentCredentialVault();

export function configureCredentialVault(vault: CredentialVault): void {
  runtimeVault = vault;
}

export function getCredentialVault(): CredentialVault {
  return runtimeVault;
}
