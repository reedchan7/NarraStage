import {
  credentialRefKey,
  type CredentialRef,
  type CredentialStatus,
  type CredentialVault,
} from "@/security/credentials/types";

export class EnvironmentCredentialVault implements CredentialVault {
  private readonly variablesByRef: Readonly<Record<string, readonly string[]>>;
  private readonly environment: Readonly<Record<string, string | undefined>>;

  constructor(
    variablesByRef: Readonly<Record<string, readonly string[]>>,
    environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    this.variablesByRef = variablesByRef;
    this.environment = environment;
  }

  async get(ref: CredentialRef): Promise<string | undefined> {
    const variables = this.variablesByRef[credentialRefKey(ref)] ?? [];
    for (const variable of variables) {
      const value = this.environment[variable];
      if (value?.trim()) return value;
    }
    return undefined;
  }

  async set(_ref: CredentialRef, _value: string): Promise<void> {
    throw new Error("credential.vault_read_only");
  }

  async delete(_ref: CredentialRef): Promise<void> {
    throw new Error("credential.vault_read_only");
  }

  async status(ref: CredentialRef): Promise<CredentialStatus> {
    return (await this.get(ref))
      ? { configured: true, source: "environment", writable: false }
      : { configured: false, source: "none", writable: false };
  }
}
