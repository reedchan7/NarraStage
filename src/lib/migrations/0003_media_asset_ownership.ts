import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const mediaAssetOwnershipMigration: ProviderPlatformMigration = {
  id: "0003_media_asset_ownership",
  async up(database) {
    await database.schema.alterTable("o_generation_jobs", (table) => {
      table.string("consumer_type");
      table.string("consumer_key");
      table.text("consumer_context_json");
      table.index(["principal_id", "consumer_type", "consumer_key"]);
    });
    await database.schema.createTable("o_media_asset_owners", (table) => {
      table.string("asset_id").notNullable();
      table.string("principal_id").notNullable();
      table.integer("project_id");
      table.string("source_kind").notNullable();
      table.string("source_id");
      table.text("metadata_json");
      table.bigInteger("created_at").notNullable();
      table.primary(["asset_id", "principal_id"]);
      table.index(["principal_id", "created_at"]);
    });
    await database.schema.createTable("o_generation_workbench_outputs", (table) => {
      table.string("job_id").primary();
      table.string("principal_id").notNullable();
      table.integer("project_id").notNullable();
      table.integer("script_id").notNullable();
      table.integer("track_id").notNullable();
      table.integer("video_id").notNullable().unique();
      table.bigInteger("created_at").notNullable();
      table.index(["principal_id", "project_id", "script_id", "track_id"]);
    });
  },
};
