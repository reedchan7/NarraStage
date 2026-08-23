import type { ProviderId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";
import {
  type LanguageModelCompatibilityBridge,
  type OperationPort,
  type ProviderAdapter,
  operationOf,
} from "@/providers/ports";

export class ProviderRegistry {
  readonly #ports = new Map<ProviderId, Map<Operation, OperationPort>>();
  readonly #languageModelBridges = new Map<ProviderId, LanguageModelCompatibilityBridge>();

  register(adapter: ProviderAdapter): void {
    if (this.#ports.has(adapter.providerId)) {
      throw new Error(`provider already registered: ${adapter.providerId}`);
    }
    const operations = new Map<Operation, OperationPort>();
    for (const port of adapter.ports) {
      const operation = operationOf(port);
      if (operations.has(operation)) {
        throw new Error(
          `provider ${adapter.providerId} registered duplicate operation ${operation}`,
        );
      }
      operations.set(operation, port);
    }
    this.#ports.set(adapter.providerId, operations);
    const languageModelBridge = adapter.compatibility?.languageModel;
    if (languageModelBridge)
      this.#languageModelBridges.set(adapter.providerId, languageModelBridge);
  }

  getPort(providerId: ProviderId, operation: Operation): OperationPort | undefined {
    return this.#ports.get(providerId)?.get(operation);
  }

  hasProvider(providerId: ProviderId): boolean {
    return this.#ports.has(providerId);
  }

  getLanguageModelBridge(providerId: ProviderId): LanguageModelCompatibilityBridge | undefined {
    return this.#languageModelBridges.get(providerId);
  }
}
