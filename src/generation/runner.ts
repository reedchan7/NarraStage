import { GenerationJobRepository } from "@/generation/jobRepository";
import { isTerminalJobState } from "@/generation/stateMachine";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { defaultPollBackoff, nextPollDelay } from "@/generation/backoff";
import type { AssetGateway } from "@/assets/assetGateway";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type {
  ImageEditPort,
  ImageGeneratePort,
  ImageOperationResult,
  ProviderOutputArtifact,
  OperationContext,
} from "@/providers/ports";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import type { MediaAssetRepository } from "@/assets/mediaAssetRepository";
import { generationResultSchema } from "@/providers/domain/results";
import type { GenerationImportPayload, GenerationJob } from "@/generation/domain";

export interface GenerationRunnerHooks {
  afterProviderAccepted?: () => void | Promise<void>;
}

export interface GenerationRunnerOptions {
  assetGateway?: AssetGateway;
  mediaAssetRepository?: MediaAssetRepository;
  now?: () => number;
  random?: () => number;
}

export class GenerationRunner {
  readonly #repository: GenerationJobRepository;
  readonly #registry: ProviderRegistry;
  readonly #assetGateway?: AssetGateway;
  readonly #mediaAssetRepository?: MediaAssetRepository;
  readonly #now: () => number;
  readonly #random: () => number;

  constructor(
    repository: GenerationJobRepository,
    registry: ProviderRegistry,
    options: GenerationRunnerOptions = {},
  ) {
    this.#repository = repository;
    this.#registry = registry;
    this.#assetGateway = options.assetGateway;
    this.#mediaAssetRepository = options.mediaAssetRepository;
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
  }

