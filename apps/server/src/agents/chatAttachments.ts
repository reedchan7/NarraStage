import { z } from "zod";
import type { UserContent } from "@ai-sdk/provider-utils";
import { languageImageDetailSchema } from "@/providers/ports/language";
import { getProviderFileLedger } from "@/providers/files/providerFileLedger";

export const chatMediaTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
  "application/pdf",
]);

const inlineSourceSchema = z
  .object({
    type: z.literal("inline"),
    dataBase64: z.string().min(1),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(768 * 1024),
  })
  .strict();

const providerFileSourceSchema = z
  .object({
    type: z.literal("provider_file"),
    providerId: z.string().min(1),
    fileId: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const chatAttachmentSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.string().uuid(),
    filename: z.string().min(1).max(255),
    mediaType: chatMediaTypeSchema,
    byteLength: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    detail: languageImageDetailSchema.optional(),
    source: z.discriminatedUnion("type", [inlineSourceSchema, providerFileSourceSchema]),
  })
  .strict()
  .superRefine((attachment, context) => {
    if (attachment.source.type === "inline") {
      const decoded = Buffer.from(attachment.source.dataBase64, "base64");
      if (decoded.byteLength !== attachment.source.byteLength) {
        context.addIssue({
          code: "custom",
          path: ["source", "byteLength"],
          message: "inline attachment byte length does not match its payload",
        });
      }
      if (attachment.byteLength !== attachment.source.byteLength) {
        context.addIssue({
          code: "custom",
          path: ["byteLength"],
          message: "attachment byte length does not match its source",
        });
      }
    }
    if (attachment.source.type === "provider_file" && attachment.detail) {
      context.addIssue({
        code: "custom",
        path: ["detail"],
        message: "provider file attachments do not support detail",
      });
    }
    if (!attachment.mediaType.startsWith("image/") && attachment.detail) {
      context.addIssue({
        code: "custom",
        path: ["detail"],
        message: "detail is only supported for image attachments",
      });
    }
  });

export const agentChatInputSchema = z
  .object({
    content: z.string().max(100_000),
    attachments: z.array(chatAttachmentSchema).max(20).optional(),
    grounding: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.content.trim().length > 0 || Boolean(input.attachments?.length), {
    message: "chat message must include text or an attachment",
  });

export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;

export async function assertAgentProviderFilesOwned(
  attachments: readonly ChatAttachment[],
  principalId: string,
): Promise<void> {
  const references = attachments.flatMap((attachment) =>
    attachment.source.type === "provider_file"
      ? [
          {
            providerId: attachment.source.providerId,
            fileId: attachment.source.fileId,
          },
        ]
      : [],
  );
  if (references.length > 0) {
    await getProviderFileLedger().assertOwned(references, principalId);
  }
}

export function agentSourceReference(source: unknown) {
  if (!source || typeof source !== "object") return undefined;
  const value = source as Record<string, unknown>;
  if (value.type !== "source" || typeof value.id !== "string") return undefined;
  if (value.sourceType === "url" && typeof value.url === "string") {
    let site: string | undefined;
    try {
      site = new URL(value.url).hostname;
    } catch {
      return undefined;
    }
    return {
      id: value.id,
      reference: {
        title: typeof value.title === "string" ? value.title : value.url,
        type: "web",
        url: value.url,
        site,
      },
    };
  }
  if (value.sourceType === "document" && typeof value.title === "string") {
    return {
      id: value.id,
      reference: {
        title: value.title,
        type: "document",
        ...(typeof value.filename === "string" ? { content: value.filename } : {}),
      },
    };
  }
  return undefined;
}

export function agentUserContent(
  text: string,
  attachments: readonly ChatAttachment[],
): UserContent {
  const content: UserContent = text.trim() ? [{ type: "text", text }] : [];
  for (const attachment of attachments) {
    const data =
      attachment.source.type === "inline"
        ? { type: "data" as const, data: attachment.source.dataBase64 }
        : {
            type: "reference" as const,
            reference: { [attachment.source.providerId]: attachment.source.fileId },
          };
    content.push({
      type: "file",
      data,
      mediaType: attachment.mediaType,
      filename: attachment.filename,
      ...(attachment.source.type === "inline" && attachment.detail
        ? { providerOptions: { narrastage: { imageDetail: attachment.detail } } }
        : {}),
    });
  }
  return content;
}
