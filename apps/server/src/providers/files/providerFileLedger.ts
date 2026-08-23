import type { Knex } from "knex";
import type { ProviderFileReference } from "@/providers/ports/files";
import type { LanguageInput } from "@/providers/ports/language";

type ProviderFileIdentity = Pick<ProviderFileReference, "providerId" | "fileId">;

function credentialScope(providerId: string): string {
  return `provider:${providerId}`;
}

export function providerFileReferences(input: LanguageInput): ProviderFileIdentity[] {
  const references: ProviderFileIdentity[] = [];
  for (const message of input.messages) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) {
      if ((part.type === "image" || part.type === "file") && part.source.type === "provider_file") {
        references.push({ providerId: part.source.providerId, fileId: part.source.fileId });
      }
    }
  }
  return references;
}

export class ProviderFileLedger {
  readonly #database: Knex;
  readonly #now: () => number;

  constructor(database: Knex, now: () => number = Date.now) {
    this.#database = database;
    this.#now = now;
  }

  async register(reference: ProviderFileReference, principalId: string): Promise<void> {
    if (!principalId) throw new Error("provider.file_principal_required");
    await this.#database("o_provider_file_owners")
      .insert({
        provider_id: reference.providerId,
        credential_scope: credentialScope(reference.providerId),
        file_id: reference.fileId,
        principal_id: principalId,
        media_type: reference.mediaType,
        filename: reference.filename ?? null,
        expires_at: reference.expiresAt ? Date.parse(reference.expiresAt) : null,
        created_at: this.#now(),
      })
      .onConflict(["provider_id", "credential_scope", "file_id", "principal_id"])
      .merge({
        media_type: reference.mediaType,
        filename: reference.filename ?? null,
        expires_at: reference.expiresAt ? Date.parse(reference.expiresAt) : null,
      });
  }

  async assertOwned(
    references: readonly ProviderFileIdentity[],
    principalId: string,
    expectedProviderId?: string,
  ): Promise<void> {
    for (const reference of references) {
      if (expectedProviderId && reference.providerId !== expectedProviderId) {
        throw new Error("provider.file_provider_mismatch");
      }
      const row = (await this.#database("o_provider_file_owners")
        .where({
          provider_id: reference.providerId,
          credential_scope: credentialScope(reference.providerId),
          file_id: reference.fileId,
          principal_id: principalId,
        })
        .first()) as { expires_at?: number | null } | undefined;
      if (!row || (row.expires_at != null && Number(row.expires_at) <= this.#now())) {
        throw new Error("provider.file_forbidden");
      }
    }
  }
}

let runtime: ProviderFileLedger | undefined;

export function configureProviderFileLedger(database: Knex): ProviderFileLedger {
  runtime = new ProviderFileLedger(database);
  return runtime;
}

export function getProviderFileLedger(): ProviderFileLedger {
  if (!runtime) throw new Error("provider.file_ledger_not_configured");
  return runtime;
}

export function resetProviderFileLedgerForTests(): void {
  runtime = undefined;
}
