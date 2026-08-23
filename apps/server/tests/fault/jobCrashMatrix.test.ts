import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationRunner } from "@/generation/runner";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { defineProviderAdapter } from "@/providers/ports";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import { MediaAssetRepository } from "@/assets/mediaAssetRepository";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("paid submission crash matrix", () => {
  test("never submits twice after a crash between provider acceptance and handle persistence", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-crash-"));
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
      idempotencyKey: "crash-matrix-request",
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
    });
    let submitCount = 0;
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "fal",
        ports: [
          {
            operation: "video.generate",
            async start() {
              submitCount += 1;
              return { providerHandle: "provider-task-1", providerOutcome: "queued" as const };
            },
          },
        ],
      }),
    );

    const firstProcess = new GenerationRunner(repository, registry);
    await expect(
      firstProcess.runJob(job.id, {
        afterProviderAccepted: () => {
          throw new Error("fault.process_killed");
        },
      }),
    ).rejects.toThrow("fault.process_killed");
    expect((await repository.get(job.id))?.state).toBe("submitting");

    const restartedProcess = new GenerationRunner(repository, registry);
    expect(await restartedProcess.recoverInterruptedSubmissions()).toBe(1);
    expect((await repository.get(job.id))?.state).toBe("submission_unknown");
    await restartedProcess.runJob(job.id);
    expect(submitCount).toBe(1);
    await database.destroy();
  });

  test("records definitive provider rejection instead of inventing an unknown paid submission", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-rejected-"));
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
      idempotencyKey: "rejected-request",
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
    });
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "fal",
        ports: [
          {
            operation: "video.generate",
            async start() {
              throw new ProviderExecutionError({
                category: "auth",
                code: "fal.credential_missing",
                message: "fal credential missing",
                retryable: false,
              });
            },
          },
        ],
      }),
    );

    await new GenerationRunner(repository, registry).runJob(job.id);
    expect(await repository.get(job.id)).toMatchObject({
      state: "failed",
      providerOutcome: "failed",
      error: { code: "fal.credential_missing" },
    });
    expect((await repository.listAttempts(job.id))[0]).toMatchObject({
      state: "provider_rejected",
      error: { code: "fal.credential_missing" },
    });
    expect(await repository.recoverInterruptedSubmissions()).toBe(0);
    await database.destroy();
  });

  test("commits a synchronous image response and owned output as one durable result", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-image-sync-"));
    directories.push(directory);
    const database = knex({
      client: "sqlite3",
      connection: { filename: path.join(directory, "jobs.sqlite") },
      useNullAsDefault: true,
    });
    await runProviderPlatformMigrations(database);
    const repository = new GenerationJobRepository(database);
    const mediaAssets = new MediaAssetRepository(database, path.join(directory, "assets"));
    const job = await repository.createOrGet({
      schemaVersion: "2.0.0",
      idempotencyKey: "synchronous-image-request",
      canonicalModelId: "deepseek:ocr-2",
      offeringId: "deepseek:ocr-2:official",
      providerId: "deepseek",
      operation: "image.generate",
      input: { mode: "text", values: { prompt: "A paper boat" }, assets: [] },
    });
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "deepseek",
        ports: [
          {
            operation: "image.generate",
            async generate() {
              return {
                outputs: [
                  {
                    kind: "image" as const,
                    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                    mimeType: "image/png",
                  },
                ],
                providerRequestId: "google-request-1",
              };
            },
          },
        ],
      }),
    );

    await new GenerationRunner(repository, registry, {
      mediaAssetRepository: mediaAssets,
    }).runJob(job.id);

    const completed = await repository.get(job.id);
    expect(completed).toMatchObject({
      state: "succeeded",
      providerOutcome: "succeeded",
      providerHandle: "google-request-1",
      result: {
        artifacts: [{ kind: "image", mimeType: "image/png" }],
        provenance: { providerRequestId: "google-request-1" },
      },
    });
    const assetId = (completed?.result as { artifacts: Array<{ assetId: string }> }).artifacts[0]!
      .assetId;
    expect(await mediaAssets.getOwned(assetId, "local")).toMatchObject({ mimeType: "image/png" });
    expect((await repository.listAttempts(job.id))[0]).toMatchObject({
      state: "handle_persisted",
      providerHandle: "google-request-1",
    });
    expect((await repository.listEvents(job.id)).map((event) => event.toState)).toEqual([
      "queued",
      "preparing_assets",
      "submitting",
      "submitted",
      "importing",
      "succeeded",
    ]);
    await database.destroy();
  });

  test("never retries a synchronous image after the provider returned but before persistence", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-image-crash-"));
    directories.push(directory);
    const database = knex({
      client: "sqlite3",
      connection: { filename: path.join(directory, "jobs.sqlite") },
      useNullAsDefault: true,
    });
    await runProviderPlatformMigrations(database);
    const repository = new GenerationJobRepository(database);
    const mediaAssets = new MediaAssetRepository(database, path.join(directory, "assets"));
    const job = await repository.createOrGet({
      schemaVersion: "2.0.0",
      idempotencyKey: "synchronous-image-crash",
      canonicalModelId: "deepseek:ocr-2",
      offeringId: "deepseek:ocr-2:official",
      providerId: "deepseek",
      operation: "image.generate",
      input: { mode: "text", values: { prompt: "A paper boat" }, assets: [] },
    });
    let submitCount = 0;
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "deepseek",
        ports: [
          {
            operation: "image.generate",
            async generate() {
              submitCount += 1;
              return { outputs: [] };
            },
          },
        ],
      }),
    );
    const firstProcess = new GenerationRunner(repository, registry, {
      mediaAssetRepository: mediaAssets,
    });
    await expect(
      firstProcess.runJob(job.id, {
        afterProviderAccepted: () => {
          throw new Error("fault.process_killed");
        },
      }),
    ).rejects.toThrow("fault.process_killed");

    const restarted = new GenerationRunner(repository, registry, {
      mediaAssetRepository: mediaAssets,
    });
    expect(await restarted.recoverInterruptedSubmissions()).toBe(1);
    await restarted.runJob(job.id);
    expect(submitCount).toBe(1);
    expect((await repository.get(job.id))?.state).toBe("submission_unknown");
    await database.destroy();
  });
});
