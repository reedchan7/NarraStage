import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const providerCredentialsMigration: ProviderPlatformMigration = {
  id: "0001_provider_credentials",
  async up(database) {
    await database.schema.createTable("o_provider_credential_refs", (table) => {
      table.string("provider_id").notNullable();
      table.string("slot").notNullable();
      table.string("source").notNullable();
      table.text("updated_at").notNullable();
      table.primary(["provider_id", "slot"]);
    });
    await database.schema.createTable("o_provider_credential_migrations", (table) => {
      table.string("provider_id").notNullable();
      table.string("slot").notNullable();
      table.string("credential_fingerprint").notNullable();
      table.string("state").notNullable();
      table.text("started_at").notNullable();
      table.text("completed_at");
      table.primary(["provider_id", "slot"]);
    });
  },
};
