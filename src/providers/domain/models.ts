import { z } from "zod";
import {
  canonicalModelIdSchema,
  capabilitySchemaIdSchema,
  offeringIdSchema,
  providerIdSchema,
  type CanonicalModelId,
  type CapabilitySchemaId,
  type OfferingId,
  type ProviderId,
} from "@/providers/domain/ids";
import { operationSchema, type Operation } from "@/providers/domain/operations";
import { priceSnapshotSchema, type PriceSnapshot } from "@/providers/domain/pricing";
import { capabilitySchema, type CapabilitySchema } from "@/providers/domain/capabilities";

export type AccessChannel = "official" | "aggregator" | "compatibility";
export type Lifecycle = "stable" | "preview" | "experimental" | "deprecated";
export type ImplementationState = "declared" | "implemented";
export type SupportEvidenceLevel =
  | "implemented"
  | "contract_verified"
  | "live_verified"
  | "product_accepted";
export type OperationFeature =
  | "streaming"
  | "tools"
  | "thinking"
  | "structured_output"
  | "image_input"
  | "video_input"
  | "audio_input"
  | "pdf_input"
  | "provider_files"
  | "grounding";

export interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  regions?: string[];
  credentialSlots: Array<{
    slot: string;
    environmentVariables: string[];
  }>;
}

export interface CanonicalModel {
  id: CanonicalModelId;
  owner: string;
  family: string;
  name: string;
  lifecycle: Lifecycle;
}

export interface OfferingOperation {
  operation: Operation;
  capabilitySchemaId: CapabilitySchemaId;
  enabled: boolean;
  features?: OperationFeature[];
  outputProfiles?: Array<{
    resolution: string;
    delivery: "native" | "regenerated" | "upscaled" | "provider_managed";
    sourceResolution?: string;
  }>;
}

export interface OfferingSupport {
  implementation: ImplementationState;
  evidence: SupportEvidenceLevel[];
  lastVerifiedAt?: string;
  verifiedProviderModelId?: string;
}

export interface Offering {
  id: OfferingId;
  canonicalModelId: CanonicalModelId;
  providerId: ProviderId;
  providerModelId: string;
  accessChannel: AccessChannel;
  lifecycle: Lifecycle;
  operations: OfferingOperation[];
  support: OfferingSupport;
  priceSnapshotId?: string;
}

export interface ProviderCatalog {
  schemaVersion: string;
  providers: ProviderDescriptor[];
  models: CanonicalModel[];
  offerings: Offering[];
  capabilitySchemas: CapabilitySchema[];
  priceSnapshots: PriceSnapshot[];
}

export const accessChannelSchema = z.enum(["official", "aggregator", "compatibility"]);
export const lifecycleSchema = z.enum(["stable", "preview", "experimental", "deprecated"]);
export const supportEvidenceLevelSchema = z.enum([
  "implemented",
  "contract_verified",
  "live_verified",
  "product_accepted",
]);

export const providerDescriptorSchema = z
  .object({
    id: providerIdSchema,
    name: z.string().min(1),
    regions: z.array(z.string().min(1)).optional(),
    credentialSlots: z.array(
      z
        .object({
          slot: z.string().min(1),
          environmentVariables: z.array(z.string().min(1)),
        })
        .strict(),
    ),
  })
  .strict();

export const canonicalModelSchema = z
  .object({
    id: canonicalModelIdSchema,
    owner: z.string().min(1),
    family: z.string().min(1),
    name: z.string().min(1),
    lifecycle: lifecycleSchema,
  })
  .strict();

export const offeringOperationSchema = z
  .object({
    operation: operationSchema,
    capabilitySchemaId: capabilitySchemaIdSchema,
    enabled: z.boolean(),
    features: z
      .array(
        z.enum([
          "streaming",
          "tools",
          "thinking",
          "structured_output",
          "image_input",
          "video_input",
          "audio_input",
          "pdf_input",
          "provider_files",
          "grounding",
        ]),
      )
      .optional(),
    outputProfiles: z
      .array(
        z
          .object({
            resolution: z.string().min(1),
            delivery: z.enum(["native", "regenerated", "upscaled", "provider_managed"]),
            sourceResolution: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const offeringSchema = z
  .object({
    id: offeringIdSchema,
    canonicalModelId: canonicalModelIdSchema,
    providerId: providerIdSchema,
    providerModelId: z.string().min(1),
    accessChannel: accessChannelSchema,
    lifecycle: lifecycleSchema,
    operations: z.array(offeringOperationSchema),
    support: z
      .object({
        implementation: z.enum(["declared", "implemented"]),
        evidence: z.array(supportEvidenceLevelSchema),
        lastVerifiedAt: z.string().datetime({ offset: true }).optional(),
        verifiedProviderModelId: z.string().min(1).optional(),
      })
      .strict(),
    priceSnapshotId: z.string().min(1).optional(),
  })
  .strict();

export const providerCatalogSchema = z
  .object({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    providers: z.array(providerDescriptorSchema),
    models: z.array(canonicalModelSchema),
    offerings: z.array(offeringSchema),
    capabilitySchemas: z.array(capabilitySchema),
    priceSnapshots: z.array(priceSnapshotSchema),
  })
  .strict();
