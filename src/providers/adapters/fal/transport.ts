import { ApiError, createFalClient, type FalClient, type QueueStatus } from "@fal-ai/client";
import { z } from "zod";
import type { CredentialVault } from "@/security/credentials/types";
import type { OperationContext } from "@/providers/ports";

const endpointSchema = z.string().regex(/^[a-z0-9][a-z0-9/_-]{2,199}$/i);
const falHandleSchema = z
  .object({
    v: z.literal(1),
    endpoint: endpointSchema,
    requestId: z.string().min(1).max(500),
  })
  .strict();

export type FalHandle = z.infer<typeof falHandleSchema>;

export interface FalQueueTransportOptions {
  credentialVault: CredentialVault;
  clientFactory?: (apiKey: string) => FalClient;
}

export type FalQueueObservation =
  | { outcome: "queued"; queuePosition?: number }
  | { outcome: "running" }
  | { outcome: "completed" }
  | { outcome: "failed"; code: string; message: string };

export class FalQueueTransport {
  readonly #credentialVault: CredentialVault;
  readonly #clientFactory: (apiKey: string) => FalClient;

  constructor(options: FalQueueTransportOptions) {
    this.#credentialVault = options.credentialVault;
    this.#clientFactory =
      options.clientFactory ?? ((apiKey) => createFalClient({ credentials: apiKey }));
  }

  async upload(blob: Blob): Promise<string> {
    return (await this.#client()).storage.upload(blob, { lifecycle: { expiresIn: "7d" } });
  }

  async submit(
    endpoint: string,
    input: Record<string, unknown>,
    context?: OperationContext,
  ): Promise<string> {
    const parsedEndpoint = endpointSchema.parse(endpoint);
    const queued = await (
      await this.#client()
    ).queue.submit(parsedEndpoint, {
      input,
      abortSignal: context?.abortSignal,
      headers: { "X-Fal-Store-IO": "0" },
    });
    return encodeFalHandle({ v: 1, endpoint: parsedEndpoint, requestId: queued.request_id });
  }

  async status(handle: string, context?: OperationContext): Promise<FalQueueObservation> {
    const parsed = decodeFalHandle(handle);
    const status = await (
      await this.#client()
    ).queue.status(parsed.endpoint, {
      requestId: parsed.requestId,
      abortSignal: context?.abortSignal,
    });
    return normalizeStatus(status);
  }

  async result(handle: string, context?: OperationContext): Promise<unknown> {
    const parsed = decodeFalHandle(handle);
    const result = await (
      await this.#client()
    ).queue.result(parsed.endpoint, {
      requestId: parsed.requestId,
      abortSignal: context?.abortSignal,
    });
    return result.data;
  }

  async cancel(
    handle: string,
    context?: OperationContext,
  ): Promise<"accepted" | "already_terminal"> {
    const parsed = decodeFalHandle(handle);
    try {
      await (
        await this.#client()
      ).queue.cancel(parsed.endpoint, {
        requestId: parsed.requestId,
        abortSignal: context?.abortSignal,
      });
      return "accepted";
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 400) return "already_terminal";
      throw cause;
    }
  }

  async #client(): Promise<FalClient> {
    const apiKey = await this.#credentialVault.get({ providerId: "fal", slot: "apiKey" });
    if (!apiKey) throw new Error("fal.credential_missing");
    return this.#clientFactory(apiKey);
  }
}

export function encodeFalHandle(handle: FalHandle): string {
  return `fal1.${Buffer.from(JSON.stringify(falHandleSchema.parse(handle))).toString("base64url")}`;
}

export function decodeFalHandle(value: string): FalHandle {
  if (!value.startsWith("fal1.") || value.length > 1_500) throw new Error("fal.handle_invalid");
  try {
    return falHandleSchema.parse(JSON.parse(Buffer.from(value.slice(5), "base64url").toString()));
  } catch {
    throw new Error("fal.handle_invalid");
  }
}

function normalizeStatus(status: QueueStatus): FalQueueObservation {
  if (status.status === "IN_QUEUE")
    return { outcome: "queued", queuePosition: status.queue_position };
  if (status.status === "IN_PROGRESS") return { outcome: "running" };
  const completion = status as QueueStatus & { error?: string; error_type?: string };
  if (completion.error) {
    return {
      outcome: "failed",
      code: completion.error_type || "fal.remote_failed",
      message: completion.error,
    };
  }
  return { outcome: "completed" };
}
