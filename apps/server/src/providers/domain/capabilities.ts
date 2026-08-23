import { z } from "zod";
import { capabilitySchemaIdSchema, type CapabilitySchemaId } from "@/providers/domain/ids";
import { operationSchema, type Operation } from "@/providers/domain/operations";

export type InputFieldKind = "text" | "integer" | "boolean" | "enum" | "assets";
export type MediaKind = "image" | "video" | "audio";
export type CapabilityScalar = string | number | boolean;

export interface CapabilityField {
  path: string;
  kind: InputFieldKind;
  label: string;
  required: boolean;
  enumValues?: string[];
  allowedValues?: CapabilityScalar[];
  minimum?: number;
  maximum?: number;
  maximumLength?: number;
  unit?: string;
  advanced?: boolean;
}

export interface AssetRoleRule {
  role: string;
  kinds: MediaKind[];
  minimum: number;
  maximum: number;
}

export interface AssetMode {
  id: string;
  label: string;
  roles: AssetRoleRule[];
  minimumTotalAssets?: number;
  maximumTotalAssets?: number;
  fieldRules?: Array<{
    path: string;
    required?: boolean;
    enumValues?: string[];
    allowedValues?: CapabilityScalar[];
  }>;
  requiresAnyRole?: string[];
  durationLimits?: Array<{
    kinds: MediaKind[];
    minimumPerAssetSeconds?: number;
    maximumPerAssetSeconds?: number;
    maximumCombinedSeconds?: number;
  }>;
  requiresContinuation?: boolean;
}

export interface CapabilitySchema {
  id: CapabilitySchemaId;
  schemaVersion: string;
  operation: Operation;
  fields: CapabilityField[];
  assetModes?: AssetMode[];
  valueConstraints?: Array<{
    when: { path: string; values: CapabilityScalar[] };
    require: Array<{ path: string; allowedValues: CapabilityScalar[] }>;
  }>;
}

const capabilityScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

const capabilityFieldSchema = z
  .object({
    path: z.string().min(1),
    kind: z.enum(["text", "integer", "boolean", "enum", "assets"]),
    label: z.string().min(1),
    required: z.boolean(),
    enumValues: z.array(z.string()).optional(),
    allowedValues: z.array(capabilityScalarSchema).min(1).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    maximumLength: z.number().int().positive().optional(),
    unit: z.string().optional(),
    advanced: z.boolean().optional(),
  })
  .strict();

const assetRoleRuleSchema = z
  .object({
    role: z.string().min(1),
    kinds: z.array(z.enum(["image", "video", "audio"])).min(1),
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().nonnegative(),
  })
  .strict();

const assetModeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    roles: z.array(assetRoleRuleSchema),
    minimumTotalAssets: z.number().int().nonnegative().optional(),
    maximumTotalAssets: z.number().int().nonnegative().optional(),
    fieldRules: z
      .array(
        z
          .object({
            path: z.string().min(1),
            required: z.boolean().optional(),
            enumValues: z.array(z.string()).min(1).optional(),
            allowedValues: z.array(capabilityScalarSchema).min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    requiresAnyRole: z.array(z.string().min(1)).min(1).optional(),
    durationLimits: z
      .array(
        z
          .object({
            kinds: z.array(z.enum(["image", "video", "audio"])).min(1),
            minimumPerAssetSeconds: z.number().nonnegative().optional(),
            maximumPerAssetSeconds: z.number().nonnegative().optional(),
            maximumCombinedSeconds: z.number().nonnegative().optional(),
          })
          .strict(),
      )
      .optional(),
    requiresContinuation: z.boolean().optional(),
  })
  .strict();

export const capabilitySchema = z
  .object({
    id: capabilitySchemaIdSchema,
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    operation: operationSchema,
    fields: z.array(capabilityFieldSchema),
    assetModes: z.array(assetModeSchema).optional(),
    valueConstraints: z
      .array(
        z
          .object({
            when: z
              .object({
                path: z.string().min(1),
                values: z.array(capabilityScalarSchema).min(1),
              })
              .strict(),
            require: z
              .array(
                z
                  .object({
                    path: z.string().min(1),
                    allowedValues: z.array(capabilityScalarSchema).min(1),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const capabilityAssetInputSchema = z
  .object({
    assetId: z.string().min(1),
    kind: z.enum(["image", "video", "audio"]),
    role: z.string().min(1),
    durationSeconds: z.number().nonnegative().optional(),
  })
  .strict();

export const capabilityInputSchema = z
  .object({
    mode: z.string().min(1).optional(),
    values: z.record(z.string(), z.unknown()),
    assets: z.array(capabilityAssetInputSchema),
  })
  .strict();

export interface CapabilityViolation {
  code: string;
  path: string;
  message: string;
}

export interface CapabilityWarning {
  code: string;
  path?: string;
  message: string;
}

export interface CapabilityAssetInput {
  assetId: string;
  kind: MediaKind;
  role: string;
  durationSeconds?: number;
}

export interface CapabilityInput {
  mode?: string;
  values: Record<string, unknown>;
  assets: CapabilityAssetInput[];
}

export interface CapabilityValidationResult {
  violations: CapabilityViolation[];
  warnings: CapabilityWarning[];
}

export function validateCapabilityInput(
  schema: CapabilitySchema,
  input: CapabilityInput,
  context: { hasContinuation?: boolean } = {},
): CapabilityValidationResult {
  const violations: CapabilityViolation[] = [];
  const knownFields = new Set(schema.fields.map((field) => field.path));

  for (const path of Object.keys(input.values).sort()) {
    if (!knownFields.has(path)) {
      violations.push({
        code: "capability.field_unknown",
        path,
        message: `${path} is not supported`,
      });
    }
  }

  for (const field of schema.fields) {
    const value = input.values[field.path];
    if (value === undefined || value === null || value === "") {
      if (field.required) {
        violations.push({
          code: "capability.field_required",
          path: field.path,
          message: `${field.path} is required`,
        });
      }
      continue;
    }

    if (field.kind === "text" && typeof value !== "string") {
      violations.push({
        code: "capability.field_type",
        path: field.path,
        message: `${field.path} must be text`,
      });
    }
    if (
      field.kind === "text" &&
      typeof value === "string" &&
      field.maximumLength !== undefined &&
      value.length > field.maximumLength
    ) {
      violations.push({
        code: "capability.field_maximum_length",
        path: field.path,
        message: `${field.path} must contain at most ${field.maximumLength} characters`,
      });
    }
    if (field.kind === "boolean" && typeof value !== "boolean") {
      violations.push({
        code: "capability.field_type",
        path: field.path,
        message: `${field.path} must be a boolean`,
      });
    }
    if (field.kind === "integer" && (!Number.isInteger(value) || typeof value !== "number")) {
      violations.push({
        code: "capability.field_type",
        path: field.path,
        message: `${field.path} must be an integer`,
      });
      continue;
    }
    if (typeof value === "number" && field.minimum !== undefined && value < field.minimum) {
      violations.push({
        code: "capability.field_minimum",
        path: field.path,
        message: `${field.path} must be at least ${field.minimum}`,
      });
    }
    if (typeof value === "number" && field.maximum !== undefined && value > field.maximum) {
      violations.push({
        code: "capability.field_maximum",
        path: field.path,
        message: `${field.path} must be at most ${field.maximum}`,
      });
    }
    if (field.kind === "enum" && !field.enumValues?.includes(String(value))) {
      violations.push({
        code: "capability.field_enum",
        path: field.path,
        message: `${field.path} must be one of ${field.enumValues?.join(", ")}`,
      });
    }
    if (field.allowedValues && !field.allowedValues.includes(value as CapabilityScalar)) {
      violations.push({
        code: "capability.field_allowed_value",
        path: field.path,
        message: `${field.path} must be one of ${field.allowedValues.join(", ")}`,
      });
    }
  }

  if (schema.assetModes) {
    const mode = schema.assetModes.find((candidate) => candidate.id === input.mode);
    if (!mode) {
      violations.push({
        code: "capability.asset_mode_unsupported",
        path: "mode",
        message: `${input.mode ?? "missing"} is not a supported asset mode`,
      });
      return { violations, warnings: [] };
    }
    if (mode.requiresContinuation && !context.hasContinuation) {
      violations.push({
        code: "capability.continuation_required",
        path: "continuation.parentJobId",
        message: `${mode.id} requires a completed parent generation`,
      });
    }

    for (const rule of mode.fieldRules ?? []) {
      const value = input.values[rule.path];
      if (rule.required && (value === undefined || value === null || value === "")) {
        violations.push({
          code: "capability.field_required_for_mode",
          path: rule.path,
          message: `${rule.path} is required in ${mode.id} mode`,
        });
      } else if (
        value !== undefined &&
        rule.enumValues &&
        !rule.enumValues.includes(String(value))
      ) {
        violations.push({
          code: "capability.field_enum_for_mode",
          path: rule.path,
          message: `${rule.path} must be one of ${rule.enumValues.join(", ")} in ${mode.id} mode`,
        });
      }
      if (
        value !== undefined &&
        rule.allowedValues &&
        !rule.allowedValues.includes(value as CapabilityScalar)
      ) {
        violations.push({
          code: "capability.field_allowed_value_for_mode",
          path: rule.path,
          message: `${rule.path} must be one of ${rule.allowedValues.join(", ")} in ${mode.id} mode`,
        });
      }
    }

    const rules = new Map(mode.roles.map((rule) => [rule.role, rule]));
    for (const rule of mode.roles) {
      const matching = input.assets.filter((asset) => asset.role === rule.role);
      if (matching.length < rule.minimum) {
        violations.push({
          code: "capability.asset_role_minimum",
          path: `assets.${rule.role}`,
          message: `${rule.role} requires at least ${rule.minimum} asset`,
        });
      }
      if (matching.length > rule.maximum) {
        violations.push({
          code: "capability.asset_role_maximum",
          path: `assets.${rule.role}`,
          message: `${rule.role} allows at most ${rule.maximum} asset`,
        });
      }
      for (const asset of matching) {
        if (!rule.kinds.includes(asset.kind)) {
          violations.push({
            code: "capability.asset_kind_unsupported",
            path: `assets.${rule.role}`,
            message: `${rule.role} does not accept ${asset.kind}`,
          });
        }
      }
    }
    for (const asset of input.assets) {
      if (!rules.has(asset.role)) {
        violations.push({
          code: "capability.asset_role_unsupported",
          path: `assets.${asset.role}`,
          message: `${asset.role} is not supported in ${mode.id} mode`,
        });
      }
    }
    if (mode.minimumTotalAssets !== undefined && input.assets.length < mode.minimumTotalAssets) {
      violations.push({
        code: "capability.asset_total_minimum",
        path: "assets",
        message: `${mode.id} requires at least ${mode.minimumTotalAssets} asset`,
      });
    }
    if (mode.maximumTotalAssets !== undefined && input.assets.length > mode.maximumTotalAssets) {
      violations.push({
        code: "capability.asset_total_maximum",
        path: "assets",
        message: `${mode.id} allows at most ${mode.maximumTotalAssets} assets`,
      });
    }
    if (
      mode.requiresAnyRole &&
      !input.assets.some((asset) => mode.requiresAnyRole?.includes(asset.role))
    ) {
      violations.push({
        code: "capability.asset_required_role_group",
        path: "assets",
        message: `${mode.id} requires one of ${mode.requiresAnyRole.join(", ")}`,
      });
    }
    for (const limit of mode.durationLimits ?? []) {
      const matching = input.assets.filter((asset) => limit.kinds.includes(asset.kind));
      let combinedDuration = 0;
      for (const asset of matching) {
        if (asset.durationSeconds === undefined) {
          violations.push({
            code: "capability.asset_duration_required",
            path: `assets.${asset.role}`,
            message: `${asset.role} requires a known duration`,
          });
          continue;
        }
        combinedDuration += asset.durationSeconds;
        if (
          limit.minimumPerAssetSeconds !== undefined &&
          asset.durationSeconds < limit.minimumPerAssetSeconds
        ) {
          violations.push({
            code: "capability.asset_duration_minimum",
            path: `assets.${asset.role}`,
            message: `${asset.role} must be at least ${limit.minimumPerAssetSeconds} seconds`,
          });
        }
        if (
          limit.maximumPerAssetSeconds !== undefined &&
          asset.durationSeconds > limit.maximumPerAssetSeconds
        ) {
          violations.push({
            code: "capability.asset_duration_maximum",
            path: `assets.${asset.role}`,
            message: `${asset.role} must be at most ${limit.maximumPerAssetSeconds} seconds`,
          });
        }
      }
      if (
        limit.maximumCombinedSeconds !== undefined &&
        combinedDuration > limit.maximumCombinedSeconds
      ) {
        violations.push({
          code: "capability.asset_duration_combined_maximum",
          path: "assets",
          message: `${limit.kinds.join("/")} duration must total at most ${limit.maximumCombinedSeconds} seconds`,
        });
      }
    }
  }

  for (const constraint of schema.valueConstraints ?? []) {
    if (!constraint.when.values.includes(input.values[constraint.when.path] as CapabilityScalar)) {
      continue;
    }
    for (const requirement of constraint.require) {
      if (!requirement.allowedValues.includes(input.values[requirement.path] as CapabilityScalar)) {
        violations.push({
          code: "capability.field_constraint",
          path: requirement.path,
          message: `${requirement.path} must be one of ${requirement.allowedValues.join(", ")} when ${constraint.when.path} is ${String(input.values[constraint.when.path])}`,
        });
      }
    }
  }

  return { violations, warnings: [] };
}
