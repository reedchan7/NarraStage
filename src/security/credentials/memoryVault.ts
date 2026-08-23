import {
  assertCredentialValue,
  credentialRefKey,
  type CredentialRef,
  type CredentialStatus,
  type CredentialVault,
} from "@/security/credentials/types";

export class MemoryCredentialVault implements CredentialVault {
  private readonly values = new Map<string, { value: string; updatedAt: string }>();

  async get(ref: CredentialRef): Promise<string | undefined> {
    return this.values.get(credentialRefKey(ref))?.value;
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    assertCredentialValue(value);
    this.values.set(credentialRefKey(ref), { value, updatedAt: new Date().toISOString() });
  }

  async delete(ref: CredentialRef): Promise<void> {
    this.values.delete(credentialRefKey(ref));
  }

  async status(ref: CredentialRef): Promise<CredentialStatus> {
    const record = this.values.get(credentialRefKey(ref));
    return record
      ? {
          configured: true,
          source: "memory",
          writable: true,
          updatedAt: record.updatedAt,
        }
      : { configured: false, source: "none", writable: true };
  }
}
