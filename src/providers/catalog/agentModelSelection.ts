import { builtinCatalog } from "@/providers/catalog/builtinCatalog";

export interface AgentModelSelectionInput {
  modelName: string;
  model: string;
  vendorId: string | null;
}

export class AgentModelSelectionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AgentModelSelectionError";
    this.code = code;
  }
}

export function normalizeAgentModelSelection(
  input: AgentModelSelectionInput,
): AgentModelSelectionInput {
  const offering = builtinCatalog.offerings.find((candidate) => candidate.id === input.modelName);
  if (!offering) return input;
  const languageEnabled = offering.operations.some(
    (operation) => operation.operation === "language.generate" && operation.enabled,
  );
  if (!languageEnabled) throw new AgentModelSelectionError("agent.model_operation_unsupported");
  if (offering.support.implementation !== "implemented") {
    throw new AgentModelSelectionError("agent.model_not_implemented");
  }
  const canonicalModel = builtinCatalog.models.find(
    (candidate) => candidate.id === offering.canonicalModelId,
  );
  if (!canonicalModel) throw new AgentModelSelectionError("agent.canonical_model_missing");
  return {
    modelName: offering.id,
    model: canonicalModel.name,
    vendorId: offering.providerId,
  };
}
