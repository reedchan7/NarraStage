import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { runProviderPlatformMigrations } from "@/lib/migrations";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function setup(suffix: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), `narrastage-cancel-${suffix}-`));
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
    idempotencyKey: `cancel-${suffix}`,
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
  });
  return { database, repository, job };
}

describe("generation cancel and reconciliation", () => {
  test("cancels before submission and records intent without lying about remote outcome", async () => {
    const { database, repository, job } = await setup("early");
    const cancelled = await repository.requestCancellation(job.id, "user changed direction");
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("user changed direction");
    expect(cancelled.providerOutcome).toBeUndefined();
    expect((await repository.requestCancellation(job.id, "duplicate")).version).toBe(
      cancelled.version,
    );
    await database.destroy();
  });

  test("requires evidence to resubmit an unknown outcome and keeps reconciliation audit immutable", async () => {
    const { database, repository, job } = await setup("unknown");
    const { attempt } = await repository.prepareSubmission(job.id);
    await repository.markSendStarted(job.id, attempt!.id);
    await repository.recoverInterruptedSubmissions();
    await expect(
      repository.reconcile({
        id: job.id,
        action: "confirm_not_submitted",
        actor: "local-admin",
        reason: "provider lookup returned no task",
        evidence: null as never,
      }),
    ).rejects.toThrow("generation.reconcile_evidence_required");
    await expect(
      repository.reconcile({
        id: job.id,
        action: "confirm_not_submitted",
        actor: "local-admin",
        reason: "provider lookup returned no task",
        evidence: {} as never,
      }),
    ).rejects.toThrow("generation.reconcile_evidence_required");

    const queued = await repository.reconcile({
      id: job.id,
      action: "confirm_not_submitted",
      actor: "local-admin",
      reason: "provider lookup returned no task",
      evidence: {
        kind: "provider_lookup",
        lookupMethod: "provider_api",
        checkedAt: "2026-08-23T12:00:00+08:00",
        requestIdentity: "lookup-1",
        outcome: "not_found",
        responseSha256: "a".repeat(64),
      },
    });
    expect(queued.state).toBe("queued");
    expect(await repository.listReconciliations(job.id)).toHaveLength(1);
    await expect(
      (async () =>
        database("o_generation_reconciliations")
          .where({ job_id: job.id })
          .update({ reason: "x" }))(),
    ).rejects.toThrow("generation.reconciliation_audit_immutable");
    await database.destroy();
  });

  test("adopts a provider handle without issuing another create", async () => {
    const { database, repository, job } = await setup("adopt");
    const { attempt } = await repository.prepareSubmission(job.id);
    await repository.markSendStarted(job.id, attempt!.id);
    await repository.recoverInterruptedSubmissions();
    const adopted = await repository.reconcile({
      id: job.id,
      action: "adopt_handle",
      actor: "local-admin",
      reason: "matched provider request ledger",
      providerHandle: "remote-42",
    });
    expect(adopted).toMatchObject({ state: "submitted", providerHandle: "remote-42" });
    expect((await repository.listAttempts(job.id))[0]).toMatchObject({
      state: "handle_persisted",
      providerHandle: "remote-42",
    });
    await database.destroy();
  });
});
