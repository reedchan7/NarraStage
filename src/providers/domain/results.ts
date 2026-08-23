import { z } from "zod";

export const generationArtifactSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["image", "video", "audio", "file"]),
    assetId: z.string().min(1),
    mimeType: z.string().min(1),
    byteLength: z.number().int().nonnegative().optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const generationResultSchema = z
  .object({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    artifacts: z.array(generationArtifactSchema),
    text: z.string().optional(),
    usage: z.record(z.string(), z.unknown()).optional(),
    cost: z.record(z.string(), z.unknown()).optional(),
    providerMetadata: z.record(z.string(), z.unknown()).optional(),
    provenance: z
      .object({
        providerId: z.string().min(1),
        offeringId: z.string().min(1),
        providerModelId: z.string().min(1),
        providerRequestId: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type GenerationArtifact = z.infer<typeof generationArtifactSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
