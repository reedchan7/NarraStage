import type { Knex } from "knex";
import type { ProviderId } from "@/providers/domain/ids";

export interface ProviderAssetRef {
  providerId: ProviderId;
  credentialScope: string;
  assetSha256: string;
  providerAssetId: string;
  expiresAt: number;
  cleanupHandle?: string;
}

interface ProviderAssetRow {
  provider_id: ProviderId;
  credential_scope: string;
  asset_sha256: string;
  provider_asset_id: string;
  expires_at: number;
  cleanup_handle: string | null;
}

function toRef(row: ProviderAssetRow): ProviderAssetRef {
  return {
    providerId: row.provider_id,
    credentialScope: row.credential_scope,
    assetSha256: row.asset_sha256,
    providerAssetId: row.provider_asset_id,
    expiresAt: row.expires_at,
    ...(row.cleanup_handle ? { cleanupHandle: row.cleanup_handle } : {}),
  };
}

export class ProviderAssetCache {
  readonly #database: Knex;

  constructor(database: Knex) {
    this.#database = database;
  }

  async get(input: {
    providerId: ProviderId;
    credentialScope: string;
    assetSha256: string;
    now: number;
    minimumRemainingTtlMs?: number;
  }): Promise<ProviderAssetRef | undefined> {
    const row = (await this.#database("o_provider_asset_cache")
      .where({
        provider_id: input.providerId,
        credential_scope: input.credentialScope,
        asset_sha256: input.assetSha256,
      })
      .where("expires_at", ">", input.now + (input.minimumRemainingTtlMs ?? 0))
      .first()) as ProviderAssetRow | undefined;
    return row ? toRef(row) : undefined;
  }

  async put(ref: ProviderAssetRef): Promise<void> {
    const now = Date.now();
    await this.#database("o_provider_asset_cache")
      .insert({
        provider_id: ref.providerId,
        credential_scope: ref.credentialScope,
        asset_sha256: ref.assetSha256,
        provider_asset_id: ref.providerAssetId,
        expires_at: ref.expiresAt,
        cleanup_handle: ref.cleanupHandle ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflict(["provider_id", "credential_scope", "asset_sha256"])
      .merge({
        provider_asset_id: ref.providerAssetId,
        expires_at: ref.expiresAt,
        cleanup_handle: ref.cleanupHandle ?? null,
        updated_at: now,
      });
  }

  async invalidateExpired(now: number): Promise<number> {
    return this.#database("o_provider_asset_cache").where("expires_at", "<=", now).delete();
  }
}
