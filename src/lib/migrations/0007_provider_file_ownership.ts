import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const providerFileOwnershipMigration: ProviderPlatformMigration = {
  id: "0007_provider_file_ownership",
  async up(database) {
    await database.schema.createTable("o_provider_file_owners", (table) => {
      table.string("provider_id").notNullable();
      table.string("credential_scope").notNullable();
      table.string("file_id").notNullable();
      table.string("principal_id").notNullable();
      table.string("media_type").notNullable();
      table.string("filename");
      table.bigInteger("expires_at");
      table.bigInteger("created_at").notNullable();
      table.primary(["provider_id", "credential_scope", "file_id", "principal_id"]);
      table.index(["principal_id", "provider_id", "created_at"]);
    });
  },
};
