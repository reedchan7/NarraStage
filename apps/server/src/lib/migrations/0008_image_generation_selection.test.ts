import { afterEach, describe, expect, test } from "bun:test";
import knex, { type Knex } from "knex";
import { imageGenerationSelectionMigration } from "@/lib/migrations/0008_image_generation_selection";

let database: Knex | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe("image generation selection migration", () => {
  test("adds a nullable exact offering without rewriting the legacy image model", async () => {
    database = knex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await database.schema.createTable("o_project", (table) => {
      table.integer("id").primary();
      table.string("imageModel");
    });
    await database("o_project").insert({ id: 7, imageModel: "grsai:nano-banana-2" });

    await imageGenerationSelectionMigration.up(database);

    expect(await database.schema.hasColumn("o_project", "imageOfferingId")).toBe(true);
    expect(await database("o_project").where({ id: 7 }).first()).toMatchObject({
      imageModel: "grsai:nano-banana-2",
      imageOfferingId: null,
    });
  });
});
