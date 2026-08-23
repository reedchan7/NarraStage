import type {
  CapabilityField,
  CapabilitySchema,
  GenerationJob,
  GenerationOperation,
  Offering,
  Project,
  SubmitGenerationJobInput,
} from "@/api/client";

export type CapabilityValue = string | number | boolean | undefined;
type DefinedCapabilityValue = Exclude<CapabilityValue, undefined>;

function intersectCapabilityValues(
  left: readonly DefinedCapabilityValue[] | undefined,
  right: readonly DefinedCapabilityValue[] | undefined,
): DefinedCapabilityValue[] | undefined {
  if (!left) return right ? [...right] : undefined;
  if (!right) return [...left];
  return left.filter((candidate) => right.includes(candidate));
}

export function capabilityAllowedValues(
  field: CapabilityField,
): DefinedCapabilityValue[] | undefined {
  return intersectCapabilityValues(field.enumValues, field.allowedValues);
}

export function configuredProjectOffering(
  project: Project | undefined,
  operation: GenerationOperation,
): string | undefined {
  if (!project) return undefined;
  if (operation === "image.generate") return project.imageOfferingId ?? undefined;
  if (operation === "video.generate" && project.videoOfferingId) {
    return project.videoOfferingId;
  }
  return project.videoModel ?? undefined;
}

export function initialCapabilityValue(field: CapabilityField): CapabilityValue {
  const allowed = capabilityAllowedValues(field);
  if (field.path === "aspectRatio" && allowed?.includes("16:9")) return "16:9";
  if (!field.required) return undefined;
  if (field.kind === "enum") return allowed?.[0];
  if (field.kind === "integer") return field.allowedValues?.[0] ?? field.minimum;
  if (field.kind === "boolean") return false;
  return undefined;
}

export function capabilityFieldForMode(
  field: CapabilityField,
  mode: CapabilityAssetMode | undefined,
): CapabilityField {
  const rule = mode?.fieldRules?.find((candidate) => candidate.path === field.path);
  const ruleAllowed = intersectCapabilityValues(rule?.enumValues, rule?.allowedValues);
  const allowed = intersectCapabilityValues(capabilityAllowedValues(field), ruleAllowed);
  return {
    ...field,
    ...(rule?.required === undefined ? {} : { required: rule.required }),
    ...(ruleAllowed ? { enumValues: undefined, allowedValues: allowed } : {}),
  };
}

function activeValueConstraints(schema: CapabilitySchema, values: Record<string, CapabilityValue>) {
  return (schema.valueConstraints ?? []).filter((constraint) =>
    constraint.when.values.includes(values[constraint.when.path] as string | number | boolean),
  );
}

export function effectiveCapabilityFields(
  schema: CapabilitySchema,
  mode: CapabilityAssetMode | undefined,
  values: Record<string, CapabilityValue>,
): CapabilityField[] {
  const constraints = activeValueConstraints(schema, values);
  return schema.fields.map((field) => {
    let effective = capabilityFieldForMode(field, mode);
    for (const requirement of constraints.flatMap((constraint) => constraint.require)) {
      if (requirement.path !== field.path) continue;
      effective = {
        ...effective,
        enumValues: undefined,
        allowedValues: intersectCapabilityValues(
          capabilityAllowedValues(effective),
          requirement.allowedValues,
        ),
      };
    }
    return effective;
  });
}

export function normalizeCapabilityValues(
  schema: CapabilitySchema,
  mode: CapabilityAssetMode | undefined,
  values: Record<string, CapabilityValue>,
): Record<string, CapabilityValue> {
  let normalized = { ...values };
  for (let pass = 0; pass < 2; pass += 1) {
    const fields = effectiveCapabilityFields(schema, mode, normalized);
    normalized = Object.fromEntries(
      fields.map((field) => {
        const current = normalized[field.path];
        const allowed = capabilityAllowedValues(field);
        return [
          field.path,
          current !== undefined && (!allowed || allowed.includes(current))
            ? current
            : initialCapabilityValue(field),
        ];
      }),
    );
  }
  return normalized;
}

