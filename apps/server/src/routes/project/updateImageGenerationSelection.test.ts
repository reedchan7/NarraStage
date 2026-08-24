import { afterEach, describe, expect, test } from "bun:test";
import knex, { type Knex } from "knex";
import { isImageOffering } from "@/providers/catalog/imageGenerationSelection";
import { persistProjectImageOffering } from "@/routes/project/updateImageGenerationSelection";

let database: Knex | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe("project image offering persistence", () => {
  test("persists only an implemented image offering for the project owner", async () => {
    database = knex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await database.schema.createTable("o_project", (table) => {
      table.integer("id").primary();
      table.integer("userId").notNullable();
      table.string("imageModel");
      table.string("imageOfferingId");
    });
    await database("o_project").insert({ id: 7, userId: 42, imageModel: "legacy:image" });

    const offeringId = "google:nano-banana-2-lite:official";
    expect(isImageOffering(offeringId)).toBe(true);
    expect(await persistProjectImageOffering(database, 7, 99, offeringId)).toBe(false);
    expect(await persistProjectImageOffering(database, 7, 42, offeringId)).toBe(true);
    expect(await database("o_project").where({ id: 7 }).first()).toMatchObject({
      imageModel: "legacy:image",
      imageOfferingId: offeringId,
    });
    await expect(
      persistProjectImageOffering(database, 7, 42, "narrastage:legacy-image"),
    ).rejects.toThrow("project.image_offering_invalid");
  });
});
