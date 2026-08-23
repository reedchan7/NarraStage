import { z } from "zod";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import {
  capabilityInputSchema,
  validateCapabilityInput,
  type CapabilityInput,
} from "@/providers/domain/capabilities";
import type { OfferingId } from "@/providers/domain/ids";
import type { H3VideoInput } from "@/providers/ports/video";

const h3ValuesSchema = z
  .object({
    prompt: z.string().min(1).max(7_000),
    durationSeconds: z.number().int().min(4).max(15),
    resolution: z.enum(["480P", "768P", "2K", "4K"]),
    aspectRatio: z.enum(["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]).optional(),
    seed: z.number().int().optional(),
    enablePromptExpansion: z.boolean().optional(),
    promptExpansionMode: z.enum(["fast", "balanced", "quality"]).optional(),
    enableSafetyChecker: z.boolean().optional(),
  })
  .strict();

const h3InputSchema = capabilityInputSchema.extend({
  mode: z.enum(["text", "keyframes", "reference"]),
  values: h3ValuesSchema,
});

export class H3InputError extends Error {
  readonly violations: Array<{ code: string; path: string; message: string }>;

  constructor(violations: Array<{ code: string; path: string; message: string }>) {
    super("h3.input_invalid");
    this.violations = violations;
  }
}

export function parseH3Input(input: unknown, offeringId: OfferingId): H3VideoInput {
  const parsed = h3InputSchema.safeParse(input);
  if (!parsed.success) {
    throw new H3InputError(
      parsed.error.issues.map((issue) => ({
        code: "capability.input_shape_invalid",
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  const offering = builtinCatalog.offerings.find((candidate) => candidate.id === offeringId);
  const operation = offering?.operations.find(
    (candidate) => candidate.operation === "video.generate" && candidate.enabled,
  );
  const capability = builtinCatalog.capabilitySchemas.find(
    (candidate) => candidate.id === operation?.capabilitySchemaId,
  );
  if (!capability) throw new Error("h3.capability_schema_missing");
  const validation = validateCapabilityInput(capability, parsed.data as CapabilityInput);
  if (validation.violations.length > 0) throw new H3InputError(validation.violations);
  return parsed.data as H3VideoInput;
}
