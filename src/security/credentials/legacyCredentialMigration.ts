import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { credentialRefSchema, type CredentialVault } from "@/security/credentials/types";

export interface LegacyCredentialDescriptor {
  providerId: string;
  slots: string[];
}

interface LegacyCredentialMigrationHooks {
  afterVaultWrite?(ref: { providerId: string; slot: string }): void | Promise<void>;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseInputValues(raw: unknown, providerId: string): Record<string, string> {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    throw new Error(`credential.legacy_input_invalid:${providerId}`);
  }
}

export async function migrateLegacyCredentials(
  database: Knex,
  vault: CredentialVault,
  descriptors: readonly LegacyCredentialDescriptor[],
  hooks: LegacyCredentialMigrationHooks = {},
): Promise<{ migrated: number; skipped: number }> {
  let migrated = 0;
  let skipped = 0;

  for (const descriptor of descriptors) {
    const row = await database("o_vendorConfig").where({ id: descriptor.providerId }).first();
    if (!row) {
      skipped += descriptor.slots.length;
      continue;
    }
    const inputValues = parseInputValues(row.inputValues, descriptor.providerId);
    for (const slot of descriptor.slots) {
      const ref = credentialRefSchema.parse({ providerId: descriptor.providerId, slot });
      const value = inputValues[slot];
      if (!value?.trim()) {
        skipped += 1;
        continue;
      }

      const startedAt = new Date().toISOString();
      const existingStatus = await vault.status(ref);
      if (existingStatus.source !== "environment") await vault.set(ref, value);
      await hooks.afterVaultWrite?.(ref);
      delete inputValues[slot];
      await database.transaction(async (transaction) => {
        await transaction("o_vendorConfig")
          .where({ id: descriptor.providerId })
          .update({ inputValues: JSON.stringify(inputValues) });
        await transaction("o_provider_credential_refs")
          .insert({
            provider_id: ref.providerId,
            slot: ref.slot,
            source: existingStatus.source === "environment" ? "environment" : "vault",
            updated_at: startedAt,
          })
          .onConflict(["provider_id", "slot"])
          .merge({
            source: existingStatus.source === "environment" ? "environment" : "vault",
            updated_at: startedAt,
          });
        await transaction("o_provider_credential_migrations")
          .insert({
            provider_id: ref.providerId,
            slot: ref.slot,
            credential_fingerprint: fingerprint(value),
            state: "complete",
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          })
          .onConflict(["provider_id", "slot"])
          .merge({
            credential_fingerprint: fingerprint(value),
            state: "complete",
            completed_at: new Date().toISOString(),
          });
      });
      migrated += 1;
    }
  }

  if (migrated > 0) await database.raw("VACUUM");
  return { migrated, skipped };
}
