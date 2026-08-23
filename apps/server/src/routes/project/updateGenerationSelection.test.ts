import { afterEach, describe, expect, test } from "bun:test";
import knex, { type Knex } from "knex";
import { providerPlatformHardeningMigration } from "@/lib/migrations/0006_provider_platform_hardening";
import { persistProjectGenerationSelection } from "@/routes/project/updateGenerationSelection";

let database: Knex | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe("project generation selection persistence", () => {
  test("round-trips an exact offering pin and enforces project ownership", async () => {
    database = knex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await database.schema.createTable("o_generation_jobs", (table) => table.string("id").primary());
    await database.schema.createTable("o_project", (table) => {
      table.integer("id").primary();
      table.integer("userId").notNullable();
    });
    await providerPlatformHardeningMigration.up(database);
    await database("o_project").insert({ id: 7, userId: 42 });
    const selection = {
      catalogMode: "builtin" as const,
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
      preferenceMode: "pinned" as const,
    };

    expect(await persistProjectGenerationSelection(database, 7, 99, selection)).toBe(false);
    expect(await persistProjectGenerationSelection(database, 7, 42, selection)).toBe(true);
    expect(await database("o_project").where({ id: 7 }).first()).toMatchObject({
      videoCatalogMode: "builtin",
      videoCanonicalModelId: "minimax:h3",
      videoOfferingId: "minimax:h3:fal",
      videoProviderId: "fal",
      videoOfferingPreferenceMode: "pinned",
    });
  });
});
