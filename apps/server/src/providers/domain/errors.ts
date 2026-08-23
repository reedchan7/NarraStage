import { z } from "zod";

export const providerErrorCategorySchema = z.enum([
  "auth",
  "forbidden",
  "invalid_input",
  "billing",
  "quota",
  "rate_limit",
  "moderation",
  "unavailable",
  "timeout",
  "cancelled",
  "invalid_response",
  "submission_unknown",
]);

export const providerErrorSchema = z
  .object({
    category: providerErrorCategorySchema,
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    providerRequestId: z.string().min(1).optional(),
    retryAfterMs: z.number().int().nonnegative().optional(),
    detail: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ProviderError = z.infer<typeof providerErrorSchema>;
