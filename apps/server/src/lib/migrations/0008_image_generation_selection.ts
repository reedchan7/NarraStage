import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const imageGenerationSelectionMigration: ProviderPlatformMigration = {
  id: "0008_image_generation_selection",
  async up(database) {
    if (
      (await database.schema.hasTable("o_project")) &&
      !(await database.schema.hasColumn("o_project", "imageOfferingId"))
    ) {
      await database.schema.alterTable("o_project", (table) => {
        table.string("imageOfferingId");
      });
    }
  },
};
