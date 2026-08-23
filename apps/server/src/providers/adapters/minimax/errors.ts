import type { ProviderError } from "@/providers/domain/errors";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import { H3InputError } from "@/providers/adapters/minimax/h3Schema";

export class MiniMaxHttpError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(status: number, message: string, requestId?: string) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}

function category(status: number): ProviderError["category"] {
  if (status === 400 || status === 404) return "invalid_input";
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 422) return "moderation";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "unavailable";
  return "invalid_response";
}

export function normalizeMiniMaxError(cause: unknown): ProviderExecutionError {
  if (cause instanceof ProviderExecutionError) return cause;
  if (cause instanceof H3InputError) {
    return new ProviderExecutionError(
      {
        category: "invalid_input",
        code: cause.message,
        message: "MiniMax request does not satisfy the selected offering contract",
        retryable: false,
        detail: { violations: cause.violations },
      },
      cause,
    );
  }
  if (cause instanceof MiniMaxHttpError) {
    const errorCategory = category(cause.status);
    return new ProviderExecutionError(
      {
        category: errorCategory,
        code: `minimax.http_${cause.status}`,
        message: cause.message || "MiniMax request failed",
        retryable: ["rate_limit", "timeout", "unavailable"].includes(errorCategory),
        ...(cause.requestId ? { providerRequestId: cause.requestId } : {}),
      },
      cause,
    );
  }
  if (cause instanceof Error && cause.name === "AbortError") {
    return new ProviderExecutionError(
      {
        category: "cancelled",
        code: "minimax.cancelled",
        message: "MiniMax request was cancelled",
        retryable: false,
      },
      cause,
    );
  }
  const error = cause instanceof Error ? cause : new Error("MiniMax request failed");
  if (error.message === "minimax.credential_missing") {
    return new ProviderExecutionError(
      {
        category: "auth",
        code: error.message,
        message: "MiniMax credential is not configured",
        retryable: false,
      },
      cause,
    );
  }
  const invalid =
    error.message.startsWith("minimax.") || error.message === "provider.asset_resolver_unavailable";
  return new ProviderExecutionError(
    {
      category: invalid ? "invalid_input" : "unavailable",
      code: invalid ? error.message : "minimax.transport_failed",
      message: invalid ? "MiniMax request is invalid" : "MiniMax request failed",
      retryable: !invalid,
    },
    cause,
  );
}
