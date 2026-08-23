import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  canonicalModelIdSchema,
  offeringIdSchema,
  providerIdSchema,
  type CanonicalModelId,
  type OfferingId,
  type ProviderId,
} from "@/providers/domain/ids";
import { operationSchema, type Operation } from "@/providers/domain/operations";
import { capabilityInputSchema, type CapabilityInput } from "@/providers/domain/capabilities";
import { generationJobStateSchema, type GenerationJobState } from "@/generation/stateMachine";

export const generationConsumerSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("workbench"),
      key: z.string().min(1).max(200),
      context: z
        .object({
          projectId: z.number().int().positive(),
          scriptId: z.number().int().nonnegative(),
          trackId: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("asset_image"),
      key: z.string().min(1).max(200),
      context: z
        .object({
          projectId: z.number().int().positive(),
          assetId: z.number().int().positive(),
          assetType: z.enum(["role", "scene", "tool"]),
        })
        .strict(),
    })
    .strict(),
]);

export type GenerationConsumer = z.infer<typeof generationConsumerSchema>;

export const generationContinuationSchema = z
  .object({
    parentJobId: z.string().uuid(),
  })
  .strict();

export type GenerationContinuation = z.infer<typeof generationContinuationSchema>;

export const createGenerationJobRequestSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    idempotencyKey: z.string().min(8).max(200),
    canonicalModelId: canonicalModelIdSchema,
    offeringId: offeringIdSchema,
    providerId: providerIdSchema,
    operation: operationSchema,
    input: capabilityInputSchema,
    consumer: generationConsumerSchema.optional(),
    continuation: generationContinuationSchema.optional(),
  })
  .strict();

export type CreateGenerationJobRequest = z.infer<typeof createGenerationJobRequestSchema>;

export interface GenerationJob {
  id: string;
  schemaVersion: string;
  principalId: string;
  idempotencyKey: string;
  requestHash: string;
  canonicalModelId: CanonicalModelId;
  offeringId: OfferingId;
  providerId: ProviderId;
  operation: Operation;
  input: CapabilityInput;
  consumer?: GenerationConsumer;
  continuation?: GenerationContinuation;
  state: GenerationJobState;
  providerHandle?: string;
  providerOutcome?: "unknown" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
  result?: unknown;
  error?: unknown;
  cancelRequestedAt?: number;
  cancelReason?: string;
  nextRunAt: number;
  deadlineAt?: number;
  pollAttemptCount: number;
  importAttemptCount: number;
  importDeadlineAt?: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

const persistedImportAuthorizationSchema = z
  .object({
    kind: z.literal("credential_header"),
    credentialSlot: z.string().min(1),
    headerName: z.string().min(1),
    allowedOrigins: z.array(z.string().url()).min(1),
  })
  .strict();

export const generationImportPayloadSchema = z
  .object({
    providerRequestId: z.string().min(1).optional(),
    outputs: z.array(
      z.discriminatedUnion("source", [
        z
          .object({
            source: z.literal("remote_url"),
            kind: z.enum(["image", "video", "audio", "file"]),
            url: z.string().url(),
            mimeType: z.string().min(1).optional(),
            authorization: persistedImportAuthorizationSchema.optional(),
          })
          .strict(),
        z
          .object({
            source: z.literal("owned_asset"),
            kind: z.enum(["image", "video", "audio"]),
            assetId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            mimeType: z.string().min(1),
            byteLength: z.number().int().positive(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
        z
          .object({
            source: z.literal("provider_refresh"),
            outputIndex: z.number().int().nonnegative(),
            kind: z.enum(["image", "video", "audio"]),
            mimeType: z.string().min(1),
          })
          .strict(),
      ]),
    ),
  })
  .strict();

export type GenerationImportPayload = z.infer<typeof generationImportPayloadSchema>;

export const providerLookupEvidenceSchema = z
  .object({
    kind: z.literal("provider_lookup"),
    lookupMethod: z.enum(["provider_api", "provider_console"]),
    checkedAt: z.string().datetime({ offset: true }),
    requestIdentity: z.string().min(1).max(1_000),
    outcome: z.literal("not_found"),
    responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type ProviderLookupEvidence = z.infer<typeof providerLookupEvidenceSchema>;

export const reconciliationActionSchema = z.enum([
  "adopt_handle",
  "confirm_not_submitted",
  "abandon",
]);

export type ReconciliationAction = z.infer<typeof reconciliationActionSchema>;

export interface ReconciliationRecord {
  id: number;
  jobId: string;
  action: ReconciliationAction;
  actor: string;
  reason: string;
  evidence?: ProviderLookupEvidence;
  providerHandle?: string;
  createdAt: number;
}

export interface GenerationAttempt {
  id: string;
  jobId: string;
  sequence: number;
  providerId: ProviderId;
  offeringId: OfferingId;
  providerIdempotencyKey: string;
  state:
    | "prepared"
    | "send_started"
    | "handle_persisted"
    | "provider_rejected"
    | "submission_unknown";
  providerHandle?: string;
  error?: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationJobEvent {
  sequence: number;
  fromState: GenerationJobState | null;
  toState: GenerationJobState;
  reason: string;
  metadata?: unknown;
  createdAt: number;
}

export function stableJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

export function generationRequestHash(request: CreateGenerationJobRequest): string {
  const { idempotencyKey: _, ...identity } = request;
  return createHash("sha256").update(stableJson(identity)).digest("hex");
}

export function newGenerationJobId(): string {
  return randomUUID();
}
