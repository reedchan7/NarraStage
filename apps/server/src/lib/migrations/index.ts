import type { Knex } from "knex";
import { providerCredentialsMigration } from "@/lib/migrations/0001_provider_credentials";
import { generationJobsMigration } from "@/lib/migrations/0002_generation_jobs";
import { mediaAssetOwnershipMigration } from "@/lib/migrations/0003_media_asset_ownership";
import { generationContinuationsMigration } from "@/lib/migrations/0004_generation_continuations";
import { generationAssetOutputsMigration } from "@/lib/migrations/0005_generation_asset_outputs";
import { providerPlatformHardeningMigration } from "@/lib/migrations/0006_provider_platform_hardening";
import { providerFileOwnershipMigration } from "@/lib/migrations/0007_provider_file_ownership";
import { runMigrationLedger } from "@/lib/migrations/ledger";

const migrations = [
  providerCredentialsMigration,
  generationJobsMigration,
  mediaAssetOwnershipMigration,
  generationContinuationsMigration,
  generationAssetOutputsMigration,
  providerPlatformHardeningMigration,
  providerFileOwnershipMigration,
] as const;

export async function runProviderPlatformMigrations(database: Knex): Promise<void> {
  await runMigrationLedger(database, migrations);
}
