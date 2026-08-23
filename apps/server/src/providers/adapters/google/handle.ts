import { z } from "zod";

const googleHandleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      v: z.literal(1),
      kind: z.literal("veo"),
      modelId: z.string().min(1),
      operationName: z.string().min(1),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      kind: z.literal("omni"),
      modelId: z.string().min(1),
      interactionId: z.string().min(1),
    })
    .strict(),
]);

export type GoogleProviderHandle = z.infer<typeof googleHandleSchema>;

export function encodeGoogleHandle(handle: GoogleProviderHandle): string {
  return Buffer.from(JSON.stringify(googleHandleSchema.parse(handle))).toString("base64url");
}

export function decodeGoogleHandle(value: string): GoogleProviderHandle {
  try {
    return googleHandleSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new Error("google.provider_handle_invalid");
  }
}
