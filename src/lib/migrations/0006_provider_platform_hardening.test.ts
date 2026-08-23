import { afterEach, describe, expect, test } from "bun:test";
import knex, { type Knex } from "knex";
import { providerPlatformHardeningMigration } from "@/lib/migrations/0006_provider_platform_hardening";

let database: Knex | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe("provider platform hardening migration", () => {
  test("adds recovery, operator, and structured generation selection fields", async () => {
    database = knex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await database.schema.createTable("o_generation_jobs", (table) => table.string("id").primary());
    await database.schema.createTable("o_user", (table) => {
      table.integer("id").primary();
      table.string("name");
    });
    await database.schema.createTable("o_project", (table) => table.integer("id").primary());
    await database("o_user").insert({ id: 1, name: "admin" });

    await providerPlatformHardeningMigration.up(database);

    expect(await database.schema.hasColumn("o_generation_jobs", "import_payload_json")).toBe(true);
    expect(await database.schema.hasColumn("o_project", "videoOfferingId")).toBe(true);
    expect(await database.schema.hasColumn("o_project", "videoOfferingPreferenceMode")).toBe(true);
    expect((await database("o_user").where({ id: 1 }).first()).role).toBe("operator");
  });
});
