import type { Knex } from "knex";
import {
  createGenerationJobRequestSchema,
  generationRequestHash,
  newGenerationJobId,
  stableJson,
  type CreateGenerationJobRequest,
  type GenerationAttempt,
  type GenerationJob,
  type GenerationJobEvent,
  generationImportPayloadSchema,
  providerLookupEvidenceSchema,
  type GenerationImportPayload,
  type ReconciliationAction,
  type ProviderLookupEvidence,
  type ReconciliationRecord,
} from "@/generation/domain";
import {
  assertJobTransition,
  generationJobStateSchema,
  type GenerationJobState,
} from "@/generation/stateMachine";
import { operationSchema } from "@/providers/domain/operations";
import type { GenerationJobCursor } from "@/generation/pagination";

interface JobRow {
  id: string;
  schema_version: string;
  principal_id: string;
  idempotency_key: string;
  request_hash: string;
  canonical_model_id: string;
  offering_id: string;
  provider_id: string;
  operation: string;
  input_json: string;
  consumer_type: string | null;
  consumer_key: string | null;
  consumer_context_json: string | null;
  parent_job_id: string | null;
  state: string;
  provider_handle: string | null;
  provider_outcome: GenerationJob["providerOutcome"] | null;
  result_json: string | null;
  error_json: string | null;
  cancel_requested_at: number | null;
  cancel_reason: string | null;
  next_run_at: number;
  deadline_at: number | null;
  poll_attempt_count: number;
  import_payload_json: string | null;
  import_attempt_count: number;
  import_deadline_at: number | null;
  lease_owner: string | null;
  lease_expires_at: number | null;
  version: number;
  created_at: number;
  updated_at: number;
}

interface AttemptRow {
  id: string;
  job_id: string;
  sequence: number;
  provider_id: string;
  offering_id: string;
  provider_idempotency_key: string;
  state: GenerationAttempt["state"];
  provider_handle: string | null;
  error_json: string | null;
  created_at: number;
  updated_at: number;
}

interface ReconciliationRow {
  id: number;
  job_id: string;
  action: ReconciliationAction;
  actor: string;
  reason: string;
  evidence_json: string | null;
  provider_handle: string | null;
  created_at: number;
}

function parseOptionalJson(value: string | null): unknown | undefined {
  return value === null ? undefined : JSON.parse(value);
}

