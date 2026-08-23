import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { CanonicalModelId, OfferingId } from "@/providers/domain/ids";
import type { ProviderCatalog } from "@/providers/domain/models";
import type {
  FileUploadInput,
  LanguageInput,
  OperationContext,
  OperationRequest,
} from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { providerRequestError } from "@/providers/domain/executionError";
import type { OfferingAvailabilityService } from "@/providers/availability/offeringAvailability";
import {
  getProviderFileLedger,
  providerFileReferences,
} from "@/providers/files/providerFileLedger";

export interface LanguageExecutionRequest {
  schemaVersion: "1.0.0";
  canonicalModelId: CanonicalModelId;
  offeringId: OfferingId;
  idempotencyKey: string;
  input: LanguageInput;
}

export interface FileExecutionRequest {
  schemaVersion: "1.0.0";
  canonicalModelId: CanonicalModelId;
  offeringId: OfferingId;
  idempotencyKey: string;
  input: FileUploadInput;
}

export class LanguageExecutionService {
  readonly #registry: ProviderRegistry;
  readonly #catalog: ProviderCatalog;
  readonly #availability?: OfferingAvailabilityService;

  constructor(
    registry: ProviderRegistry,
    catalog: ProviderCatalog = builtinCatalog,
    availability?: OfferingAvailabilityService,
  ) {
    this.#registry = registry;
    this.#catalog = catalog;
    this.#availability = availability;
  }

  async generate(request: LanguageExecutionRequest, context: OperationContext = {}) {
    const { offering, port } = await this.#resolve(request, "language.generate");
    if (port.operation !== "language.generate") {
      throw providerRequestError(
        "provider.port_type_mismatch",
        "Resolved provider port does not implement language generation",
        "unavailable",
      );
    }
    await this.#assertProviderFiles(request.input, context, offering.providerId);
    return port.generate(this.#operationRequest(request), context);
  }

  async stream(request: LanguageExecutionRequest, context: OperationContext = {}) {
    const { offering, port } = await this.#resolve(request, "language.stream");
    if (port.operation !== "language.stream") {
      throw providerRequestError(
        "provider.port_type_mismatch",
        "Resolved provider port does not implement language streaming",
        "unavailable",
      );
    }
    await this.#assertProviderFiles(request.input, context, offering.providerId);
    return port.stream(this.#operationRequest(request), context);
  }

  async upload(request: FileExecutionRequest, context: OperationContext = {}) {
    const { port } = await this.#resolve(request, "files.upload");
    if (port.operation !== "files.upload") {
      throw providerRequestError(
        "provider.port_type_mismatch",
        "Resolved provider port does not implement file uploads",
        "unavailable",
      );
    }
    const result = await port.upload(this.#operationRequest(request), context);
    try {
      await getProviderFileLedger().register(result, context.principalId ?? "");
    } catch (cause) {
      throw providerRequestError(
        (cause as Error).message,
        "Provider file ownership could not be persisted",
        "forbidden",
      );
    }
    return result;
  }

  async #assertProviderFiles(
    input: LanguageInput,
    context: OperationContext,
    expectedProviderId: string,
  ): Promise<void> {
    const references = providerFileReferences(input);
    if (references.length === 0) return;
    try {
      await getProviderFileLedger().assertOwned(
        references,
        context.principalId ?? "",
        expectedProviderId,
      );
    } catch (cause) {
      throw providerRequestError(
        (cause as Error).message,
        "Provider file is not owned by the authenticated principal",
        "forbidden",
      );
    }
  }

  async #resolve(
    request: Pick<LanguageExecutionRequest, "canonicalModelId" | "offeringId">,
    operation: "language.generate" | "language.stream" | "files.upload",
  ) {
    const offering = this.#catalog.offerings.find(
      (candidate) => candidate.id === request.offeringId,
    );
    if (!offering || offering.canonicalModelId !== request.canonicalModelId) {
      throw providerRequestError(
        "provider.offering_model_mismatch",
        "Offering does not belong to the requested canonical model",
      );
    }
    if (offering.support.implementation !== "implemented") {
      throw providerRequestError(
        "provider.offering_not_implemented",
        "Offering is declared but not implemented",
      );
    }
    if (
      !offering.operations.some(
        (candidate) => candidate.enabled && candidate.operation === operation,
      )
    ) {
      throw providerRequestError(
        "provider.operation_not_supported",
        "Offering does not declare the requested operation",
      );
    }
    const availability = await this.#availability?.resolve(offering.id, operation);
    if (availability && !availability.available) {
      throw providerRequestError(
        "provider.offering_unavailable",
        `Offering is unavailable: ${availability.reasonCodes.join(",")}`,
        "unavailable",
      );
    }
    const port = this.#registry.getPort(offering.providerId, operation);
    if (!port) {
      throw providerRequestError(
        "provider.operation_unavailable",
        "Provider operation is not registered in this runtime",
        "unavailable",
      );
    }
    return { offering, port };
  }

  #operationRequest<T extends LanguageExecutionRequest | FileExecutionRequest>(
    request: T,
  ): OperationRequest<T["input"]> {
    return {
      schemaVersion: request.schemaVersion,
      offeringId: request.offeringId,
      idempotencyKey: request.idempotencyKey,
      input: request.input,
    };
  }
}

let languageRuntime: LanguageExecutionService | undefined;

export function configureLanguageExecutionRuntime(
  registry: ProviderRegistry,
  catalog: ProviderCatalog = builtinCatalog,
  availability?: OfferingAvailabilityService,
): LanguageExecutionService {
  languageRuntime = new LanguageExecutionService(registry, catalog, availability);
  return languageRuntime;
}

export function getLanguageExecutionRuntime(): LanguageExecutionService {
  if (!languageRuntime) throw new Error("language.runtime_not_configured");
  return languageRuntime;
}

export function resetLanguageExecutionRuntimeForTests(): void {
  languageRuntime = undefined;
}
