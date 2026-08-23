import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { MediaAssetRepository } from "@/assets/mediaAssetRepository";
import { WorkbenchGenerationMaterializer } from "@/generation/workbenchMaterializer";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("materializes a successful owned video into Workbench exactly once", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-materialize-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "db.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  await database.schema.createTable("o_videoTrack", (table) => {
    table.integer("id").primary();
    table.integer("projectId");
    table.integer("scriptId");
  });
  await database.schema.createTable("o_video", (table) => {
    table.increments("id").primary();
    table.string("filePath");
    table.bigInteger("time");
    table.string("state");
    table.integer("scriptId");
    table.integer("projectId");
    table.integer("videoTrackId");
  });
  await database("o_videoTrack").insert({ id: 5, projectId: 3, scriptId: 4 });

  const assets = new MediaAssetRepository(database, path.join(directory, "owned"));
  const video = await assets.ingestOwnedBytes({
    bytes: Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    declaredKind: "video",
    principalId: "local",
    sourceKind: "provider_output",
  });
  const jobs = new GenerationJobRepository(database);
  const job = await jobs.createOrGet(
    {
      schemaVersion: "2.0.0",
      idempotencyKey: "materialize-job-1",
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
      operation: "video.generate",
      input: {
        mode: "text",
        values: {
          prompt: "A paper boat",
          durationSeconds: 5,
          resolution: "768P",
          aspectRatio: "16:9",
        },
        assets: [],
      },
      consumer: {
        type: "workbench",
        key: "project:3:script:4:track:5",
        context: { projectId: 3, scriptId: 4, trackId: 5 },
      },
    },
    "local",
  );
  await database("o_generation_jobs")
    .where({ id: job.id })
    .update({
      state: "succeeded",
      result_json: JSON.stringify({ artifacts: [{ kind: "video", assetId: video.id }] }),
    });

  const materializer = new WorkbenchGenerationMaterializer({
    database,
    jobs,
    assets,
    ossRoot: path.join(directory, "oss"),
  });
  const first = await materializer.materialize({ jobId: job.id, principalId: "local" });
  const second = await materializer.materialize({ jobId: job.id, principalId: "local" });
  expect(second).toEqual(first);
  expect(await Bun.file(path.join(directory, "oss", first.filePath)).exists()).toBe(true);
  expect(await database("o_video").count<{ count: number }>("id as count").first()).toMatchObject({
    count: 1,
  });
  await database.destroy();
});
