import { generationJobViewSchema } from "@/contracts/v2/schemas";
import type { GenerationJob } from "@/generation/domain";

export function toGenerationJobView(job: GenerationJob) {
  return generationJobViewSchema.parse({
    id: job.id,
    schemaVersion: job.schemaVersion,
    idempotencyKey: job.idempotencyKey,
    canonicalModelId: job.canonicalModelId,
    offeringId: job.offeringId,
    providerId: job.providerId,
    operation: job.operation,
    input: job.input,
    ...(job.consumer ? { consumer: job.consumer } : {}),
    ...(job.continuation ? { continuation: job.continuation } : {}),
    state: job.state,
    ...(job.providerOutcome ? { providerOutcome: job.providerOutcome } : {}),
    ...(job.result !== undefined ? { result: job.result } : {}),
    ...(job.error !== undefined ? { error: job.error } : {}),
    ...(job.cancelRequestedAt ? { cancelRequestedAt: job.cancelRequestedAt } : {}),
    ...(job.cancelReason ? { cancelReason: job.cancelReason } : {}),
    nextRunAt: job.nextRunAt,
    pollAttemptCount: job.pollAttemptCount,
    version: job.version,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    requiresReconciliation: job.state === "submission_unknown",
  });
}