  async runJob(jobId: string, hooks: GenerationRunnerHooks = {}): Promise<void> {
    const current = await this.#repository.get(jobId);
    if (!current) throw new Error("generation.job_not_found");
    if (
      isTerminalJobState(current.state) ||
      current.state === "submission_unknown" ||
      current.state === "submitted" ||
      current.state === "remote_queued" ||
      current.state === "running" ||
      current.state === "importing"
    ) {
      return;
    }
    const port = this.#registry.getPort(current.providerId, current.operation);
    if (!port) {
      await this.#repository.transition(jobId, "failed", "runner.operation_unavailable", {
        patch: {
          error_json: JSON.stringify({
            code: "generation.operation_unavailable",
            providerId: current.providerId,
            operation: current.operation,
          }),
        },
      });
      return;
    }

    if (port.operation === "image.generate" || port.operation === "image.edit") {
      await this.#runSynchronousImageJob(current, port, hooks);
      return;
    }
    if (port.operation !== "video.generate") {
      await this.#repository.transition(jobId, "failed", "runner.operation_unavailable", {
        patch: {
          error_json: JSON.stringify({
            code: "generation.operation_unavailable",
            providerId: current.providerId,
            operation: current.operation,
          }),
        },
      });
      return;
    }

    const operationContext = await this.#operationContextOrFail(current);
    if (!operationContext) return;
    const { attempt } = await this.#repository.prepareSubmission(jobId);
    if (!attempt) return;
    const sendReady = await this.#repository.markSendStarted(jobId, attempt.id);
    if (sendReady.state === "cancelled") return;
    let accepted: Awaited<ReturnType<typeof port.start>>;
    try {
      accepted = await port.start(
        {
          schemaVersion: current.schemaVersion,
          offeringId: current.offeringId,
          input: current.input,
          idempotencyKey: attempt.providerIdempotencyKey,
        },
        operationContext,
      );
    } catch (cause) {
      if (cause instanceof ProviderExecutionError && isDefinitiveSubmissionRejection(cause)) {
        await this.#repository.recordSubmissionRejected(jobId, attempt.id, cause.providerError);
        return;
      }
      throw cause;
    }
    await hooks.afterProviderAccepted?.();
    await this.#repository.recordSubmission(
      jobId,
      attempt.id,
      accepted.providerHandle,
      accepted.providerOutcome,
    );
  }

  recoverInterruptedSubmissions(): Promise<number> {
    return this.#repository.recoverInterruptedSubmissions(this.#now());
  }

  async #runSynchronousImageJob(
    job: NonNullable<Awaited<ReturnType<GenerationJobRepository["get"]>>>,
    port: ImageGeneratePort | ImageEditPort,
    hooks: GenerationRunnerHooks,
  ): Promise<void> {
    if (!this.#mediaAssetRepository) {
      await this.#repository.transition(job.id, "failed", "asset.repository_unavailable", {
        patch: {
          error_json: JSON.stringify({
            code: "asset.repository_unavailable",
            resumableImport: false,
          }),
        },
      });
      return;
    }

    const operationContext = await this.#operationContextOrFail(job);
    if (!operationContext) return;
    const { attempt } = await this.#repository.prepareSubmission(job.id);
    if (!attempt) return;
    const sendReady = await this.#repository.markSendStarted(job.id, attempt.id);
    if (sendReady.state === "cancelled") return;
    let completed: ImageOperationResult;
    try {
      const request = {
        schemaVersion: job.schemaVersion,
        offeringId: job.offeringId,
        input: job.input,
        idempotencyKey: attempt.providerIdempotencyKey,
      };
      completed =
        port.operation === "image.generate"
          ? await port.generate(request, operationContext)
          : await port.edit(request, operationContext);
    } catch (cause) {
      if (cause instanceof ProviderExecutionError && isDefinitiveSubmissionRejection(cause)) {
        await this.#repository.recordSubmissionRejected(job.id, attempt.id, cause.providerError);
        return;
      }
      throw cause;
    }
    await hooks.afterProviderAccepted?.();

    const artifacts = await Promise.all(
      completed.outputs.map(async (output, index) => {
        const owned = await this.#mediaAssetRepository!.ingestOwnedBytes({
          bytes: output.bytes,
          declaredKind: "image",
          principalId: job.principalId,
          sourceKind: "provider_output",
          sourceId: `${job.id}:${index + 1}`,
        });
        if (owned.mimeType !== output.mimeType.toLowerCase()) {
          throw new Error("asset.provider_mime_mismatch");
        }
        return {
          id: `artifact-${index + 1}`,
          kind: "image" as const,
          assetId: owned.id,
          mimeType: owned.mimeType,
          byteLength: owned.byteLength,
          sha256: owned.sha256,
        };
      }),
    );
    const offering = builtinCatalog.offerings.find((candidate) => candidate.id === job.offeringId);
    const providerHandle = completed.providerRequestId ?? `sync:${attempt.id}`;
    await this.#repository.completeSynchronousSubmission(job.id, attempt.id, providerHandle, {
      schemaVersion: "1.0.0",
      artifacts,
      ...(completed.text ? { text: completed.text } : {}),
      ...(completed.usage ? { usage: completed.usage } : {}),
      providerMetadata: {
        ...completed.providerMetadata,
        ...(completed.providerRequestId ? { requestId: completed.providerRequestId } : {}),
      },
      provenance: {
        providerId: job.providerId,
        offeringId: job.offeringId,
        providerModelId: offering?.providerModelId ?? job.offeringId,
        ...(completed.providerRequestId ? { providerRequestId: completed.providerRequestId } : {}),
      },
    });
  }

  async pollJob(jobId: string): Promise<void> {
    let job = await this.#repository.get(jobId);
    if (!job) throw new Error("generation.job_not_found");
    if (
      isTerminalJobState(job.state) ||
      job.state === "submission_unknown" ||
      job.state === "queued" ||
      job.state === "preparing_assets" ||
      job.state === "submitting"
    ) {
      return;
    }
    if (job.state === "importing") {
      await this.#continueImport(job);
      return;
    }
    if (!job.providerHandle) throw new Error("generation.provider_handle_missing");
    if (
      job.pollAttemptCount >= defaultPollBackoff.maxAttempts ||
      (job.deadlineAt !== undefined && this.#now() >= job.deadlineAt)
    ) {
      await this.#repository.fail(jobId, "runner.retry_budget_exhausted", {
        code: "generation.retry_budget_exhausted",
        pollAttemptCount: job.pollAttemptCount,
        deadlineAt: job.deadlineAt,
      });
      return;
    }

    if (job.cancelRequestedAt) {
      const cancelPort = this.#registry.getPort(job.providerId, "video.cancel");
      if (cancelPort?.operation === "video.cancel") {
        try {
          const cancellation = await cancelPort.cancel(job.providerHandle, {
            principalId: job.principalId,
          });
          if (cancellation.outcome === "confirmed") {
            await this.#repository.confirmCancelled(jobId, "provider.cancel_confirmed");
            return;
          }
        } catch (cause) {
          if (!(cause instanceof ProviderExecutionError)) throw cause;
        }
      }
    }

    const statusPort = this.#registry.getPort(job.providerId, "video.status");
    if (!statusPort || statusPort.operation !== "video.status") {
      await this.#repository.fail(jobId, "runner.status_operation_unavailable", {
        code: "generation.status_operation_unavailable",
      });
      return;
    }
    let remote: Awaited<ReturnType<typeof statusPort.status>>;
    try {
      remote = await statusPort.status(job.providerHandle, {
        principalId: job.principalId,
      });
    } catch (cause) {
      if (!(cause instanceof ProviderExecutionError)) throw cause;
      if (!cause.providerError.retryable) {
        await this.#repository.fail(jobId, "provider.status_failed", cause.providerError);
        return;
      }
      const observedOutcome = job.state === "running" ? "running" : "queued";
      const delay = nextPollDelay(job.pollAttemptCount, undefined, this.#random);
      if (job.deadlineAt !== undefined && this.#now() + delay > job.deadlineAt) {
        await this.#repository.fail(jobId, "runner.retry_deadline_exhausted", {
          code: "generation.retry_budget_exhausted",
          pollAttemptCount: job.pollAttemptCount,
          deadlineAt: job.deadlineAt,
        });
        return;
      }
      await this.#repository.recordRemoteObservation(jobId, observedOutcome, this.#now() + delay, {
        statusError: cause.providerError,
      });
      return;
    }
    if (remote.outcome === "queued" || remote.outcome === "running") {
      const delay = nextPollDelay(
        job.pollAttemptCount,
        undefined,
        this.#random,
        remote.retryAfterMs,
      );
      if (job.deadlineAt !== undefined && this.#now() + delay > job.deadlineAt) {
        await this.#repository.fail(jobId, "runner.retry_deadline_exhausted", {
          code: "generation.retry_budget_exhausted",
          pollAttemptCount: job.pollAttemptCount,
          deadlineAt: job.deadlineAt,
        });
        return;
      }
      await this.#repository.recordRemoteObservation(
        jobId,
        remote.outcome,
        this.#now() + delay,
        remote.progress === undefined ? undefined : { progress: remote.progress },
      );
      return;
    }
    if (remote.outcome === "failed") {
      await this.#repository.fail(jobId, "provider.failed", remote.error, "failed");
      return;
    }
    if (remote.outcome === "cancelled") {
      await this.#repository.confirmCancelled(jobId, "provider.cancelled");
      return;
    }

    const importPayload = this.#prepareImportPayload(remote.outputs, remote.providerRequestId);
    job = await this.#repository.beginImport(jobId, importPayload);
    if (job.cancelRequestedAt) {
      await this.#repository.cancelAfterProviderSucceeded(jobId);
      return;
    }
    await this.#continueImport(job, remote.outputs);
  }

  async #continueImport(
    job: GenerationJob,
    providerOutputs?: ProviderOutputArtifact[],
  ): Promise<void> {
    const payload = await this.#repository.getImportPayload(job.id);
    if (!payload) {
      await this.#repository.fail(
        job.id,
        "asset.import_payload_missing",
        { code: "asset.import_payload_missing", resumableImport: false },
        "succeeded",
      );
      return;
    }
    if (job.cancelRequestedAt) {
      await this.#repository.cancelAfterProviderSucceeded(job.id);
      return;
    }
    try {
      let refreshedOutputs = providerOutputs;
      if (
        !refreshedOutputs &&
        payload.outputs.some((output) => output.source === "provider_refresh")
      ) {
        if (!job.providerHandle) throw new Error("asset.provider_handle_missing");
        const statusPort = this.#registry.getPort(job.providerId, "video.status");
        if (!statusPort || statusPort.operation !== "video.status") {
          throw new Error("asset.provider_refresh_unavailable");
        }
        const refreshed = await statusPort.status(job.providerHandle, {
          principalId: job.principalId,
        });
        if (refreshed.outcome !== "succeeded") {
          throw new Error("asset.provider_output_not_ready");
        }
        refreshedOutputs = refreshed.outputs;
      }
      const artifacts = await Promise.all(
        payload.outputs.map((output, index) => {
          if (output.source === "owned_asset") {
            return Promise.resolve({
              id: `artifact-${index + 1}`,
              kind: output.kind,
              assetId: output.assetId,
              mimeType: output.mimeType,
              byteLength: output.byteLength,
              sha256: output.sha256,
            });
          }
          if (output.source === "provider_refresh") {
            const refreshed = refreshedOutputs?.[output.outputIndex];
            if (!refreshed || refreshed.kind !== output.kind) {
              throw new Error("asset.provider_output_mismatch");
            }
            return this.#importOutput(refreshed, index, job.principalId, job.providerId);
          }
          return this.#importOutput(
            {
              kind: output.kind,
              url: output.url,
              ...(output.mimeType ? { mimeType: output.mimeType } : {}),
              ...(output.authorization ? { authorization: output.authorization } : {}),
            },
            index,
            job.principalId,
            job.providerId,
          );
        }),
      );
      const offering = builtinCatalog.offerings.find(
        (candidate) => candidate.id === job.offeringId,
      );
      await this.#repository.completeImport(job.id, {
        schemaVersion: "1.0.0",
        artifacts,
        providerMetadata: {
          ...(payload.providerRequestId ? { requestId: payload.providerRequestId } : {}),
        },
        provenance: {
          providerId: job.providerId,
          offeringId: job.offeringId,
          providerModelId: offering?.providerModelId ?? job.offeringId,
          ...(payload.providerRequestId ? { providerRequestId: payload.providerRequestId } : {}),
        },
      });
    } catch (cause) {
      const message = (cause as Error).message;
      await this.#repository.recordImportFailure(
        job.id,
        {
          code: "asset.import_failed",
          reasonCode: message.startsWith("asset.") ? message : "asset.transport_failed",
        },
        this.#now(),
      );
    }
  }

  #prepareImportPayload(
    outputs: ProviderOutputArtifact[],
    providerRequestId?: string,
  ): GenerationImportPayload {
    const prepared = outputs.map((output, index): GenerationImportPayload["outputs"][number] => {
      if ("url" in output) {
        return {
          source: "remote_url",
          kind: output.kind,
          url: output.url,
          ...(output.mimeType ? { mimeType: output.mimeType } : {}),
          ...(output.authorization
            ? {
                authorization: {
                  ...output.authorization,
                  allowedOrigins: [...output.authorization.allowedOrigins],
                },
              }
            : {}),
        };
      }
      return {
        source: "provider_refresh",
        outputIndex: index,
        kind: output.kind,
        mimeType: output.mimeType,
      };
    });
    return { outputs: prepared, ...(providerRequestId ? { providerRequestId } : {}) };
  }

  async #importOutput(
    output: ProviderOutputArtifact,
    index: number,
    principalId: string,
    providerId: string,
  ) {
    if ("bytes" in output) {
      if (!this.#mediaAssetRepository) throw new Error("asset.repository_unavailable");
      const owned = await this.#mediaAssetRepository.ingestOwnedBytes({
        bytes: output.bytes,
        declaredKind: output.kind,
        principalId,
        sourceKind: "provider_output",
      });
      if (owned.mimeType !== output.mimeType.toLowerCase()) {
        throw new Error("asset.provider_mime_mismatch");
      }
      return {
        id: `artifact-${index + 1}`,
        kind: output.kind,
        assetId: owned.id,
        mimeType: owned.mimeType,
        byteLength: owned.byteLength,
        sha256: owned.sha256,
      };
    }
    const asset = await this.#assetGateway!.import({
      url: output.url,
      allowedMimePrefixes: [output.kind === "file" ? "application/" : `${output.kind}/`],
      ...(output.mimeType ? { expectedMimeType: output.mimeType } : {}),
      ...(output.authorization
        ? {
            authorization: {
              credentialRef: { providerId, slot: output.authorization.credentialSlot },
              headerName: output.authorization.headerName,
              allowedOrigins: output.authorization.allowedOrigins,
            },
          }
        : {}),
    });
    if (output.mimeType && asset.mimeType !== output.mimeType.toLowerCase()) {
      throw new Error("asset.provider_mime_mismatch");
    }
    const owned = this.#mediaAssetRepository
      ? await this.#mediaAssetRepository.registerImported(asset, principalId)
      : undefined;
    return {
      id: `artifact-${index + 1}`,
      kind: output.kind,
      assetId: owned?.id ?? asset.assetId,
      mimeType: asset.mimeType,
      byteLength: asset.bytes,
      sha256: asset.sha256,
    };
  }

  async #operationContext(
    job: NonNullable<Awaited<ReturnType<GenerationJobRepository["get"]>>>,
  ): Promise<OperationContext> {
    if (!job.continuation) return { principalId: job.principalId };
    const parent = await this.#repository.getForPrincipal(
      job.continuation.parentJobId,
      job.principalId,
    );
    if (
      !parent ||
      parent.state !== "succeeded" ||
      parent.providerId !== job.providerId ||
      parent.offeringId !== job.offeringId ||
      parent.operation !== job.operation
    ) {
      throw new ProviderExecutionError({
        category: "invalid_input",
        code: "generation.continuation_parent_incompatible",
        message: "Generation continuation parent is unavailable or incompatible",
        retryable: false,
      });
    }
    const result = generationResultSchema.safeParse(parent.result);
    if (!result.success || !result.data.provenance.providerRequestId) {
      throw new ProviderExecutionError({
        category: "invalid_input",
        code: "generation.continuation_provider_state_unavailable",
        message: "Generation continuation parent has no reusable provider state",
        retryable: false,
      });
    }
    const providerRequestId = result.data.provenance.providerRequestId;
    return {
      principalId: job.principalId,
      continuation: {
        parentJobId: parent.id,
        providerId: parent.providerId,
        offeringId: parent.offeringId,
        providerModelId: result.data.provenance.providerModelId,
        providerRequestId,
      },
    };
  }

  async #operationContextOrFail(
    job: NonNullable<Awaited<ReturnType<GenerationJobRepository["get"]>>>,
  ): Promise<OperationContext | undefined> {
    try {
      return await this.#operationContext(job);
    } catch (cause) {
      if (!(cause instanceof ProviderExecutionError) || !isDefinitiveSubmissionRejection(cause)) {
        throw cause;
      }
      await this.#repository.transition(job.id, "failed", "provider.operation_context_rejected", {
        patch: { error_json: JSON.stringify(cause.providerError) },
      });
      return undefined;
    }
  }
}

function isDefinitiveSubmissionRejection(error: ProviderExecutionError): boolean {
  return ["auth", "billing", "quota", "rate_limit", "moderation", "invalid_input"].includes(
    error.providerError.category,
  );
}
