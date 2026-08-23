import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationLeaseRepository } from "@/generation/leaseRepository";
import { GenerationRunner } from "@/generation/runner";
import { DurableGenerationWorker } from "@/generation/worker";
import { JobChangePublisher } from "@/generation/jobChanges";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { defineProviderAdapter } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("worker conservatively reconciles a dropped submit and never loops into a second create", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-worker-submit-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "jobs.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  const repository = new GenerationJobRepository(database);
  const job = await repository.createOrGet({
    schemaVersion: "2.0.0",
    idempotencyKey: "worker-ambiguous-request",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  let creates = 0;
  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "fal",
      ports: [
        {
          operation: "video.generate",
          async start() {
            creates += 1;
            throw new Error("connection dropped after write");
          },
        },
      ],
    }),
  );
  const worker = new DurableGenerationWorker(
    repository,
    new GenerationLeaseRepository(database),
    new GenerationRunner(repository, registry),
    new JobChangePublisher(),
    { owner: "worker-test", now: () => job.createdAt, batchSize: 1 },
  );
  expect(await worker.tick()).toBe(1);
  expect((await repository.get(job.id))?.state).toBe("submission_unknown");
  expect(await worker.tick()).toBe(0);
  expect(creates).toBe(1);
  await worker.stop();
  await database.destroy();
});
