import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { MediaAssetRepository } from "@/assets/mediaAssetRepository";
import { WorkbenchAssetIngestService } from "@/assets/workbenchAssetIngestService";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-workbench-assets-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "media.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  await database.schema.createTable("o_storyboard", (table) => {
    table.integer("id").primary();
    table.integer("projectId");
    table.string("filePath");
  });
  await database.schema.createTable("o_assets", (table) => {
    table.integer("id").primary();
    table.integer("projectId");
    table.integer("imageId");
  });
  await database.schema.createTable("o_image", (table) => {
    table.integer("id").primary();
    table.string("filePath");
  });
  const files = new Map<string, Buffer>([
    ["/project/scene.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ]);
  const service = new WorkbenchAssetIngestService({
    database,
    repository: new MediaAssetRepository(database, path.join(directory, "content")),
    async readFile(filePath) {
      const file = files.get(filePath);
      if (!file) throw new Error("missing fixture");
      return file;
    },
  });
  return { database, service };
}

describe("workbench media ingestion", () => {
  test("resolves only a source belonging to the requested project", async () => {
    const { database, service } = await setup();
    await database("o_storyboard").insert({
      id: 7,
      projectId: 3,
      filePath: "/project/scene.png",
    });
    const assets = await service.ingest({
      principalId: "local",
      projectId: 3,
      items: [{ source: "storyboard", id: 7, kind: "image", role: "first_frame" }],
    });
    expect(assets[0]).toMatchObject({
      kind: "image",
      role: "first_frame",
      mimeType: "image/png",
    });
    await expect(
      service.ingest({
        principalId: "local",
        projectId: 4,
        items: [{ source: "storyboard", id: 7, kind: "image", role: "first_frame" }],
      }),
    ).rejects.toThrow("asset.source_not_found");
    await database.destroy();
  });
});
