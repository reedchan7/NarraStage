import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { MediaAssetRepository } from "@/assets/mediaAssetRepository";
import { AssetImageGenerationMaterializer } from "@/generation/assetImageMaterializer";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("materializes a successful owned image into asset history exactly once", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-asset-materialize-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "db.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  await database.schema.createTable("o_assets", (table) => {
    table.integer("id").primary();
    table.integer("projectId");
    table.string("type");
  });
  await database.schema.createTable("o_image", (table) => {
    table.increments("id").primary();
    table.string("filePath");
    table.string("type");
    table.integer("assetsId");
    table.string("model");
    table.string("resolution");
    table.string("state");
  });
  await database("o_assets").insert({ id: 8, projectId: 3, type: "role" });

  const assets = new MediaAssetRepository(database, path.join(directory, "owned"));
  const image = await assets.ingestOwnedBytes({
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]),
    declaredKind: "image",
    principalId: "local",
    sourceKind: "provider_output",
  });
  const jobs = new GenerationJobRepository(database);
  const job = await jobs.createOrGet(
    {
      schemaVersion: "2.0.0",
      idempotencyKey: "asset-materialize-job-1",
      canonicalModelId: "google:nano-banana-2",
      offeringId: "google:nano-banana-2:official",
      providerId: "google",
      operation: "image.generate",
      input: {
        mode: "text",
        values: { prompt: "A hero", imageSize: "2K", aspectRatio: "16:9" },
        assets: [],
      },
      consumer: {
        type: "asset_image",
        key: "project:3:asset:8",
        context: { projectId: 3, assetId: 8, assetType: "role" },
      },
    },
    "local",
  );
  await database("o_generation_jobs")
    .where({ id: job.id })
    .update({
      state: "succeeded",
      result_json: JSON.stringify({
        schemaVersion: "1.0.0",
        artifacts: [{ id: "artifact-1", kind: "image", assetId: image.id, mimeType: "image/png" }],
        provenance: {
          providerId: "google",
          offeringId: "google:nano-banana-2:official",
          providerModelId: "gemini-3.1-flash-image",
        },
      }),
    });

  const materializer = new AssetImageGenerationMaterializer({
    database,
    jobs,
    assets,
    ossRoot: path.join(directory, "oss"),
  });
  const first = await materializer.materialize({ jobId: job.id, principalId: "local" });
  const second = await materializer.materialize({ jobId: job.id, principalId: "local" });
  expect(second).toEqual(first);
  expect(await Bun.file(path.join(directory, "oss", first.filePath)).exists()).toBe(true);
  expect(await database("o_image").count<{ count: number }>("id as count").first()).toMatchObject({
    count: 1,
  });
  await database.destroy();
});
