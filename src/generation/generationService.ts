import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { CapabilityInput } from "@/providers/domain/capabilities";
import type { CanonicalModelId, OfferingId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";
import { preflightRequest } from "@/providers/preflight/preflightService";
import type { ProviderCatalog } from "@/providers/domain/models";
import type { GenerationJobState } from "@/generation/stateMachine";
import type { GenerationJobCursor } from "@/generation/pagination";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { JobChangePublisher } from "@/generation/jobChanges";
import type {
  GenerationConsumer,
  ProviderLookupEvidence,
  ReconciliationAction,
} from "@/generation/domain";
import type { GenerationContinuation } from "@/generation/domain";
import { generationResultSchema } from "@/providers/domain/results";
import type { OfferingAvailabilityService } from "@/providers/availability/offeringAvailability";

export interface SubmitGenerationJob {
  schemaVersion: "2.0.0";
  idempotencyKey: string;
  canonicalModelId: CanonicalModelId;
  offeringId: OfferingId;
  operation: Operation;
  input: CapabilityInput;
  consumer?: GenerationConsumer;
  continuation?: GenerationContinuation;
}

export class GenerationService {
  readonly #repository: GenerationJobRepository;
  readonly #changes: JobChangePublisher;
  readonly #catalog: ProviderCatalog;
  readonly #availability?: OfferingAvailabilityService;

  constructor(
    repository: GenerationJobRepository,
    changes = new JobChangePublisher(),
    catalog: ProviderCatalog = builtinCatalog,
    availability?: OfferingAvailabilityService,
  ) {
    this.#repository = repository;
    this.#changes = changes;
    this.#catalog = catalog;
    this.#availability = availability;
  }

  get changes(): JobChangePublisher {
    return this.#changes;
  }

  async submit(request: SubmitGenerationJob, principalId: string) {
    const offering = this.#catalog.offerings.find(
      (candidate) => candidate.id === request.offeringId,
    );
    if (!offering || offering.canonicalModelId !== request.canonicalModelId) {
      throw new Error("generation.offering_model_mismatch");
    }
    if (offering.support.implementation !== "implemented") {
      throw new Error("generation.offering_not_implemented");
    }
    const runtimeAvailability = await this.#availability?.resolve(
      request.offeringId,
      request.operation,
    );
    if (runtimeAvailability && !runtimeAvailability.available) {
      const error = new Error("generation.offering_unavailable") as Error & {
        violations?: unknown;
      };
      error.violations = runtimeAvailability.reasonCodes.map((code) => ({
        code,
        path: "",
        message: `Offering is unavailable: ${code}`,
      }));
      throw error;
    }
    if (request.continuation) {
      const parent = await this.#repository.getForPrincipal(
        request.continuation.parentJobId,
        principalId,
      );
      if (!parent) throw new Error("generation.continuation_parent_not_found");
      if (parent.state !== "succeeded") {
        throw new Error("generation.continuation_parent_not_ready");
      }
      if (parent.offeringId !== request.offeringId || parent.operation !== request.operation) {
        throw new Error("generation.continuation_parent_incompatible");
      }
      const parentResult = generationResultSchema.safeParse(parent.result);
      if (!parentResult.success || !parentResult.data.provenance.providerRequestId) {
        throw new Error("generation.continuation_provider_state_unavailable");
      }
    }
    const preflight = preflightRequest(
      {
        schemaVersion: request.schemaVersion,
        canonicalModelId: request.canonicalModelId,
        operation: request.operation,
        input: request.input,
        offeringPreference: { mode: "pinned", offeringId: request.offeringId },
        displayCurrency: "CNY",
        hasContinuation: Boolean(request.continuation),
      },
      {
        catalog: this.#catalog,
        at: new Date().toISOString(),
        ...(runtimeAvailability
          ? {
              availability: new Map([
                [`${request.offeringId}:${request.operation}`, runtimeAvailability],
              ]),
            }
          : {}),
      },
    );
    const selected = preflight.offerings.find(
      (candidate) => candidate.offeringId === request.offeringId,
    );
    if (!selected?.eligible || preflight.selection.status !== "selected") {
      const error = new Error("generation.preflight_failed") as Error & { violations?: unknown };
      error.violations = selected?.violations ?? [];
      throw error;
    }
    const job = await this.#repository.createOrGet(
      { ...request, providerId: offering.providerId },
      principalId,
    );
    this.#publish(job);
    return job;
  }

  get(id: string, principalId: string) {
    return this.#repository.getForPrincipal(id, principalId);
  }

  list(input: {
    principalId: string;
    limit: number;
    beforeUpdatedAt?: number;
    cursor?: GenerationJobCursor;
    states?: GenerationJobState[];
    recoveryOnly?: boolean;
  }) {
    return this.#repository.listForPrincipal(input);
  }

  async cancel(id: string, principalId: string, reason: string) {
    await this.#assertOwner(id, principalId);
    const job = await this.#repository.requestCancellation(id, reason);
    this.#publish(job);
    return job;
  }

  async resumeImport(id: string, principalId: string) {
    const job = await this.#repository.resumeImport(id, principalId);
    this.#publish(job);
    return job;
  }

  async reconcile(input: {
    id: string;
    principalId: string;
    action: ReconciliationAction;
    actor: string;
    reason: string;
    evidence?: ProviderLookupEvidence;
    providerHandle?: string;
  }) {
    await this.#assertOwner(input.id, input.principalId);
    const job = await this.#repository.reconcile(input);
    this.#publish(job);
    return job;
  }

  async #assertOwner(id: string, principalId: string): Promise<void> {
    if (!(await this.#repository.getForPrincipal(id, principalId))) {
      throw new Error("generation.job_not_found");
    }
  }

  #publish(job: { id: string; principalId: string; version: number }): void {
    this.#changes.publish({ jobId: job.id, principalId: job.principalId, version: job.version });
  }
}
