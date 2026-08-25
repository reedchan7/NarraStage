import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  credentialRefSchema,
  type CredentialStatus,
  type CredentialVault,
} from "@/security/credentials/types";

export const credentialStatusRequestSchema = credentialRefSchema;
export const credentialDeleteRequestSchema = credentialRefSchema;
export const credentialSetRequestSchema = credentialRefSchema
  .extend({ value: z.string().trim().min(1).max(16_384) })
  .strict();

export async function applyCredentialSet(
  vault: Pick<CredentialVault, "set" | "status">,
  request: unknown,
): Promise<CredentialStatus> {
  const parsed = credentialSetRequestSchema.parse(request);
  const ref = { providerId: parsed.providerId, slot: parsed.slot };
  await vault.set(ref, parsed.value);
  return vault.status(ref);
}

export function assertTrustedCredentialSender(
  senderUrl: string,
  developmentOrigins: readonly string[] = [],
  packagedRendererPath?: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(senderUrl);
  } catch {
    throw new Error("credential.untrusted_renderer");
  }
  if (
    parsed.protocol === "file:" &&
    packagedRendererPath !== undefined &&
    path.resolve(fileURLToPath(parsed)) === path.resolve(packagedRendererPath)
  ) {
    return;
  }
  if (developmentOrigins.includes(parsed.origin)) return;
  throw new Error("credential.untrusted_renderer");
}
