import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { GenerationService } from "@/generation/generationService";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { toGenerationJobView } from "@/generation/view";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { ProviderCatalog } from "@/providers/domain/models";
import type { OfferingAvailabilityService } from "@/providers/availability/offeringAvailability";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function setup(availability?: OfferingAvailabilityService) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-service-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "jobs.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  const catalog = structuredClone(builtinCatalog) as ProviderCatalog;
  const offering = catalog.offerings.find((candidate) => candidate.id === "minimax:h3:fal")!;
  offering.support.implementation = "implemented";
  const repository = new GenerationJobRepository(database);
  const service = new GenerationService(repository, undefined, catalog, availability);
  return { database, repository, service };
}

const request = {
  schemaVersion: "2.0.0" as const,
  idempotencyKey: "service-request-key",
  canonicalModelId: "minimax:h3",
  offeringId: "minimax:h3:fal",
  operation: "video.generate" as const,
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
};

describe("generation service boundary", () => {
  test("scopes idempotency by principal and emits version-only change notifications", async () => {
    const { database, service } = await setup();
    const notices: unknown[] = [];
    service.changes.subscribe((notice) => notices.push(notice));
    const first = await service.submit(request, "principal-canary-a");
    const duplicate = await service.submit(request, "principal-canary-a");
    const anotherPrincipal = await service.submit(request, "principal-canary-b");
    expect(duplicate.id).toBe(first.id);
    expect(anotherPrincipal.id).not.toBe(first.id);
    expect(notices[0]).toEqual({ jobId: first.id, principalId: "principal-canary-a", version: 0 });
    expect(JSON.stringify(toGenerationJobView(first))).not.toContain("principal-canary-a");
    await database.destroy();
  });

  test("rejects a client-forged model/offering association before persistence", async () => {
    const { database, service } = await setup();
    await expect(
      service.submit({ ...request, canonicalModelId: "deepseek:v4-pro" }, "local"),
    ).rejects.toThrow("generation.offering_model_mismatch");
    expect(await service.list({ principalId: "local", limit: 10 })).toEqual([]);
    await database.destroy();
  });

  test("rejects runtime-unavailable offerings before creating a job", async () => {
    const availability = {
      resolve: async (offeringId: string, operation: string) => ({
        offeringId,
        operation,
        available: false,
        reasonCodes: ["credential.missing"],
      }),
    } as unknown as OfferingAvailabilityService;
    const { database, service } = await setup(availability);
    await expect(service.submit(request, "local")).rejects.toMatchObject({
      message: "generation.offering_unavailable",
      violations: [
        {
          code: "credential.missing",
          path: "",
          message: "Offering is unavailable: credential.missing",
        },
      ],
    });
    expect(await service.list({ principalId: "local", limit: 10 })).toEqual([]);
    await database.destroy();
  });

  test("authorizes provider-state continuations through an owned completed parent job", async () => {
    const { database, service } = await setup();
    const parentRequest = {
      schemaVersion: "2.0.0" as const,
      idempotencyKey: "omni-parent-request",
      canonicalModelId: "google:gemini-omni-flash",
      offeringId: "google:gemini-omni-flash:official",
      operation: "video.generate" as const,
      input: {
        mode: "text",
        values: { prompt: "A blue paper boat", durationSeconds: 6, resolution: "720P" },
        assets: [],
      },
    };
    const parent = await service.submit(parentRequest, "owner-a");
    await database("o_generation_jobs")
      .where({ id: parent.id })
      .update({
        state: "succeeded",
        result_json: JSON.stringify({
          schemaVersion: "1.0.0",
          artifacts: [],
          provenance: {
            providerId: "google",
            offeringId: "google:gemini-omni-flash:official",
            providerModelId: "gemini-omni-flash-preview",
            providerRequestId: "interaction-parent-1",
          },
        }),
      });

    const continuation = await service.submit(
      {
        ...parentRequest,
        idempotencyKey: "omni-continuation-request",
        input: { mode: "edit", values: { prompt: "Make the boat red" }, assets: [] },
        continuation: { parentJobId: parent.id },
      },
      "owner-a",
    );
    expect(continuation.continuation).toEqual({ parentJobId: parent.id });

    await expect(
      service.submit(
        {
          ...parentRequest,
          idempotencyKey: "omni-cross-principal-request",
          input: { mode: "edit", values: { prompt: "Make the boat green" }, assets: [] },
          continuation: { parentJobId: parent.id },
        },
        "owner-b",
      ),
    ).rejects.toThrow("generation.continuation_parent_not_found");
    await database.destroy();
  });
});
