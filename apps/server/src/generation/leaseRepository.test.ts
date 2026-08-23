import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationLeaseRepository } from "@/generation/leaseRepository";
import { runProviderPlatformMigrations } from "@/lib/migrations";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("only one runner owns a job until its lease expires", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-lease-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "jobs.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  const jobs = new GenerationJobRepository(database);
  const job = await jobs.createOrGet({
    schemaVersion: "2.0.0",
    idempotencyKey: "lease-request-1",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  const leases = new GenerationLeaseRepository(database);
  const now = job.createdAt;
  expect(await leases.claimDueJobs({ owner: "runner-a", now, leaseMs: 50, limit: 1 })).toEqual([
    job.id,
  ]);
  expect(
    await leases.claimDueJobs({ owner: "runner-b", now: now + 20, leaseMs: 50, limit: 1 }),
  ).toEqual([]);
  expect(await leases.heartbeat(job.id, "runner-b", now + 20, 50)).toBe(false);
  expect(
    await leases.claimDueJobs({ owner: "runner-b", now: now + 51, leaseMs: 50, limit: 1 }),
  ).toEqual([job.id]);
  expect(await leases.release(job.id, "runner-a")).toBe(false);
  expect(await leases.release(job.id, "runner-b")).toBe(true);
  await database.destroy();
});
