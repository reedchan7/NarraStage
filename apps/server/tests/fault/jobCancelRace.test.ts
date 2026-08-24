import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationRunner } from "@/generation/runner";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { defineProviderAdapter } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("preserves provider success when cancellation loses the completion race", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-cancel-race-"));
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
    idempotencyKey: "cancel-race-request",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "fal",
      ports: [
        {
          operation: "video.generate",
          async start() {
            return { providerHandle: "queue-1", providerOutcome: "running" as const };
          },
        },
        {
          operation: "video.status",
          async status() {
            return { outcome: "succeeded" as const, outputs: [] };
          },
        },
        {
          operation: "video.cancel",
          async cancel() {
            return { outcome: "accepted" as const };
          },
        },
      ],
    }),
  );
  const runner = new GenerationRunner(repository, registry);
  await runner.runJob(job.id);
  await repository.requestCancellation(job.id, "no longer needed");
  await runner.pollJob(job.id);
  expect(await repository.get(job.id)).toMatchObject({
    state: "cancelled",
    providerOutcome: "succeeded",
  });
  await database.destroy();
});
