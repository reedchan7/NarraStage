import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { GenerationJobRepository } from "@/generation/jobRepository";
import type { CreateGenerationJobRequest } from "@/generation/domain";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createRepository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-jobs-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "jobs.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  return { database, repository: new GenerationJobRepository(database) };
}

const request = {
  schemaVersion: "2.0.0",
  idempotencyKey: "client-request-1",
  canonicalModelId: "minimax:h3",
  offeringId: "minimax:h3:fal",
  providerId: "fal",
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
} satisfies CreateGenerationJobRequest;

describe("generation job repository", () => {
  test("deduplicates identical client submissions and rejects key reuse with another payload", async () => {
    const { database, repository } = await createRepository();
    const first = await repository.createOrGet(request);
    const duplicate = await repository.createOrGet(request);
    expect(duplicate.id).toBe(first.id);
    expect(
      await database("o_generation_jobs").count<{ count: number }>("id as count").first(),
    ).toMatchObject({ count: 1 });

    await expect(
      repository.createOrGet({
        ...request,
        input: { ...request.input, values: { ...request.input.values, prompt: "Different" } },
      }),
    ).rejects.toThrow("generation.idempotency_conflict");
    await database.destroy();
  });

  test("persists every accepted transition as an ordered event", async () => {
    const { database, repository } = await createRepository();
    const job = await repository.createOrGet(request);
    await repository.transition(job.id, "preparing_assets", "runner.preparing_assets");
    await repository.transition(job.id, "submitting", "runner.submitting");

    expect((await repository.get(job.id))?.state).toBe("submitting");
    expect(
      (await repository.listEvents(job.id)).map((event) => [event.fromState, event.toState]),
    ).toEqual([
      [null, "queued"],
      ["queued", "preparing_assets"],
      ["preparing_assets", "submitting"],
    ]);
    await database.destroy();
  });

  test("persists a typed consumer reference outside provider input", async () => {
    const { database, repository } = await createRepository();
    const job = await repository.createOrGet({
      ...request,
      idempotencyKey: "workbench-client-request-1",
      consumer: {
        type: "workbench",
        key: "project:3:script:4:track:5",
        context: { projectId: 3, scriptId: 4, trackId: 5 },
      },
    });
    expect(job.consumer).toEqual({
      type: "workbench",
      key: "project:3:script:4:track:5",
      context: { projectId: 3, scriptId: 4, trackId: 5 },
    });
    expect(JSON.stringify(job.input)).not.toContain("trackId");
    await database.destroy();
  });

  test("honors cancellation when reconciliation proves no provider submission", async () => {
    const { database, repository } = await createRepository();
    const job = await repository.createOrGet({ ...request, idempotencyKey: "cancel-reconcile-1" });
    const { attempt } = await repository.prepareSubmission(job.id);
    expect(attempt).toBeDefined();
    await repository.markSendStarted(job.id, attempt!.id);
    await repository.recoverInterruptedSubmission(job.id);
    await repository.requestCancellation(job.id, "user requested cancellation");

    const reconciled = await repository.reconcile({
      id: job.id,
      action: "confirm_not_submitted",
      actor: "operator:test",
      reason: "provider audit found no request",
      evidence: {
        kind: "provider_lookup",
        lookupMethod: "provider_console",
        checkedAt: "2026-08-23T12:00:00+08:00",
        requestIdentity: "audit-1",
        outcome: "not_found",
        responseSha256: "b".repeat(64),
      },
    });

    expect(reconciled.state).toBe("cancelled");
    expect(reconciled.providerHandle).toBeUndefined();
    await database.destroy();
  });

  test("recovers only expired submitting leases and distinguishes prepared from send_started", async () => {
    const { database, repository } = await createRepository();
    const active = await repository.createOrGet({ ...request, idempotencyKey: "active-lease-1" });
    await repository.prepareSubmission(active.id);
    await database("o_generation_jobs")
      .where({ id: active.id })
      .update({
        lease_owner: "live-worker",
        lease_expires_at: active.createdAt + 10_000,
      });
    const prepared = await repository.createOrGet({ ...request, idempotencyKey: "prepared-1" });
    await repository.prepareSubmission(prepared.id);
    const sent = await repository.createOrGet({ ...request, idempotencyKey: "sent-case-1" });
    const sentAttempt = await repository.prepareSubmission(sent.id);
    await repository.markSendStarted(sent.id, sentAttempt.attempt!.id);

    expect(await repository.recoverInterruptedSubmissions(active.createdAt + 1)).toBe(2);
    expect((await repository.get(active.id))?.state).toBe("submitting");
    expect((await repository.get(prepared.id))?.state).toBe("submitting");
    expect((await repository.get(sent.id))?.state).toBe("submission_unknown");
    expect((await repository.listAttempts(prepared.id))[0]?.state).toBe("prepared");
    await database.destroy();
  });

  test("paginates equal timestamps with a stable composite cursor", async () => {
    const { database, repository } = await createRepository();
    const jobs = await Promise.all(
      ["cursor-case-1", "cursor-case-2", "cursor-case-3"].map((idempotencyKey) =>
        repository.createOrGet({ ...request, idempotencyKey }),
      ),
    );
    const sameUpdatedAt = jobs[0]!.createdAt + 100;
    await database("o_generation_jobs").update({ updated_at: sameUpdatedAt });

    const first = await repository.listForPrincipal({ principalId: "local", limit: 2 });
    const second = await repository.listForPrincipal({
      principalId: "local",
      limit: 2,
      cursor: { updatedAt: first[1]!.updatedAt, id: first[1]!.id },
    });

    expect([...first, ...second].map((job) => job.id)).toEqual(
      [...jobs].sort((left, right) => left.id.localeCompare(right.id)).map((job) => job.id),
    );
    await database.destroy();
  });
});
