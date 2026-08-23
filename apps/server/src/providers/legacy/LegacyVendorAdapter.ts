import type { Operation } from "@/providers/domain/operations";
import { decodeLegacyModelId, encodeLegacyModelId } from "@/providers/legacy/legacyModelId";

export interface LegacyRuntimeModel {
  modelName: string;
  name: string;
  type: string;
}

export interface LegacyVendorRuntime {
  listModels(providerId: string): Promise<LegacyRuntimeModel[]>;
  invoke(request: {
    providerId: string;
    providerModelId: string;
    operation: Operation;
    input: unknown;
  }): Promise<unknown>;
}

export class LegacyVendorAdapter {
  readonly trust = "trusted-local" as const;
  private readonly runtime: LegacyVendorRuntime;

  constructor(runtime: LegacyVendorRuntime) {
    this.runtime = runtime;
  }

  async listModels(providerId: string) {
    const models = await this.runtime.listModels(providerId);
    return models.map((model) => ({
      legacyId: encodeLegacyModelId({
        providerId,
        providerModelId: model.modelName,
      }),
      providerId,
      providerModelId: model.modelName,
      name: model.name,
      type: model.type,
    }));
  }

  async invoke(legacyId: string, operation: Operation, input: unknown): Promise<unknown> {
    const model = decodeLegacyModelId(legacyId);
    return this.runtime.invoke({
      ...model,
      operation,
      input,
    });
  }
}
