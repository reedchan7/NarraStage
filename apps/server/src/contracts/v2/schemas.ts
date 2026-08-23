import { z } from "zod";
import { canonicalModelIdSchema, offeringIdSchema, providerIdSchema } from "@/providers/domain/ids";
import { operationSchema } from "@/providers/domain/operations";
import { capabilityInputSchema } from "@/providers/domain/capabilities";
import { providerCatalogSchema } from "@/providers/domain/models";
import { costEstimateSchema } from "@/providers/domain/pricing";
import { generationJobStateSchema } from "@/generation/stateMachine";
import {
  generationConsumerSchema,
  generationContinuationSchema,
  providerLookupEvidenceSchema,
  reconciliationActionSchema,
} from "@/generation/domain";
import {
  fileUploadInputSchema,
  languageInputSchema,
  languageResultSchema,
  languageStreamEventSchema,
  providerFileReferenceSchema,
} from "@/providers/ports";
import { offeringAvailabilitySchema } from "@/providers/availability/offeringAvailability";

export const contractVersion = "2.0.0";

export function apiEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z
    .object({
      code: z.number().int(),
      data,
      message: z.string(),
    })
    .strict();
}

export const metaSchema = z
  .object({
    contractVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    openapiSha256: z.string().regex(/^[a-f0-9]{64}$/),
    backendRevision: z.string().min(1),
    webRevision: z.string().min(1),
  })
  .strict();

export const catalogResponseSchema = apiEnvelopeSchema(
  providerCatalogSchema.extend({ availability: z.array(offeringAvailabilitySchema) }),
);

export const offeringPreferenceSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("pinned"),
      offeringId: offeringIdSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal("auto"),
      profile: z.enum(["balanced", "lowest_cost"]),
    })
    .strict(),
]);

export const preflightRequestSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    canonicalModelId: canonicalModelIdSchema,
    operation: operationSchema,
    input: capabilityInputSchema,
    offeringPreference: offeringPreferenceSchema,
    continuation: generationContinuationSchema.optional(),
    displayCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("CNY"),
  })
  .strict();

const violationSchema = z
  .object({
    code: z.string().min(1),
    path: z.string(),
    message: z.string(),
  })
  .strict();

const warningSchema = z
  .object({
    code: z.string().min(1),
    path: z.string().optional(),
    message: z.string(),
  })
  .strict();

export const preflightResultSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    canonicalModelId: canonicalModelIdSchema,
    operation: operationSchema,
    offerings: z.array(
      z
        .object({
          offeringId: offeringIdSchema,
          providerId: providerIdSchema,
          accessChannel: z.enum(["official", "aggregator", "compatibility"]),
          eligible: z.boolean(),
          violations: z.array(violationSchema),
          warnings: z.array(warningSchema),
          cost: costEstimateSchema.optional(),
        })
        .strict(),
    ),
    selection: z
      .object({
        status: z.enum(["selected", "unavailable"]),
        offeringId: offeringIdSchema.optional(),
        reasonCodes: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const preflightResponseSchema = apiEnvelopeSchema(preflightResultSchema);

export const supportResultSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    providers: z.array(
      z
        .object({
          providerId: providerIdSchema,
          credential: z
            .object({
              configured: z.boolean(),
              source: z.enum(["environment", "vault", "none", "unknown"]),
            })
            .strict(),
        })
        .strict(),
    ),
    offerings: z.array(
      z
        .object({
          offeringId: offeringIdSchema,
          implementation: z.enum(["declared", "implemented"]),
          evidence: z.array(
            z.enum(["implemented", "contract_verified", "live_verified", "product_accepted"]),
          ),
          lastVerifiedAt: z.string().datetime({ offset: true }).optional(),
          availability: z.array(offeringAvailabilitySchema),
        })
        .strict(),
    ),
  })
  .strict();

export const supportResponseSchema = apiEnvelopeSchema(supportResultSchema);

