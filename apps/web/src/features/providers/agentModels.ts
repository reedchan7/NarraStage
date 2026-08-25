import type { AgentDeployRow, AgentModelUpdate, CatalogResult, Offering } from "@/api/client";

function asAgentDeployRows(value: unknown): AgentDeployRow[] {
  if (!Array.isArray(value)) return [];
  const rows: AgentDeployRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "number" ||
      typeof record.key !== "string" ||
      record.key.length === 0
    ) {
      continue;
    }
    rows.push({
      id: record.id,
      key: record.key,
      name: typeof record.name === "string" ? record.name : record.key,
      desc: typeof record.desc === "string" ? record.desc : "",
      model: typeof record.model === "string" ? record.model : "",
      modelName: typeof record.modelName === "string" ? record.modelName : "",
      vendorId: typeof record.vendorId === "string" ? record.vendorId : null,
      temperature: typeof record.temperature === "number" ? record.temperature : null,
      maxOutputTokens: typeof record.maxOutputTokens === "number" ? record.maxOutputTokens : null,
      disabled:
        typeof record.disabled === "boolean" || typeof record.disabled === "number"
          ? record.disabled
          : null,
    });
  }
  return rows;
}

export function simpleAgentRows(rows: unknown): AgentDeployRow[] {
  return asAgentDeployRows(rows).filter((row) => !row.disabled && !row.key.includes(":"));
}

export function languageOfferings(catalog: CatalogResult): Offering[] {
  const offerings = Array.isArray(catalog.offerings) ? catalog.offerings : [];
  return offerings.filter(
    (offering) =>
      offering.support.implementation === "implemented" &&
      offering.operations.some(
        (operation) => operation.operation === "language.generate" && operation.enabled,
      ),
  );
}

export function offeringLabel(catalog: CatalogResult, offering: Offering): string {
  const models = Array.isArray(catalog.models) ? catalog.models : [];
  const model = models.find((candidate) => candidate.id === offering.canonicalModelId);
  return `${model?.name ?? offering.id} · ${offering.providerId}`;
}

export function agentModelUpdate(
  row: AgentDeployRow,
  offering: Offering,
  catalog: CatalogResult,
): AgentModelUpdate {
  const model = catalog.models.find((candidate) => candidate.id === offering.canonicalModelId);
  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    modelName: offering.id,
    model: model?.name ?? offering.canonicalModelId,
    vendorId: offering.providerId,
    ...(typeof row.temperature === "number" ? { temperature: row.temperature } : {}),
    ...(typeof row.maxOutputTokens === "number" ? { maxOutputTokens: row.maxOutputTokens } : {}),
  };
}
