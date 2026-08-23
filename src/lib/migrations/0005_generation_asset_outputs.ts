import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const generationAssetOutputsMigration: ProviderPlatformMigration = {
  id: "0005_generation_asset_outputs",
  async up(database) {
    await database.schema.createTable("o_generation_asset_outputs", (table) => {
      table.string("job_id").primary();
      table.string("principal_id").notNullable();
      table.integer("project_id").notNullable();
      table.integer("asset_id").notNullable();
      table.integer("image_id").notNullable().unique();
      table.bigInteger("created_at").notNullable();
      table.index(["principal_id", "project_id", "asset_id"]);
    });
  },
};
