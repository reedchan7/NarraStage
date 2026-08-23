import type { paths } from "/contracts";
import axios from "@/utils/axios";
import { v7 as uuidv7 } from "uuid";
import {
  clearPendingIdempotencyKey,
  getPendingIdempotencyKey,
  logicalActionScope,
} from "@/features/generation/idempotency";

export const inlineChatAttachmentLimit = 768 * 1024;
export const maximumChatAttachmentBytes = 64 * 1024 * 1024;
export const supportedChatImageTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export const supportedChatVideoTypes = [
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
] as const;
export const supportedChatAudioTypes = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
] as const;
export const supportedChatDocumentTypes = ["application/pdf"] as const;
export const supportedChatMediaTypes = [
  ...supportedChatImageTypes,
  ...supportedChatVideoTypes,
  ...supportedChatAudioTypes,
  ...supportedChatDocumentTypes,
] as const;

export type ChatImageMediaType = (typeof supportedChatImageTypes)[number];
export type ChatMediaType = (typeof supportedChatMediaTypes)[number];
export type ChatImageDetail = "auto" | "low" | "high" | "original";

export type ChatAttachment = {
  schemaVersion: "1.0.0";
  id: string;
  filename: string;
  mediaType: ChatMediaType;
  byteLength: number;
  width?: number;
  height?: number;
  detail?: ChatImageDetail;
  source:
    | { type: "inline"; dataBase64: string; byteLength: number }
    | { type: "provider_file"; providerId: string; fileId: string; expiresAt?: string };
};

export type AgentModelDetails = {
  canonicalModelId: string;
  offeringId: string;
  providerId: string;
  available: boolean;
  acceptsAttachments: boolean;
  acceptsImages: boolean;
  supportedMediaTypes: ChatMediaType[];
  supportsGrounding: boolean;
  filesUpload: boolean;
  maximumAttachments: number;
  maximumAttachmentBytes: number;
  lifecycle: "stable" | "preview" | "experimental" | "deprecated";
};

type UploadOperation = paths["/api/v2/files/upload"]["post"];
type UploadRequest = UploadOperation["requestBody"]["content"]["application/json"];
type UploadResponse = UploadOperation["responses"][200]["content"]["application/json"];
type AssetUploadResponse =
  paths["/api/v2/media-assets/upload"]["put"]["responses"][201]["content"]["application/json"];

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function isSupportedChatMediaType(value: string): value is ChatMediaType {
  return supportedChatMediaTypes.includes(value as ChatMediaType);
}

export function chatAttachmentDisplayType(mediaType: ChatMediaType) {
  if (mediaType.startsWith("image/")) return "image" as const;
  if (mediaType.startsWith("video/")) return "video" as const;
  if (mediaType.startsWith("audio/")) return "audio" as const;
  return "pdf" as const;
}

export async function uploadChatProviderFile(
  file: File,
  target: AgentModelDetails,
): Promise<ChatAttachment["source"]> {
  const assetResponse = (await axios.put("/v2/media-assets/upload", file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Toonflow-Media-Type": file.type,
      "X-Toonflow-Filename": encodeURIComponent(file.name),
    },
  })) as AssetUploadResponse;
  const actionScope = logicalActionScope("chat-provider-file", {
    canonicalModelId: target.canonicalModelId,
    offeringId: target.offeringId,
    assetId: assetResponse.data.assetId,
  });
  const request: UploadRequest = {
    schemaVersion: "1.0.0",
    canonicalModelId: target.canonicalModelId,
    offeringId: target.offeringId,
    idempotencyKey: getPendingIdempotencyKey(actionScope),
    input: {
      source: "owned_asset",
      assetId: assetResponse.data.assetId,
      filename: file.name,
    },
  };
  const response = (await axios.post("/v2/files/upload", request)) as UploadResponse;
  clearPendingIdempotencyKey(actionScope);
  return {
    type: "provider_file",
    providerId: response.data.providerId,
    fileId: response.data.fileId,
    ...(response.data.expiresAt ? { expiresAt: response.data.expiresAt } : {}),
  };
}

export async function prepareChatAttachment(
  file: File,
  target: AgentModelDetails,
  upload: typeof uploadChatProviderFile = uploadChatProviderFile,
): Promise<ChatAttachment> {
  if (!target.acceptsAttachments) throw new Error("chat.attachments.model_not_supported");
  if (!isSupportedChatMediaType(file.type) || !target.supportedMediaTypes.includes(file.type)) {
    throw new Error("chat.attachments.format_unsupported");
  }
  if (
    file.size <= 0 ||
    file.size > Math.min(maximumChatAttachmentBytes, target.maximumAttachmentBytes)
  ) {
    throw new Error("chat.attachments.size_exceeded");
  }
  let source: ChatAttachment["source"];
  if (file.size <= inlineChatAttachmentLimit) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    source = { type: "inline", dataBase64: bytesToBase64(bytes), byteLength: file.size };
  } else if (target.filesUpload) {
    source = await upload(file, target);
  } else {
    throw new Error("chat.attachments.files_unavailable");
  }
  return {
    schemaVersion: "1.0.0",
    id: uuidv7(),
    filename: file.name,
    mediaType: file.type,
    byteLength: file.size,
    ...(source.type === "inline" && file.type.startsWith("image/")
      ? { detail: "auto" as const }
      : {}),
    source,
  };
}
