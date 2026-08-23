import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const providerPlatformHardeningMigration: ProviderPlatformMigration = {
  id: "0006_provider_platform_hardening",
  async up(database) {
    await database.schema.alterTable("o_generation_jobs", (table) => {
      table.text("import_payload_json");
      table.integer("import_attempt_count").notNullable().defaultTo(0);
      table.bigInteger("import_deadline_at");
    });
    if (
      (await database.schema.hasTable("o_user")) &&
      !(await database.schema.hasColumn("o_user", "role"))
    ) {
      await database.schema.alterTable("o_user", (table) => {
        table.string("role").notNullable().defaultTo("user");
      });
      await database("o_user").where({ name: "admin" }).update({ role: "operator" });
    }
    if (await database.schema.hasTable("o_project")) {
      const columns = [
        ["videoCatalogMode", (table: any) => table.string("videoCatalogMode")],
        ["videoCanonicalModelId", (table: any) => table.string("videoCanonicalModelId")],
        ["videoOfferingId", (table: any) => table.string("videoOfferingId")],
        ["videoProviderId", (table: any) => table.string("videoProviderId")],
        [
          "videoOfferingPreferenceMode",
          (table: any) => table.string("videoOfferingPreferenceMode"),
        ],
      ] as const;
      for (const [column, addColumn] of columns) {
        if (await database.schema.hasColumn("o_project", column)) continue;
        await database.schema.alterTable("o_project", addColumn);
      }
    }
  },
};
