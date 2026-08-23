import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import knex from "knex";
import { AssetGateway, type OutboundTransport } from "@/assets/assetGateway";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationRunner } from "@/generation/runner";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { defineProviderAdapter, type VideoStatusResult } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("restores a persisted provider handle, polls to owned storage, and never creates twice", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-restart-"));
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
    idempotencyKey: "restart-recovery-request",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  let creates = 0;
  const statuses: VideoStatusResult[] = [
    { outcome: "queued", retryAfterMs: 2_000 },
    {
      outcome: "succeeded",
      outputs: [{ kind: "video", url: "https://cdn.example/result.mp4", mimeType: "video/mp4" }],
      providerRequestId: "request-1",
    },
  ];
  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "fal",
      ports: [
        {
          operation: "video.generate",
          async start() {
            creates += 1;
            return { providerHandle: "queue-1", providerOutcome: "queued" as const };
          },
        },
        {
          operation: "video.status",
          async status() {
            return statuses.shift()!;
          },
        },
      ],
    }),
  );
  const transport: OutboundTransport = {
    async open() {
      return {
        statusCode: 200,
        headers: { "content-type": "video/mp4" },
        body: Readable.from([
          Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
        ]),
        dispose() {},
      };
    },
  };
  const gateway = new AssetGateway({
    rootDirectory: path.join(directory, "assets"),
    resolver: async () => [{ address: "8.8.8.8", family: 4 }],
    transport,
  });

  await new GenerationRunner(repository, registry).runJob(job.id);
  expect((await repository.get(job.id))?.state).toBe("submitted");

  const restarted = new GenerationRunner(repository, registry, {
    assetGateway: gateway,
    now: () => 10_000,
    random: () => 0,
  });
  await restarted.pollJob(job.id);
  expect(await repository.get(job.id)).toMatchObject({
    state: "remote_queued",
    nextRunAt: 12_000,
  });
  await restarted.pollJob(job.id);
  const completed = await repository.get(job.id);
  expect(completed).toMatchObject({ state: "succeeded", providerOutcome: "succeeded" });
  expect(JSON.stringify(completed?.result)).not.toContain("cdn.example");
  expect(creates).toBe(1);
  await database.destroy();
});
