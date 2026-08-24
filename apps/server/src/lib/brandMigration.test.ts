import { afterEach, describe, expect, test } from "bun:test";
import knex, { type Knex } from "knex";
import { migrateLegacyBrandData } from "@/lib/brandMigration";

let database: Knex | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe("NarraStage brand migration", () => {
  test("moves legacy provider references without carrying the retired hosted endpoint", async () => {
    database = knex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });

    await database.schema.createTable("o_vendorConfig", (table) => {
      table.string("id").primary();
      table.text("inputValues");
      table.text("models");
      table.integer("enable");
    });
    await database.schema.createTable("o_agentDeploy", (table) => {
      table.string("key").primary();
      table.string("vendorId");
      table.string("modelName");
    });
    await database.schema.createTable("o_project", (table) => {
      table.integer("id").primary();
      table.string("imageModel");
      table.string("videoModel");
    });
    await database.schema.createTable("o_modelPrompt", (table) => {
      table.integer("id").primary();
      table.string("vendorId");
    });

    await database("o_vendorConfig").insert({
      id: "toonflow",
      inputValues: JSON.stringify({
        apiKey: "preserved",
        baseUrl: `https://api.${"toonflow.net"}/v1`,
      }),
      models: JSON.stringify([{ id: "toonflow:legacy-image" }]),
      enable: 1,
    });
    await database("o_agentDeploy").insert({
      key: "scriptAgent",
      vendorId: "toonflow",
      modelName: "toonflow:legacy-language",
    });
    await database("o_project").insert({
      id: 7,
      imageModel: "toonflow:legacy-image",
      videoModel: "toonflow:legacy-video",
    });
    await database("o_modelPrompt").insert({ id: 3, vendorId: "toonflow" });

    await migrateLegacyBrandData(database);

    const vendor = await database("o_vendorConfig").where("id", "narrastage").first();
    expect(JSON.parse(vendor.inputValues)).toEqual({ apiKey: "preserved", baseUrl: "" });
    expect(vendor.models).toContain("narrastage:legacy-image");
    expect(await database("o_vendorConfig").where("id", "toonflow").first()).toBeUndefined();
    expect(await database("o_agentDeploy").where("key", "scriptAgent").first()).toMatchObject({
      vendorId: "narrastage",
      modelName: "narrastage:legacy-language",
    });
    expect(await database("o_project").where("id", 7).first()).toMatchObject({
      imageModel: "narrastage:legacy-image",
      videoModel: "narrastage:legacy-video",
    });
    expect(await database("o_modelPrompt").where("id", 3).first()).toMatchObject({
      vendorId: "narrastage",
    });
  });
});