export function idempotencyKeyFor(
  projectId: number,
  operation: GenerationOperation,
  offeringId: string,
  values: Record<string, unknown>,
  mode?: string,
  assets: SubmitGenerationJobInput["input"]["assets"] = [],
  parentJobId?: string,
): string {
  const source = JSON.stringify({
    projectId,
    operation,
    offeringId,
    values,
    mode,
    assets,
    parentJobId,
  });
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
  values: Record<string, CapabilityValue>;
  mode?: string;
  assets?: SubmitGenerationJobInput["input"]["assets"];
  parentJobId?: string;
}): SubmitGenerationJobInput {
  const values: Record<string, unknown> = {};
  for (const field of input.schema.fields) {
    const candidate = input.values[field.path];
    if (candidate !== undefined && candidate !== "") {
      values[field.path] = candidate;
    } else if (field.required) {
      const fallback = initialCapabilityValue(field);
      if (fallback !== undefined) values[field.path] = fallback;
    }
  }
  const assets = input.assets ?? [];
  return {
    schemaVersion: "2.0.0",
    idempotencyKey: idempotencyKeyFor(
      input.projectId,
      input.operation,
      input.offering.id,
      values,
      input.mode,
      assets,
      input.parentJobId,
    ),
    canonicalModelId: input.offering.canonicalModelId,
    offeringId: input.offering.id,
    operation: input.operation,
    ...(input.parentJobId ? { continuation: { parentJobId: input.parentJobId } } : {}),
    input: {
      ...(input.mode ? { mode: input.mode } : {}),
      values,
      assets,
    },
  };
}

export type CapabilityAssetMode = NonNullable<CapabilitySchema["assetModes"]>[number];
export type GenerationAssetInput = SubmitGenerationJobInput["input"]["assets"][number];

export function assetModeViolation(
  mode: CapabilityAssetMode | undefined,
  assets: readonly GenerationAssetInput[],
  parentJobId?: string,
): string | null {
  if (!mode) return assets.length === 0 ? null : "当前能力不接受素材";
  if (mode.requiresContinuation && !parentJobId?.trim()) return "该模式需要选择一个已完成的父任务";
  if (mode.minimumTotalAssets !== undefined && assets.length < mode.minimumTotalAssets) {
    return `至少需要 ${mode.minimumTotalAssets} 个素材`;
  }
  if (mode.maximumTotalAssets !== undefined && assets.length > mode.maximumTotalAssets) {
    return `最多允许 ${mode.maximumTotalAssets} 个素材`;
  }
  if (mode.requiresAnyRole && !assets.some((asset) => mode.requiresAnyRole?.includes(asset.role))) {
    return `至少需要一种素材：${mode.requiresAnyRole.join(" / ")}`;
  }
  for (const role of mode.roles) {
    const matching = assets.filter((asset) => asset.role === role.role);
    if (matching.length < role.minimum) return `${role.role} 至少需要 ${role.minimum} 个素材`;
    if (matching.length > role.maximum) return `${role.role} 最多允许 ${role.maximum} 个素材`;
    if (matching.some((asset) => !role.kinds.includes(asset.kind))) {
      return `${role.role} 的素材类型不受支持`;
    }
  }
  for (const limit of mode.durationLimits ?? []) {
    const matching = assets.filter((asset) => limit.kinds.includes(asset.kind));
    for (const asset of matching) {
      if (
        limit.minimumPerAssetSeconds !== undefined &&
        (asset.durationSeconds ?? 0) < limit.minimumPerAssetSeconds
      ) {
        return `素材时长不得短于 ${limit.minimumPerAssetSeconds} 秒`;
      }
      if (
        limit.maximumPerAssetSeconds !== undefined &&
        (asset.durationSeconds ?? Number.POSITIVE_INFINITY) > limit.maximumPerAssetSeconds
      ) {
        return `素材时长不得超过 ${limit.maximumPerAssetSeconds} 秒`;
      }
    }
    if (
      limit.maximumCombinedSeconds !== undefined &&
      matching.reduce((sum, asset) => sum + (asset.durationSeconds ?? 0), 0) >
        limit.maximumCombinedSeconds
    ) {
      return `素材总时长不得超过 ${limit.maximumCombinedSeconds} 秒`;
    }
  }
  return null;
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