export const providerCredentialsResultSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    providers: z.array(
      z
        .object({
          providerId: providerIdSchema,
          health: z.enum(["unknown", "healthy", "degraded", "unhealthy"]),
          slots: z.array(
            z
              .object({
                slot: z.string().min(1),
                configured: z.boolean(),
                source: z.enum(["environment", "electron_safe_storage", "memory", "none"]),
                writable: z.boolean(),
                updatedAt: z.string().datetime({ offset: true }).optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export const providerCredentialsResponseSchema = apiEnvelopeSchema(providerCredentialsResultSchema);

export const providerHealthCheckResponseSchema = apiEnvelopeSchema(
  z
    .object({
      schemaVersion: z.literal("2.0.0"),
      providerId: providerIdSchema,
      health: z.enum(["unknown", "healthy", "degraded", "unhealthy"]),
      checkedAt: z.string().datetime({ offset: true }).optional(),
      reasonCode: z.string().min(1).optional(),
      offerings: z.array(
        z
          .object({
            providerId: providerIdSchema,
            offeringId: offeringIdSchema,
            providerModelId: z.string().min(1),
            deploymentRegion: z.string().min(1),
            health: z.enum(["unknown", "healthy", "degraded", "unhealthy"]),
            capabilitiesObserved: z.boolean(),
            supportedOperations: z.array(operationSchema),
            revisionObserved: z.boolean(),
            resolvedProviderModelId: z.string().min(1).optional(),
            checkedAt: z.string().datetime({ offset: true }).optional(),
            reasonCode: z.string().min(1).optional(),
          })
          .strict(),
      ),
    })
    .strict(),
);

const providerExecutionIdentitySchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    idempotencyKey: z.string().min(8).max(200),
    canonicalModelId: canonicalModelIdSchema,
    offeringId: offeringIdSchema,
  })
  .strict();

export const languageExecutionRequestSchema = providerExecutionIdentitySchema.extend({
  input: languageInputSchema,
});

export const languageExecutionResponseSchema = apiEnvelopeSchema(languageResultSchema);

export const languageStreamResponseSchema = languageStreamEventSchema;

export const fileExecutionRequestSchema = providerExecutionIdentitySchema.extend({
  input: fileUploadInputSchema,
});

export const fileExecutionResponseSchema = apiEnvelopeSchema(providerFileReferenceSchema);

export const workbenchAssetIngestRequestSchema = z
  .object({
    projectId: z.number().int().positive(),
    items: z
      .array(
        z
          .object({
            source: z.enum(["assets", "storyboard"]),
            id: z.number().int().positive(),
            kind: z.enum(["image", "video", "audio"]),
            role: z.string().min(1).max(100),
            durationSeconds: z.number().positive().max(15).optional(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

export const workbenchAssetIngestResponseSchema = apiEnvelopeSchema(
  z
    .object({
      assets: z.array(
        z
          .object({
            assetId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            kind: z.enum(["image", "video", "audio"]),
            role: z.string().min(1),
            durationSeconds: z.number().positive().optional(),
            mimeType: z.string().min(1),
            byteLength: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      ),
    })
    .strict(),
);

export const ownedAssetUploadResponseSchema = apiEnvelopeSchema(
  z
    .object({
      assetId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      kind: z.enum(["image", "video", "audio", "file"]),
      mediaType: z.string().min(1),
      byteLength: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      filename: z.string().min(1).max(255),
    })
    .strict(),
);

export const submitGenerationJobSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    idempotencyKey: z.string().min(8).max(200),
    canonicalModelId: canonicalModelIdSchema,
    offeringId: offeringIdSchema,
    operation: operationSchema,
    input: capabilityInputSchema,
    consumer: generationConsumerSchema.optional(),
    continuation: generationContinuationSchema.optional(),
  })
  .strict();

export const generationJobViewSchema = z
  .object({
    id: z.string().uuid(),
    schemaVersion: z.string(),
    idempotencyKey: z.string(),
    canonicalModelId: canonicalModelIdSchema,
    offeringId: offeringIdSchema,
    providerId: providerIdSchema,
    operation: operationSchema,
    input: capabilityInputSchema,
    consumer: generationConsumerSchema.optional(),
    continuation: generationContinuationSchema.optional(),
    state: generationJobStateSchema,
    providerOutcome: z
      .enum(["unknown", "queued", "running", "succeeded", "failed", "cancelled"])
      .optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
    cancelRequestedAt: z.number().int().optional(),
    cancelReason: z.string().optional(),
    nextRunAt: z.number().int(),
    pollAttemptCount: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
    requiresReconciliation: z.boolean(),
  })
  .strict();

export const generationJobResponseSchema = apiEnvelopeSchema(generationJobViewSchema);
export const generationJobListResponseSchema = apiEnvelopeSchema(
  z
    .object({
      jobs: z.array(generationJobViewSchema),
      nextCursor: z.string().min(1).optional(),
    })
    .strict(),
);

export const materializedWorkbenchOutputResponseSchema = apiEnvelopeSchema(
  z
    .object({
      videoId: z.number().int().positive(),
      url: z.string().min(1),
    })
    .strict(),
);

export const materializedAssetImageResponseSchema = apiEnvelopeSchema(
  z
    .object({
      imageId: z.number().int().positive(),
      url: z.string().min(1),
    })
    .strict(),
);

export const cancelGenerationJobSchema = z
  .object({
    reason: z.string().min(1).max(500),
  })
  .strict();

export const reconcileGenerationJobSchema = z
  .object({
    action: reconciliationActionSchema,
    reason: z.string().min(1).max(1_000),
    evidence: providerLookupEvidenceSchema.optional(),
    providerHandle: z.string().min(1).max(1_000).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "confirm_not_submitted" && !input.evidence) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "provider lookup evidence is required",
      });
    }
  });
