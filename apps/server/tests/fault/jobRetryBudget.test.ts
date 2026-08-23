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

test("exhausted polling budget becomes a durable terminal failure instead of a hot loop", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-poll-budget-"));
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
    idempotencyKey: "poll-budget-case",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  const prepared = await repository.prepareSubmission(job.id);
  await repository.markSendStarted(job.id, prepared.attempt!.id);
  await repository.recordSubmission(job.id, prepared.attempt!.id, "remote-1", "queued");
  await database("o_generation_jobs").where({ id: job.id }).update({ poll_attempt_count: 120 });

  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "fal",
      ports: [
        {
          operation: "video.status" as const,
          async status() {
            return { outcome: "queued" as const };
          },
        },
      ],
    }),
  );
  await new GenerationRunner(repository, registry, { now: () => job.createdAt }).pollJob(job.id);

  expect(await repository.get(job.id)).toMatchObject({
    state: "failed",
    providerOutcome: "queued",
    error: { code: "generation.retry_budget_exhausted" },
  });
  await database.destroy();
});

test("job creation persists a finite observation deadline", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-job-deadline-"));
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
    idempotencyKey: "deadline-case-1",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });

  expect(job.deadlineAt).toBeGreaterThan(job.createdAt);
  expect(job.deadlineAt! - job.createdAt).toBeLessThanOrEqual(24 * 60 * 60 * 1_000);
  await database.destroy();
});
