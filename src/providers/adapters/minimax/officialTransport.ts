import { z } from "zod";
import type { OperationContext } from "@/providers/ports";
import type { CredentialVault } from "@/security/credentials/types";
import { MiniMaxHttpError } from "@/providers/adapters/minimax/errors";
import { miniMaxH3Manifest } from "@/providers/adapters/minimax/h3Manifest";

const createResponseSchema = z.object({ task_id: z.string().min(1) }).passthrough();
const taskSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
    content: z.object({ url: z.string().url().optional() }).passthrough().optional(),
    error: z.object({ code: z.string(), message: z.string() }).passthrough().optional(),
  })
  .passthrough();
const queryResponseSchema = z.object({ task: taskSchema }).passthrough();
const cancelResponseSchema = z
  .object({
    task_id: z.string().min(1),
    action: z.enum(["cancelled", "deleted"]),
    status: z.enum(["cancelled", "deleted"]),
  })
  .passthrough();

export type MiniMaxTask = z.infer<typeof taskSchema>;

export class MiniMaxOfficialTransport {
  readonly #credentialVault: CredentialVault;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(options: {
    credentialVault: CredentialVault;
    fetch?: typeof fetch;
    baseUrl?: string;
  }) {
    this.#credentialVault = options.credentialVault;
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.baseUrl ?? miniMaxH3Manifest.baseUrl;
  }

  async submit(input: Record<string, unknown>, context?: OperationContext): Promise<string> {
    const response = await this.#request(miniMaxH3Manifest.createPath, {
      method: "POST",
      body: JSON.stringify(input),
      signal: context?.abortSignal,
    });
    return createResponseSchema.parse(await response.json()).task_id;
  }

  async status(taskId: string, context?: OperationContext): Promise<MiniMaxTask> {
    assertTaskId(taskId);
    const response = await this.#request(
      `${miniMaxH3Manifest.queryPath}/${encodeURIComponent(taskId)}`,
      { method: "GET", signal: context?.abortSignal },
    );
    return queryResponseSchema.parse(await response.json()).task;
  }

  async cancelQueued(taskId: string, context?: OperationContext): Promise<void> {
    assertTaskId(taskId);
    const response = await this.#request(
      `${miniMaxH3Manifest.cancelPath}/${encodeURIComponent(taskId)}`,
      { method: "DELETE", signal: context?.abortSignal },
    );
    const result = cancelResponseSchema.parse(await response.json());
    if (result.action !== "cancelled") throw new Error("minimax.cancel_deleted_terminal_task");
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = await this.#credentialVault.get({ providerId: "minimax", slot: "apiKey" });
    if (!apiKey) throw new Error("minimax.credential_missing");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (response.ok) return response;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    let message = `MiniMax HTTP ${response.status}`;
    try {
      const body = (await response.json()) as {
        error?: { message?: unknown };
      };
      if (typeof body.error?.message === "string") message = body.error.message;
    } catch {}
    throw new MiniMaxHttpError(response.status, message, requestId);
  }
}

function assertTaskId(taskId: string): void {
  if (!/^[A-Za-z0-9_-]{1,500}$/.test(taskId)) throw new Error("minimax.task_id_invalid");
}
