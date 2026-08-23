import type { ProviderPlatformMigration } from "@/lib/migrations/ledger";

export const generationContinuationsMigration: ProviderPlatformMigration = {
  id: "0004_generation_continuations",
  async up(database) {
    await database.schema.alterTable("o_generation_jobs", (table) => {
      table.string("parent_job_id");
      table.index(["principal_id", "parent_job_id"]);
    });
  },
};
