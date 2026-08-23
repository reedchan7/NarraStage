import type {
  CapabilitySchema,
  GenerationJob,
  GenerationOperation,
  Offering,
  SubmitGenerationJobInput,
} from "@/api/client";

export function idempotencyKeyFor(
  projectId: number,
  operation: GenerationOperation,
  offeringId: string,
  values: Record<string, unknown>,
): string {
  const source = JSON.stringify({ projectId, operation, offeringId, values });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `web-${operation}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildGenerationRequest(input: {
  projectId: number;
  operation: GenerationOperation;
  offering: Offering;
  schema: CapabilitySchema;
  values: Record<string, string | number | boolean>;
}): SubmitGenerationJobInput {
  const values: Record<string, unknown> = {};
  for (const field of input.schema.fields) {
    const candidate = input.values[field.path];
    if (candidate !== undefined && candidate !== "") {
      values[field.path] = candidate;
    } else if (field.required && field.kind === "enum") {
      values[field.path] = field.enumValues?.[0] ?? field.allowedValues?.[0];
    } else if (field.required && field.kind === "integer") {
      values[field.path] = field.minimum ?? 1;
    } else if (field.required && field.kind === "boolean") {
      values[field.path] = false;
    }
  }
  return {
    schemaVersion: "2.0.0",
    idempotencyKey: idempotencyKeyFor(input.projectId, input.operation, input.offering.id, values),
    canonicalModelId: input.offering.canonicalModelId,
    offeringId: input.offering.id,
    operation: input.operation,
    input: {
      ...(input.schema.assetModes?.some((mode) => mode.id === "text") ? { mode: "text" } : {}),
      values,
      assets: [],
    },
  };
}

export interface MediaArtifact {
  kind: "image" | "video";
  url?: string;
  assetId?: string;
  mimeType?: string;
}

export function extractMediaArtifact(result: unknown): MediaArtifact | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  if (record.kind === "image" || record.kind === "video") {
    return {
      kind: record.kind,
      ...(typeof record.url === "string" ? { url: record.url } : {}),
      ...(typeof record.assetId === "string" ? { assetId: record.assetId } : {}),
      ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
    };
  }
  for (const key of ["outputs", "artifacts", "content"]) {
    const nested = record[key];
    if (!Array.isArray(nested)) continue;
    for (const candidate of nested) {
      const artifact = extractMediaArtifact(candidate);
      if (artifact) return artifact;
    }
  }
  for (const key of ["result", "data", "output"]) {
    const artifact = extractMediaArtifact(record[key]);
    if (artifact) return artifact;
  }
  return null;
}

export function isTerminalJob(job: GenerationJob | undefined): boolean {
  return Boolean(job && ["succeeded", "failed", "cancelled", "abandoned"].includes(job.state));
}
