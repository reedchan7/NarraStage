import { z } from "zod";

const inlineFileUploadInputSchema = z
  .object({
    dataBase64: z.string().min(1),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024),
    mediaType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
    filename: z.string().min(1).max(255),
    expiresAfterSeconds: z.number().int().min(3_600).max(2_592_000).optional(),
  })
  .strict();

const ownedAssetFileUploadInputSchema = z
  .object({
    source: z.literal("owned_asset"),
    assetId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    filename: z.string().min(1).max(255).optional(),
    expiresAfterSeconds: z.number().int().min(3_600).max(2_592_000).optional(),
  })
  .strict();

export const fileUploadInputSchema = z.union([
  inlineFileUploadInputSchema,
  ownedAssetFileUploadInputSchema,
]);

export const providerFileReferenceSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    providerId: z.string().min(1),
    fileId: z.string().min(1),
    mediaType: z.string().min(1),
    filename: z.string().min(1).optional(),
    byteLength: z.number().int().positive().optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type FileUploadInput = z.infer<typeof fileUploadInputSchema>;
export type ProviderFileReference = z.infer<typeof providerFileReferenceSchema>;

export interface ResolvedProviderFileAsset {
  assetId: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  filename?: string;
  source: { kind: "path"; path: string } | { kind: "blob"; blob: Blob };
}

export interface ProviderFileAssetResolver {
  resolveFile(
    assetId: string,
    context?: import("@/providers/ports").OperationContext,
  ): Promise<ResolvedProviderFileAsset>;
}
