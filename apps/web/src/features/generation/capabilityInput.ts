import type { CapabilityInput, CatalogCapability } from "@/features/models/catalog";

export function normalizeCapabilityInput(capability: CatalogCapability, input: CapabilityInput): CapabilityInput {
  const selectedMode = capability.assetModes?.find((mode) => mode.id === input.mode) ?? capability.assetModes?.[0];
  const values: CapabilityInput["values"] = {};

  for (const field of capability.fields) {
    const rule = selectedMode?.fieldRules?.find((candidate) => candidate.path === field.path);
    const enumValues = rule?.enumValues ?? field.enumValues;
    const allowedValues = rule?.allowedValues ?? field.allowedValues;
    const current = input.values[field.path];

    if (allowedValues?.length) {
      values[field.path] = allowedValues.includes(current as never) ? current : allowedValues[0];
      continue;
    }
    if (enumValues?.length) {
      values[field.path] = enumValues.includes(String(current ?? "")) ? current : enumValues[0];
      continue;
    }
    if (field.kind === "integer") {
      if (typeof current !== "number" || !Number.isFinite(current)) {
        if (field.minimum !== undefined) values[field.path] = field.minimum;
        continue;
      }
      values[field.path] = Math.min(field.maximum ?? current, Math.max(field.minimum ?? current, Math.round(current)));
      continue;
    }
    if (field.kind === "boolean") {
      values[field.path] = typeof current === "boolean" ? current : false;
      continue;
    }
    if (current !== undefined) values[field.path] = current;
  }

  return {
    mode: selectedMode?.id,
    values,
    assets: selectedMode?.id === input.mode ? input.assets : [],
  };
}
