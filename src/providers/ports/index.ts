import type { OfferingId, ProviderId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";
import type { ProviderError } from "@/providers/domain/errors";
import type { FileUploadInput, ProviderFileReference } from "@/providers/ports/files";
import type { ImageOperationInput, ImageOperationResult } from "@/providers/ports/image";
import type {
  LanguageInput,
  LanguageResult,
  LanguageStreamEvent,
} from "@/providers/ports/language";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { ToolSet } from "ai";

export * from "@/providers/ports/files";
export * from "@/providers/ports/image";
export * from "@/providers/ports/language";
export * from "@/providers/ports/video";

export interface OperationRequest<TInput = unknown> {
  schemaVersion: string;
  offeringId: OfferingId;
  input: TInput;
  idempotencyKey: string;
}

export interface OperationContext {
  abortSignal?: AbortSignal;
  principalId?: string;
  continuation?: {
    parentJobId: string;
    providerId: ProviderId;
    offeringId: OfferingId;
    providerModelId: string;
    providerRequestId: string;
  };
}

export interface LanguageGeneratePort {
  operation: "language.generate";
  generate(
    request: OperationRequest<LanguageInput>,
    context?: OperationContext,
  ): Promise<LanguageResult>;
}

export interface LanguageStreamPort {
  operation: "language.stream";
  stream(
    request: OperationRequest<LanguageInput>,
    context?: OperationContext,
  ): Promise<AsyncIterable<LanguageStreamEvent>>;
}

export interface ImageGeneratePort {
  operation: "image.generate";
  generate(
    request: OperationRequest<ImageOperationInput>,
    context?: OperationContext,
  ): Promise<ImageOperationResult>;
}

export interface ImageEditPort {
  operation: "image.edit";
  edit(
    request: OperationRequest<ImageOperationInput>,
    context?: OperationContext,
  ): Promise<ImageOperationResult>;
}

export interface VideoGeneratePort {
  operation: "video.generate";
  start(
    request: OperationRequest,
    context?: OperationContext,
  ): Promise<{
    providerHandle: string;
    providerOutcome: "queued" | "running";
  }>;
}

export interface VideoStatusPort {
  operation: "video.status";
  status(providerHandle: string, context?: OperationContext): Promise<VideoStatusResult>;
}

export interface VideoCancelPort {
  operation: "video.cancel";
  cancel(
    providerHandle: string,
    context?: OperationContext,
  ): Promise<{
    outcome: "accepted" | "confirmed" | "already_terminal" | "not_supported";
  }>;
}

export type ProviderOutputArtifact =
  | {
      kind: "image" | "video" | "audio" | "file";
      url: string;
      mimeType?: string;
      authorization?: {
        kind: "credential_header";
        credentialSlot: string;
        headerName: string;
        allowedOrigins: readonly string[];
      };
    }
  | {
      kind: "image" | "video" | "audio";
      bytes: Uint8Array;
      mimeType: string;
    };

export type VideoStatusResult =
  | { outcome: "queued"; progress?: number; retryAfterMs?: number }
  | { outcome: "running"; progress?: number; retryAfterMs?: number }
  | { outcome: "succeeded"; outputs: ProviderOutputArtifact[]; providerRequestId?: string }
  | { outcome: "failed"; error: ProviderError }
  | { outcome: "cancelled" };

export interface FilesUploadPort {
  operation: "files.upload";
  upload(
    request: OperationRequest<FileUploadInput>,
    context?: OperationContext,
  ): Promise<ProviderFileReference>;
}

export interface SearchGroundPort {
  operation: "search.ground";
  ground(request: OperationRequest): Promise<unknown>;
}

export type OperationPort =
  | LanguageGeneratePort
  | LanguageStreamPort
  | ImageGeneratePort
  | ImageEditPort
  | VideoGeneratePort
  | VideoStatusPort
  | VideoCancelPort
  | FilesUploadPort
  | SearchGroundPort;

export interface ProviderAdapter<
  TPorts extends readonly OperationPort[] = readonly OperationPort[],
> {
  providerId: ProviderId;
  ports: TPorts;
  compatibility?: {
    languageModel?: LanguageModelCompatibilityBridge;
  };
}

export interface LanguageModelCompatibilityRequest {
  offeringId: OfferingId;
  imageDetails: readonly ("auto" | "low" | "high" | "original" | undefined)[];
  thinking?: {
    mode: "enabled" | "disabled";
    effort?: "low" | "high" | "max";
  };
  grounding?: boolean;
}

export interface LanguageModelCompatibilityBridge {
  resolve(request: LanguageModelCompatibilityRequest): Promise<{
    model: LanguageModelV4;
    providerOptions?: Record<string, Record<string, unknown>>;
    providerTools?: ToolSet;
  }>;
}

export function defineProviderAdapter<const TPorts extends readonly OperationPort[]>(
  adapter: ProviderAdapter<TPorts>,
): ProviderAdapter<TPorts> {
  return adapter;
}

export function operationOf(port: OperationPort): Operation {
  return port.operation;
}
