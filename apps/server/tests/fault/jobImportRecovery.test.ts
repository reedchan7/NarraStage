import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import type { AssetGateway } from "@/assets/assetGateway";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationRunner } from "@/generation/runner";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { defineProviderAdapter } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import type { MediaAssetRepository } from "@/assets/mediaAssetRepository";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("restarts a transient owned-storage import without polling or submitting the provider again", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-import-recovery-"));
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
    idempotencyKey: "import-recovery-case",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  const prepared = await repository.prepareSubmission(job.id);
  await repository.markSendStarted(job.id, prepared.attempt!.id);
  await repository.recordSubmission(job.id, prepared.attempt!.id, "remote-1", "queued");

  let statusCalls = 0;
  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "fal",
      ports: [
        {
          operation: "video.status" as const,
          async status() {
            statusCalls += 1;
            return {
              outcome: "succeeded" as const,
              providerRequestId: "request-1",
              outputs: [{ kind: "video" as const, url: "https://cdn.example/result.mp4" }],
            };
          },
        },
      ],
    }),
  );
  let imports = 0;
  const assetGateway = {
    async import() {
      imports += 1;
      if (imports === 1) throw new Error("asset.transport_failed");
      return {
        assetId: `sha256:${"b".repeat(64)}`,
        sha256: "b".repeat(64),
        path: path.join(directory, "owned.mp4"),
        mimeType: "video/mp4",
        bytes: 42,
      };
    },
  } as unknown as AssetGateway;
  const runner = new GenerationRunner(repository, registry, {
    assetGateway,
    now: () => job.createdAt + 1_000,
  });

  await runner.pollJob(job.id);
  expect(await repository.get(job.id)).toMatchObject({ state: "importing" });
  await runner.pollJob(job.id);
  expect(await repository.get(job.id)).toMatchObject({ state: "succeeded" });
  expect(statusCalls).toBe(1);
  expect(imports).toBe(2);
  await database.destroy();
});

test("moves byte outputs into durable import state before owned storage can fail", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-byte-import-recovery-"));
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
    idempotencyKey: "byte-import-recovery-case",
    canonicalModelId: "google:veo-3.1",
    offeringId: "google:veo-3.1:official",
    providerId: "google",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  const prepared = await repository.prepareSubmission(job.id);
  await repository.markSendStarted(job.id, prepared.attempt!.id);
  await repository.recordSubmission(job.id, prepared.attempt!.id, "operation-1", "queued");

  let statusCalls = 0;
  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "google",
      ports: [
        {
          operation: "video.status" as const,
          async status() {
            statusCalls += 1;
            return {
              outcome: "succeeded" as const,
              providerRequestId: "google-request-1",
              outputs: [
                {
                  kind: "video" as const,
                  bytes: new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]),
                  mimeType: "video/mp4",
                },
              ],
            };
          },
        },
      ],
    }),
  );
  let writes = 0;
  const mediaAssetRepository = {
    async ingestOwnedBytes() {
      writes += 1;
      if (writes === 1) throw new Error("asset.storage_transient");
      return {
        id: `sha256:${"c".repeat(64)}`,
        sha256: "c".repeat(64),
        filePath: path.join(directory, "owned.mp4"),
        mimeType: "video/mp4",
        byteLength: 12,
        kind: "video" as const,
      };
    },
  } as unknown as MediaAssetRepository;
  const runner = new GenerationRunner(repository, registry, {
    mediaAssetRepository,
    now: () => job.createdAt + 1_000,
  });

  await runner.pollJob(job.id);
  expect(await repository.get(job.id)).toMatchObject({
    state: "importing",
    importAttemptCount: 1,
    providerOutcome: "succeeded",
  });
  await runner.pollJob(job.id);
  expect(await repository.get(job.id)).toMatchObject({ state: "succeeded" });
  expect(statusCalls).toBe(2);
  expect(writes).toBe(2);
  await database.destroy();
});
