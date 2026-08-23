import { z } from "zod";
export const credentialSlotSchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/);
export const credentialOwnerIdSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[._:-][A-Za-z0-9]+)*$/);

export const credentialRefSchema = z
  .object({
    providerId: credentialOwnerIdSchema,
    slot: credentialSlotSchema,
  })
  .strict();

export type CredentialRef = z.infer<typeof credentialRefSchema>;

export type CredentialSource = "environment" | "electron_safe_storage" | "memory" | "none";

export interface CredentialStatus {
  configured: boolean;
  source: CredentialSource;
  writable: boolean;
  updatedAt?: string;
}

export interface CredentialVault {
  get(ref: CredentialRef): Promise<string | undefined>;
  set(ref: CredentialRef, value: string): Promise<void>;
  delete(ref: CredentialRef): Promise<void>;
  status(ref: CredentialRef): Promise<CredentialStatus>;
}

export function credentialRefKey(ref: CredentialRef): string {
  const parsed = credentialRefSchema.parse(ref);
  return `${parsed.providerId}:${parsed.slot}`;
}

export function assertCredentialValue(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("credential.value_required");
  }
  if (value.length > 16_384) throw new Error("credential.value_too_large");
}
