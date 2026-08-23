import { z } from "zod";

const stableIdPattern = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;

export const providerIdSchema = z.string().regex(stableIdPattern);
export const canonicalModelIdSchema = z.string().regex(stableIdPattern);
export const offeringIdSchema = z.string().regex(stableIdPattern);
export const capabilitySchemaIdSchema = z.string().regex(stableIdPattern);

export type ProviderId = z.infer<typeof providerIdSchema>;
export type CanonicalModelId = z.infer<typeof canonicalModelIdSchema>;
export type OfferingId = z.infer<typeof offeringIdSchema>;
export type CapabilitySchemaId = z.infer<typeof capabilitySchemaIdSchema>;

export interface CanonicalModelRef {
  canonicalModelId: CanonicalModelId;
}

export interface OfferingRef extends CanonicalModelRef {
  offeringId: OfferingId;
}
