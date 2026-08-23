import { z } from "zod";

export const generationJobCursorSchema = z
  .object({
    updatedAt: z.number().int().nonnegative(),
    id: z.string().uuid(),
  })
  .strict();

export type GenerationJobCursor = z.infer<typeof generationJobCursorSchema>;

export function encodeGenerationJobCursor(cursor: GenerationJobCursor): string {
  return Buffer.from(JSON.stringify(generationJobCursorSchema.parse(cursor)), "utf8").toString(
    "base64url",
  );
}

export function decodeGenerationJobCursor(value: string): GenerationJobCursor {
  try {
    return generationJobCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch (cause) {
    throw new Error("generation.invalid_cursor", { cause });
  }
}
