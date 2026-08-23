import { z } from "zod";
import { providerErrorSchema } from "@/providers/domain/errors";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const languageImageMediaTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const languageImageDetailSchema = z.enum(["auto", "low", "high", "original"]);

export const languageImageSourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("inline"),
      mediaType: languageImageMediaTypeSchema,
      dataBase64: z.string().min(1),
      byteLength: z.number().int().positive(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("url"),
      url: z.string().url().max(8_192),
      mediaType: languageImageMediaTypeSchema.optional(),
      byteLength: z.number().int().positive().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("provider_file"),
      providerId: z.string().min(1),
      fileId: z.string().min(1),
      mediaType: languageImageMediaTypeSchema,
      byteLength: z.number().int().positive().optional(),
      expiresAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
]);

export const languageTextPartSchema = z
  .object({ type: z.literal("text"), text: z.string() })
  .strict();
export const languageImagePartSchema = z
  .object({
    type: z.literal("image"),
    source: languageImageSourceSchema,
    detail: languageImageDetailSchema.optional(),
  })
  .strict();
export const languageFileSourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("inline"),
      mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
      dataBase64: z.string().min(1),
      byteLength: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("url"),
      url: z.string().url().max(8_192),
      mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
      byteLength: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("provider_file"),
      providerId: z.string().min(1),
      fileId: z.string().min(1),
      mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
      byteLength: z.number().int().positive().optional(),
      expiresAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
]);
export const languageFilePartSchema = z
  .object({ type: z.literal("file"), source: languageFileSourceSchema })
  .strict();
export const languageReasoningPartSchema = z
  .object({ type: z.literal("reasoning"), text: z.string() })
  .strict();
export const languageToolCallPartSchema = z
  .object({
    type: z.literal("tool_call"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
  })
  .strict();
export const languageToolResultPartSchema = z
  .object({
    type: z.literal("tool_result"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    output: z.union([z.string(), z.unknown()]),
    isError: z.boolean().optional(),
  })
  .strict();

export const languageMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string() }).strict(),
  z
    .object({
      role: z.literal("user"),
      content: z
        .array(z.union([languageTextPartSchema, languageImagePartSchema, languageFilePartSchema]))
        .min(1),
    })
    .strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z
        .array(
          z.union([
            languageTextPartSchema,
            languageReasoningPartSchema,
            languageToolCallPartSchema,
          ]),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      role: z.literal("tool"),
      content: z.array(languageToolResultPartSchema).min(1),
    })
    .strict(),
]);

export const languageToolSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    description: z.string().max(1_024).optional(),
    inputSchema: jsonObjectSchema,
    strict: z.boolean().optional(),
  })
  .strict();

export const languageInputSchema = z
  .object({
    messages: z.array(languageMessageSchema).min(1),
    thinking: z
      .object({
        mode: z.enum(["enabled", "disabled", "adaptive"]),
        effort: z.enum(["low", "high", "max"]).optional(),
      })
      .strict()
      .optional(),
    maxOutputTokens: z.number().int().positive().max(384_000).optional(),
    tools: z.array(languageToolSchema).max(128).optional(),
    toolChoice: z
      .union([
        z.enum(["auto", "none", "required"]),
        z.object({ type: z.literal("tool"), toolName: z.string().min(1) }).strict(),
      ])
      .optional(),
    responseFormat: z
      .union([
        z.object({ type: z.literal("text") }).strict(),
        z
          .object({
            type: z.literal("json"),
            schema: jsonObjectSchema.optional(),
            name: z.string().min(1).max(64).optional(),
            description: z.string().max(1_024).optional(),
          })
          .strict(),
      ])
      .optional(),
    grounding: z
      .object({ mode: z.literal("web_search") })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.thinking?.mode === "disabled" && input.thinking.effort) {
      context.addIssue({
        code: "custom",
        path: ["thinking", "effort"],
        message: "reasoning effort cannot be set when thinking is disabled",
      });
    }
    if (input.toolChoice && typeof input.toolChoice !== "string") {
      const selectedTool = input.toolChoice.toolName;
      const exists = input.tools?.some((tool) => tool.name === selectedTool);
      if (!exists) {
        context.addIssue({
          code: "custom",
          path: ["toolChoice", "toolName"],
          message: "tool choice must reference a declared tool",
        });
      }
    }
  });

export const languageToolCallSchema = z
  .object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
  })
  .strict();

export const languageSourceSchema = z.discriminatedUnion("sourceType", [
  z
    .object({
      sourceType: z.literal("url"),
      id: z.string().min(1),
      url: z.string().url(),
      title: z.string().optional(),
      providerMetadata: jsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal("document"),
      id: z.string().min(1),
      mediaType: z.string().min(1),
      title: z.string().min(1),
      filename: z.string().optional(),
      providerMetadata: jsonObjectSchema.optional(),
    })
    .strict(),
]);

export const languageUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
  })
  .strict();

export const languageResultSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    text: z.string(),
    reasoning: z.string(),
    toolCalls: z.array(languageToolCallSchema),
    finishReason: z.enum(["stop", "length", "content_filter", "tool_calls", "error", "other"]),
    usage: languageUsageSchema,
    sources: z.array(languageSourceSchema).optional(),
    providerMetadata: jsonObjectSchema.optional(),
    providerRequestId: z.string().min(1).optional(),
    resolvedModelId: z.string().min(1),
  })
  .strict();

export const languageStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), delta: z.string() }).strict(),
  z.object({ type: z.literal("reasoning_delta"), delta: z.string() }).strict(),
  z.object({ type: z.literal("tool_call"), call: languageToolCallSchema }).strict(),
  z.object({ type: z.literal("source"), source: languageSourceSchema }).strict(),
  z
    .object({
      type: z.literal("finish"),
      finishReason: languageResultSchema.shape.finishReason,
      usage: languageUsageSchema,
      providerRequestId: z.string().min(1).optional(),
      resolvedModelId: z.string().min(1),
      providerMetadata: jsonObjectSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("error"), error: providerErrorSchema }).strict(),
]);

export type LanguageInput = z.infer<typeof languageInputSchema>;
export type LanguageMessage = z.infer<typeof languageMessageSchema>;
export type LanguageResult = z.infer<typeof languageResultSchema>;
export type LanguageStreamEvent = z.infer<typeof languageStreamEventSchema>;
export type LanguageSource = z.infer<typeof languageSourceSchema>;
export type LanguageUsage = z.infer<typeof languageUsageSchema>;