function toJob(row: JobRow): GenerationJob {
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    principalId: row.principal_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    canonicalModelId: row.canonical_model_id,
    offeringId: row.offering_id,
    providerId: row.provider_id,
    operation: operationSchema.parse(row.operation),
    input: JSON.parse(row.input_json),
    ...(row.consumer_type && row.consumer_key && row.consumer_context_json
      ? {
          consumer: {
            type: row.consumer_type,
            key: row.consumer_key,
            context: JSON.parse(row.consumer_context_json),
          } as GenerationJob["consumer"],
        }
      : {}),
    ...(row.parent_job_id ? { continuation: { parentJobId: row.parent_job_id } } : {}),
    state: generationJobStateSchema.parse(row.state),
    ...(row.provider_handle ? { providerHandle: row.provider_handle } : {}),
    ...(row.provider_outcome ? { providerOutcome: row.provider_outcome } : {}),
    ...(row.result_json ? { result: parseOptionalJson(row.result_json) } : {}),
    ...(row.error_json ? { error: parseOptionalJson(row.error_json) } : {}),
    ...(row.cancel_requested_at ? { cancelRequestedAt: row.cancel_requested_at } : {}),
    ...(row.cancel_reason ? { cancelReason: row.cancel_reason } : {}),
    nextRunAt: row.next_run_at,
    ...(row.deadline_at ? { deadlineAt: row.deadline_at } : {}),
    pollAttemptCount: row.poll_attempt_count,
    importAttemptCount: row.import_attempt_count,
    ...(row.import_deadline_at ? { importDeadlineAt: row.import_deadline_at } : {}),
    ...(row.lease_owner ? { leaseOwner: row.lease_owner } : {}),
    ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAttempt(row: AttemptRow): GenerationAttempt {
  return {
    id: row.id,
    jobId: row.job_id,
    sequence: row.sequence,
    providerId: row.provider_id,
    offeringId: row.offering_id,
    providerIdempotencyKey: row.provider_idempotency_key,
    state: row.state,
    ...(row.provider_handle ? { providerHandle: row.provider_handle } : {}),
    ...(row.error_json ? { error: JSON.parse(row.error_json) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GenerationJobRepository {
  private readonly database: Knex;

  constructor(database: Knex) {
    this.database = database;
  }

  async createOrGet(
    rawRequest: CreateGenerationJobRequest,
    principalId = "local",
  ): Promise<GenerationJob> {
    const request = createGenerationJobRequestSchema.parse(rawRequest);
    const requestHash = generationRequestHash(request);
    const identity = {
      principal_id: principalId,
      operation: request.operation,
      idempotency_key: request.idempotencyKey,
    };
    const existing = (await this.database("o_generation_jobs").where(identity).first()) as
      | JobRow
      | undefined;
    if (existing) {
      if (existing.request_hash !== requestHash) throw new Error("generation.idempotency_conflict");
      return toJob(existing);
    }

    const now = Date.now();
    const id = newGenerationJobId();
    try {
      await this.database.transaction(async (transaction) => {
        await transaction("o_generation_jobs").insert({
          id,
          schema_version: request.schemaVersion,
          principal_id: principalId,
          idempotency_key: request.idempotencyKey,
          request_hash: requestHash,
          canonical_model_id: request.canonicalModelId,
          offering_id: request.offeringId,
          provider_id: request.providerId,
          operation: request.operation,
          input_json: stableJson(request.input),
          ...(request.consumer
            ? {
                consumer_type: request.consumer.type,
                consumer_key: request.consumer.key,
                consumer_context_json: stableJson(request.consumer.context),
              }
            : {}),
          ...(request.continuation ? { parent_job_id: request.continuation.parentJobId } : {}),
          state: "queued",
          next_run_at: now,
          deadline_at: now + 24 * 60 * 60 * 1_000,
          poll_attempt_count: 0,
          version: 0,
          created_at: now,
          updated_at: now,
        });
        await transaction("o_generation_job_events").insert({
          job_id: id,
          sequence: 0,
          from_state: null,
          to_state: "queued",
          reason: "client.submitted",
          created_at: now,
        });
      });
    } catch (error) {
      const raced = (await this.database("o_generation_jobs").where(identity).first()) as
        | JobRow
        | undefined;
      if (!raced) throw error;
      if (raced.request_hash !== requestHash) throw new Error("generation.idempotency_conflict");
      return toJob(raced);
    }
    return (await this.get(id))!;
  }

  async get(id: string): Promise<GenerationJob | undefined> {
    const row = (await this.database("o_generation_jobs").where({ id }).first()) as
      | JobRow
      | undefined;
    return row ? toJob(row) : undefined;
  }

  async getForPrincipal(id: string, principalId: string): Promise<GenerationJob | undefined> {
    const row = (await this.database("o_generation_jobs")
      .where({ id, principal_id: principalId })
      .first()) as JobRow | undefined;
    return row ? toJob(row) : undefined;
  }

  async listForPrincipal(input: {
    principalId: string;
    limit: number;
    beforeUpdatedAt?: number;
    cursor?: GenerationJobCursor;
    states?: GenerationJobState[];
    recoveryOnly?: boolean;
  }): Promise<GenerationJob[]> {
    const query = this.database("o_generation_jobs")
      .where({ principal_id: input.principalId })
      .orderBy("updated_at", "desc")
      .orderBy("id", "asc")
      .limit(Math.min(Math.max(input.limit, 1), 101));
    if (input.beforeUpdatedAt !== undefined) query.where("updated_at", "<", input.beforeUpdatedAt);
    if (input.cursor) {
      query.andWhere((builder) => {
        builder.where("updated_at", "<", input.cursor!.updatedAt).orWhere((sameTimestamp) => {
          sameTimestamp
            .where("updated_at", input.cursor!.updatedAt)
            .andWhere("id", ">", input.cursor!.id);
        });
      });
    }
    if (input.states?.length) query.whereIn("state", input.states);
    if (input.recoveryOnly) {
      query.andWhere((recovery) => {
        recovery
          .whereIn("state", [
            "queued",
            "preparing_assets",
            "submitting",
            "submitted",
            "remote_queued",
            "running",
            "importing",
            "submission_unknown",
          ])
          .orWhere((pending) => {
            pending.where("state", "succeeded").andWhere((consumer) => {
              consumer
                .where((workbench) => {
                  workbench.where("consumer_type", "workbench").whereNotExists(function () {
                    this.select(1)
                      .from("o_generation_workbench_outputs")
                      .whereRaw("o_generation_workbench_outputs.job_id = o_generation_jobs.id");
                  });
                })
                .orWhere((assetImage) => {
                  assetImage.where("consumer_type", "asset_image").whereNotExists(function () {
                    this.select(1)
                      .from("o_generation_asset_outputs")
                      .whereRaw("o_generation_asset_outputs.job_id = o_generation_jobs.id");
                  });
                });
            });
          });
      });
    }
    return ((await query) as JobRow[]).map(toJob);
  }

  async prepareSubmission(
    id: string,
  ): Promise<{ job: GenerationJob; attempt?: GenerationAttempt }> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");

      if (row.cancel_requested_at) {
        if (["queued", "preparing_assets", "submitting"].includes(row.state)) {
          return {
            job: await this.transitionRow(
              transaction,
              row,
              "cancelled",
              "client.cancelled_before_submit",
            ),
          };
        }
        return { job: toJob(row) };
      }

      const existing = (await transaction("o_generation_attempts")
        .where({ job_id: id })
        .orderBy("sequence", "desc")
        .first()) as AttemptRow | undefined;
      if (row.state === "submitting" && existing?.state === "prepared") {
        return { job: toJob(row), attempt: toAttempt(existing) };
      }
      if (row.state !== "queued" && row.state !== "preparing_assets") {
        throw new Error(`generation.cannot_prepare:${row.state}`);
      }

      let submittingRow = row;
      if (submittingRow.state === "queued") {
        await this.transitionRow(
          transaction,
          submittingRow,
          "preparing_assets",
          "runner.preparing_assets",
        );
        submittingRow = (await transaction("o_generation_jobs").where({ id }).first()) as JobRow;
      }
      await this.transitionRow(transaction, submittingRow, "submitting", "runner.assets_ready");
      submittingRow = (await transaction("o_generation_jobs").where({ id }).first()) as JobRow;

      const now = Date.now();
      const sequence = (existing?.sequence ?? 0) + 1;
      const attempt: AttemptRow = {
        id: newGenerationJobId(),
        job_id: id,
        sequence,
        provider_id: submittingRow.provider_id,
        offering_id: submittingRow.offering_id,
        provider_idempotency_key: `toonflow:${id}:attempt:${sequence}`,
        state: "prepared",
        provider_handle: null,
        error_json: null,
        created_at: now,
        updated_at: now,
      };
      await transaction("o_generation_attempts").insert(attempt);
      return { job: toJob(submittingRow), attempt: toAttempt(attempt) };
    });
  }

  async markSendStarted(id: string, attemptId: string): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      if (row.state !== "submitting") {
        throw new Error(`generation.job_not_submitting:${row.state}`);
      }
      if (row.cancel_requested_at) {
        return this.transitionRow(transaction, row, "cancelled", "client.cancelled_before_submit");
      }
      const attempt = (await transaction("o_generation_attempts")
        .where({ id: attemptId, job_id: id })
        .first()) as AttemptRow | undefined;
      if (!attempt) throw new Error("generation.attempt_not_found");
      if (attempt.state !== "prepared") {
        throw new Error(`generation.attempt_not_prepared:${attempt.state}`);
      }
      const now = Date.now();
      await transaction("o_generation_attempts").where({ id: attemptId }).update({
        state: "send_started",
        updated_at: now,
      });
      return toJob(row);
    });
  }

  async recordSubmission(
    id: string,
    attemptId: string,
    providerHandle: string,
    providerOutcome: "queued" | "running",
  ): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      const attempt = (await transaction("o_generation_attempts")
        .where({ id: attemptId, job_id: id })
        .first()) as AttemptRow | undefined;
      if (!attempt) throw new Error("generation.attempt_not_found");
      if (attempt.state !== "send_started") {
        throw new Error(`generation.attempt_not_send_started:${attempt.state}`);
      }
      const now = Date.now();
      await transaction("o_generation_attempts").where({ id: attemptId }).update({
        state: "handle_persisted",
        provider_handle: providerHandle,
        updated_at: now,
      });
      return this.transitionRow(transaction, row, "submitted", "provider.handle_persisted", {
        metadata: { attemptId, providerOutcome },
        patch: { provider_handle: providerHandle, provider_outcome: providerOutcome },
      });
    });
  }

  async completeSynchronousSubmission(
    id: string,
    attemptId: string,
    providerHandle: string,
    result: unknown,
  ): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      let row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      if (row.state !== "submitting") {
        throw new Error(`generation.job_not_submitting:${row.state}`);
      }
      const attempt = (await transaction("o_generation_attempts")
        .where({ id: attemptId, job_id: id })
        .first()) as AttemptRow | undefined;
      if (!attempt) throw new Error("generation.attempt_not_found");
      if (attempt.state !== "send_started") {
        throw new Error(`generation.attempt_not_send_started:${attempt.state}`);
      }

      await transaction("o_generation_attempts").where({ id: attemptId }).update({
        state: "handle_persisted",
        provider_handle: providerHandle,
        updated_at: Date.now(),
      });
      await this.transitionRow(
        transaction,
        row,
        "submitted",
        "provider.synchronous_result_received",
        {
          metadata: { attemptId },
          patch: { provider_handle: providerHandle, provider_outcome: "succeeded" },
        },
      );
      row = (await transaction("o_generation_jobs").where({ id }).first()) as JobRow;
      await this.transitionRow(transaction, row, "importing", "provider.succeeded");
      row = (await transaction("o_generation_jobs").where({ id }).first()) as JobRow;
      if (row.cancel_requested_at) {
        return this.transitionRow(
          transaction,
          row,
          "cancelled",
          "client.cancelled_before_import_commit",
          { patch: { provider_outcome: "succeeded" } },
        );
      }
      return this.transitionRow(transaction, row, "succeeded", "asset.import_committed", {
        patch: { result_json: stableJson(result) },
      });
    });
  }

  async recordSubmissionRejected(
    id: string,
    attemptId: string,
    error: unknown,
  ): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      if (row.state !== "submitting") throw new Error(`generation.job_not_submitting:${row.state}`);
      const attempt = (await transaction("o_generation_attempts")
        .where({ id: attemptId, job_id: id })
        .first()) as AttemptRow | undefined;
      if (!attempt) throw new Error("generation.attempt_not_found");
      if (attempt.state !== "send_started")
        throw new Error(`generation.attempt_not_send_started:${attempt.state}`);
      const now = Date.now();
      await transaction("o_generation_attempts")
        .where({ id: attemptId })
        .update({
          state: "provider_rejected",
          error_json: stableJson(error),
          updated_at: now,
        });
      return this.transitionRow(transaction, row, "failed", "provider.submission_rejected", {
        metadata: { attemptId },
        patch: { error_json: stableJson(error), provider_outcome: "failed" },
      });
    });
  }

  async recoverInterruptedSubmissions(now = Date.now()): Promise<number> {
    const rows = (await this.database("o_generation_jobs")
      .where({ state: "submitting" })
      .andWhere((builder) => {
        builder.whereNull("lease_expires_at").orWhere("lease_expires_at", "<=", now);
      })) as JobRow[];
    let recovered = 0;
    for (const candidate of rows) {
      const didRecover = await this.database.transaction(async (transaction) => {
        const row = (await transaction("o_generation_jobs").where({ id: candidate.id }).first()) as
          | JobRow
          | undefined;
        if (!row || row.state !== "submitting") return false;
        if (row.lease_expires_at !== null && row.lease_expires_at > now) return false;
        const attempt = (await transaction("o_generation_attempts")
          .where({ job_id: row.id })
          .orderBy("sequence", "desc")
          .first()) as AttemptRow | undefined;
        if (attempt?.state === "send_started") {
          await transaction("o_generation_attempts").where({ id: attempt.id }).update({
            state: "submission_unknown",
            updated_at: now,
          });
          await this.transitionRow(
            transaction,
            row,
            "submission_unknown",
            "recovery.submission_outcome_unknown",
            { metadata: { attemptId: attempt.id } },
          );
          return true;
        }
        if (attempt?.state === "prepared") {
          await this.appendSameStateEvent(transaction, row, "recovery.prepared_submit_resumed", {
            metadata: { attemptId: attempt.id },
            patch: { lease_owner: null, lease_expires_at: null, next_run_at: now },
          });
          return true;
        }
        if (attempt?.state === "handle_persisted" && attempt.provider_handle) {
          await this.transitionRow(transaction, row, "submitted", "recovery.handle_restored", {
            metadata: { attemptId: attempt.id },
            patch: {
              provider_handle: attempt.provider_handle,
              provider_outcome: "unknown",
              lease_owner: null,
              lease_expires_at: null,
              next_run_at: now,
            },
          });
          return true;
        }
        await this.transitionRow(
          transaction,
          row,
          "failed",
          "recovery.submission_attempt_missing",
          {
            patch: {
              error_json: stableJson({ code: "generation.submission_attempt_missing" }),
              lease_owner: null,
              lease_expires_at: null,
            },
          },
        );
        return true;
      });
      if (didRecover) recovered += 1;
    }
    return recovered;
  }

  async recoverInterruptedSubmission(id: string): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row || row.state !== "submitting") return false;
      const attempt = (await transaction("o_generation_attempts")
        .where({ job_id: row.id, state: "send_started" })
        .orderBy("sequence", "desc")
        .first()) as AttemptRow | undefined;
      if (!attempt) return false;
      await transaction("o_generation_attempts").where({ id: attempt.id }).update({
        state: "submission_unknown",
        updated_at: Date.now(),
      });
      await this.transitionRow(
        transaction,
        row,
        "submission_unknown",
        "recovery.submission_outcome_unknown",
        { metadata: { attemptId: attempt.id } },
      );
      return true;
    });
  }

  async listAttempts(id: string): Promise<GenerationAttempt[]> {
    const rows = (await this.database("o_generation_attempts")
      .where({ job_id: id })
      .orderBy("sequence", "asc")) as AttemptRow[];
    return rows.map(toAttempt);
  }

  async requestCancellation(id: string, reason: string): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      const state = generationJobStateSchema.parse(row.state);
      if (row.cancel_requested_at || state === "cancelled") return toJob(row);
      if (state === "succeeded" || state === "failed" || state === "abandoned") return toJob(row);

      const now = Date.now();
      const patch = { cancel_requested_at: now, cancel_reason: reason };
      if (state === "queued" || state === "preparing_assets") {
        return this.transitionRow(transaction, row, "cancelled", "client.cancelled_before_submit", {
          metadata: { reason },
          patch,
        });
      }
      return this.appendSameStateEvent(transaction, row, "client.cancel_requested", {
        metadata: { reason },
        patch,
      });
    });
  }

  async reconcile(input: {
    id: string;
    action: ReconciliationAction;
    actor: string;
    reason: string;
    evidence?: ProviderLookupEvidence;
    providerHandle?: string;
  }): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id: input.id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      if (row.state !== "submission_unknown") {
        throw new Error(`generation.reconcile_invalid_state:${row.state}`);
      }
      if (!input.actor.trim() || !input.reason.trim()) {
        throw new Error("generation.reconcile_audit_required");
      }
      if (input.action === "adopt_handle" && !input.providerHandle?.trim()) {
        throw new Error("generation.reconcile_handle_required");
      }
      if (input.action === "confirm_not_submitted") {
        const parsedEvidence = providerLookupEvidenceSchema.safeParse(input.evidence);
        if (!parsedEvidence.success) throw new Error("generation.reconcile_evidence_required");
      }

      const now = Date.now();
      await transaction("o_generation_reconciliations").insert({
        job_id: input.id,
        action: input.action,
        actor: input.actor,
        reason: input.reason,
        evidence_json: input.evidence === undefined ? null : stableJson(input.evidence),
        provider_handle: input.providerHandle ?? null,
        created_at: now,
      });
      const metadata = { action: input.action, actor: input.actor, reason: input.reason };
      if (input.action === "adopt_handle") {
        const attempt = (await transaction("o_generation_attempts")
          .where({ job_id: input.id, state: "submission_unknown" })
          .orderBy("sequence", "desc")
          .first()) as AttemptRow | undefined;
        if (attempt) {
          await transaction("o_generation_attempts").where({ id: attempt.id }).update({
            state: "handle_persisted",
            provider_handle: input.providerHandle,
            updated_at: now,
          });
        }
        return this.transitionRow(transaction, row, "submitted", "reconcile.adopt_handle", {
          metadata,
          patch: {
            provider_handle: input.providerHandle,
            provider_outcome: "unknown",
            next_run_at: now,
          },
        });
      }
      if (input.action === "confirm_not_submitted") {
        const nextState = row.cancel_requested_at ? "cancelled" : "queued";
        return this.transitionRow(transaction, row, nextState, "reconcile.confirm_not_submitted", {
          metadata,
          patch: {
            provider_handle: null,
            provider_outcome: null,
            next_run_at: now,
            lease_owner: null,
            lease_expires_at: null,
          },
        });
      }
      return this.transitionRow(transaction, row, "abandoned", "reconcile.abandon", {
        metadata,
      });
    });
  }

  async listReconciliations(id: string): Promise<ReconciliationRecord[]> {
    const rows = (await this.database("o_generation_reconciliations")
      .where({ job_id: id })
      .orderBy("id", "asc")) as ReconciliationRow[];
    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      action: row.action,
      actor: row.actor,
      reason: row.reason,
      ...(row.evidence_json ? { evidence: JSON.parse(row.evidence_json) } : {}),
      ...(row.provider_handle ? { providerHandle: row.provider_handle } : {}),
      createdAt: row.created_at,
    }));
  }

  async recordRemoteObservation(
    id: string,
    outcome: "queued" | "running",
    nextRunAt: number,
    metadata?: unknown,
  ): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      const desiredState = outcome === "queued" ? "remote_queued" : "running";
      const patch = {
        provider_outcome: outcome,
        next_run_at: nextRunAt,
        poll_attempt_count: row.poll_attempt_count + 1,
      };
      if (row.state === desiredState) {
        return this.appendSameStateEvent(transaction, row, `provider.${outcome}`, {
          metadata,
          patch,
        });
      }
      return this.transitionRow(transaction, row, desiredState, `provider.${outcome}`, {
        metadata,
        patch,
      });
    });
  }

  async beginImport(id: string, payload: GenerationImportPayload): Promise<GenerationJob> {
    const parsed = generationImportPayloadSchema.parse(payload);
    const now = Date.now();
    return this.transition(id, "importing", "provider.succeeded", {
      metadata: {
        providerRequestId: parsed.providerRequestId,
        outputCount: parsed.outputs.length,
      },
      patch: {
        provider_outcome: "succeeded",
        import_payload_json: stableJson(parsed),
        import_attempt_count: 0,
        import_deadline_at: now + 30 * 60 * 1_000,
        next_run_at: now,
      },
    });
  }

  async getImportPayload(id: string): Promise<GenerationImportPayload | undefined> {
    const row = (await this.database("o_generation_jobs")
      .select("import_payload_json")
      .where({ id })
      .first()) as { import_payload_json: string | null } | undefined;
    return row?.import_payload_json
      ? generationImportPayloadSchema.parse(JSON.parse(row.import_payload_json))
      : undefined;
  }

  async recordImportFailure(id: string, error: unknown, now = Date.now()): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      if (row.state !== "importing") throw new Error(`generation.job_not_importing:${row.state}`);
      const attemptCount = row.import_attempt_count + 1;
      const exhausted = attemptCount >= 5 || (row.import_deadline_at ?? now) <= now;
      const resumableError = { ...(error as object), resumableImport: true };
      if (exhausted) {
        return this.transitionRow(transaction, row, "failed", "asset.import_retry_exhausted", {
          metadata: { attemptCount },
          patch: {
            error_json: stableJson(resumableError),
            import_attempt_count: attemptCount,
          },
        });
      }
      const delay = Math.min(60_000, 1_000 * 2 ** row.import_attempt_count);
      return this.appendSameStateEvent(transaction, row, "asset.import_retry_scheduled", {
        metadata: { attemptCount, delay },
        patch: {
          error_json: stableJson(resumableError),
          import_attempt_count: attemptCount,
          next_run_at: now + delay,
        },
      });
    });
  }

  async resumeImport(id: string, principalId: string): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs")
        .where({ id, principal_id: principalId })
        .first()) as JobRow | undefined;
      if (!row) throw new Error("generation.job_not_found");
      if (
        row.state !== "failed" ||
        row.provider_outcome !== "succeeded" ||
        !row.import_payload_json
      ) {
        throw new Error("generation.import_not_resumable");
      }
      const now = Date.now();
      return this.transitionRow(transaction, row, "importing", "client.import_resumed", {
        patch: {
          error_json: null,
          import_attempt_count: 0,
          import_deadline_at: now + 30 * 60 * 1_000,
          next_run_at: now,
        },
      });
    });
  }

  async completeImport(id: string, result: unknown): Promise<GenerationJob> {
    return this.transition(id, "succeeded", "asset.import_committed", {
      patch: { result_json: stableJson(result), import_payload_json: null, error_json: null },
    });
  }

  async fail(
    id: string,
    reason: string,
    error: unknown,
    providerOutcome?: "failed" | "succeeded",
  ): Promise<GenerationJob> {
    return this.transition(id, "failed", reason, {
      patch: {
        error_json: stableJson(error),
        ...(providerOutcome ? { provider_outcome: providerOutcome } : {}),
      },
    });
  }

  async confirmCancelled(id: string, reason: string): Promise<GenerationJob> {
    return this.transition(id, "cancelled", reason, {
      patch: { provider_outcome: "cancelled" },
    });
  }

  async cancelAfterProviderSucceeded(id: string): Promise<GenerationJob> {
    return this.transition(id, "cancelled", "client.cancelled_before_import_commit", {
      patch: { provider_outcome: "succeeded" },
    });
  }

  async transition(
    id: string,
    toState: GenerationJobState,
    reason: string,
    options: { metadata?: unknown; patch?: Record<string, unknown> } = {},
  ): Promise<GenerationJob> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction("o_generation_jobs").where({ id }).first()) as
        | JobRow
        | undefined;
      if (!row) throw new Error("generation.job_not_found");
      return this.transitionRow(transaction, row, toState, reason, options);
    });
  }

  async listEvents(id: string): Promise<GenerationJobEvent[]> {
    const rows = await this.database("o_generation_job_events")
      .where({ job_id: id })
      .orderBy("sequence", "asc");
    return rows.map((row) => ({
      sequence: row.sequence,
      fromState: row.from_state ? generationJobStateSchema.parse(row.from_state) : null,
      toState: generationJobStateSchema.parse(row.to_state),
      reason: row.reason,
      ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) } : {}),
      createdAt: row.created_at,
    }));
  }

  private async transitionRow(
    transaction: Knex.Transaction,
    row: JobRow,
    toState: GenerationJobState,
    reason: string,
    options: { metadata?: unknown; patch?: Record<string, unknown> } = {},
  ): Promise<GenerationJob> {
    const fromState = generationJobStateSchema.parse(row.state);
    assertJobTransition(fromState, toState);
    const now = Date.now();
    const nextVersion = row.version + 1;
    const updated = await transaction("o_generation_jobs")
      .where({ id: row.id, version: row.version })
      .update({
        state: toState,
        version: nextVersion,
        updated_at: now,
        ...options.patch,
      });
    if (updated !== 1) throw new Error("generation.concurrent_transition");
    await transaction("o_generation_job_events").insert({
      job_id: row.id,
      sequence: nextVersion,
      from_state: fromState,
      to_state: toState,
      reason,
      metadata_json: options.metadata === undefined ? null : stableJson(options.metadata),
      created_at: now,
    });
    return toJob((await transaction("o_generation_jobs").where({ id: row.id }).first()) as JobRow);
  }

  private async appendSameStateEvent(
    transaction: Knex.Transaction,
    row: JobRow,
    reason: string,
    options: { metadata?: unknown; patch?: Record<string, unknown> } = {},
  ): Promise<GenerationJob> {
    const state = generationJobStateSchema.parse(row.state);
    const now = Date.now();
    const nextVersion = row.version + 1;
    const updated = await transaction("o_generation_jobs")
      .where({ id: row.id, version: row.version })
      .update({ version: nextVersion, updated_at: now, ...options.patch });
    if (updated !== 1) throw new Error("generation.concurrent_transition");
    await transaction("o_generation_job_events").insert({
      job_id: row.id,
      sequence: nextVersion,
      from_state: state,
      to_state: state,
      reason,
      metadata_json: options.metadata === undefined ? null : stableJson(options.metadata),
      created_at: now,
    });
    return toJob((await transaction("o_generation_jobs").where({ id: row.id }).first()) as JobRow);
  }
}
