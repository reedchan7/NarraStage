import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const generationJobsMigration: ProviderPlatformMigration = {
  id: "0002_generation_jobs",
  async up(database) {
    await database.schema.createTable("o_generation_jobs", (table) => {
      table.string("id").primary();
      table.string("schema_version").notNullable();
      table.string("principal_id").notNullable();
      table.string("idempotency_key").notNullable();
      table.string("request_hash").notNullable();
      table.string("canonical_model_id").notNullable();
      table.string("offering_id").notNullable();
      table.string("provider_id").notNullable();
      table.string("operation").notNullable();
      table.text("input_json").notNullable();
      table.string("state").notNullable().index();
      table.string("provider_handle");
      table.string("provider_outcome");
      table.text("result_json");
      table.text("error_json");
      table.bigInteger("cancel_requested_at");
      table.string("cancel_reason");
      table.bigInteger("next_run_at").notNullable().index();
      table.bigInteger("deadline_at");
      table.integer("poll_attempt_count").notNullable().defaultTo(0);
      table.string("lease_owner");
      table.bigInteger("lease_expires_at").index();
      table.integer("version").notNullable();
      table.bigInteger("created_at").notNullable();
      table.bigInteger("updated_at").notNullable();
      table.unique(["principal_id", "operation", "idempotency_key"]);
    });
    await database.schema.createTable("o_generation_attempts", (table) => {
      table.string("id").primary();
      table.string("job_id").notNullable().index();
      table.integer("sequence").notNullable();
      table.string("provider_id").notNullable();
      table.string("offering_id").notNullable();
      table.string("provider_idempotency_key").notNullable().unique();
      table.string("state").notNullable();
      table.string("provider_handle");
      table.text("error_json");
      table.bigInteger("created_at").notNullable();
      table.bigInteger("updated_at").notNullable();
      table.unique(["job_id", "sequence"]);
    });
    await database.schema.createTable("o_generation_job_events", (table) => {
      table.increments("id").primary();
      table.string("job_id").notNullable().index();
      table.integer("sequence").notNullable();
      table.string("from_state");
      table.string("to_state").notNullable();
      table.string("reason").notNullable();
      table.text("metadata_json");
      table.bigInteger("created_at").notNullable();
      table.unique(["job_id", "sequence"]);
    });
    await database.schema.createTable("o_generation_reconciliations", (table) => {
      table.increments("id").primary();
      table.string("job_id").notNullable().index();
      table.string("action").notNullable();
      table.string("actor").notNullable();
      table.string("reason").notNullable();
      table.text("evidence_json");
      table.string("provider_handle");
      table.bigInteger("created_at").notNullable();
    });
    await database.schema.createTable("o_media_assets", (table) => {
      table.string("id").primary();
      table.string("sha256").notNullable().unique();
      table.string("file_path").notNullable();
      table.string("mime_type").notNullable();
      table.bigInteger("byte_length").notNullable();
      table.text("metadata_json");
      table.bigInteger("created_at").notNullable();
    });
    await database.schema.createTable("o_provider_asset_cache", (table) => {
      table.increments("id").primary();
      table.string("provider_id").notNullable();
      table.string("credential_scope").notNullable();
      table.string("asset_sha256").notNullable();
      table.string("provider_asset_id").notNullable();
      table.bigInteger("expires_at").notNullable().index();
      table.string("cleanup_handle");
      table.bigInteger("created_at").notNullable();
      table.bigInteger("updated_at").notNullable();
      table.unique(["provider_id", "credential_scope", "asset_sha256"]);
    });
    await database.raw(`
      CREATE TRIGGER o_generation_reconciliations_no_update
      BEFORE UPDATE ON o_generation_reconciliations
      BEGIN
        SELECT RAISE(ABORT, 'generation.reconciliation_audit_immutable');
      END
    `);
    await database.raw(`
      CREATE TRIGGER o_generation_reconciliations_no_delete
      BEFORE DELETE ON o_generation_reconciliations
      BEGIN
        SELECT RAISE(ABORT, 'generation.reconciliation_audit_immutable');
      END
    `);
  },
};
