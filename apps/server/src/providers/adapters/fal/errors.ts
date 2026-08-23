import { ApiError } from "@fal-ai/client";
import type { ProviderError } from "@/providers/domain/errors";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import { H3InputError } from "@/providers/adapters/minimax/h3Schema";

function category(status: number): ProviderError["category"] {
  if (status === 400 || status === 404 || status === 422) return "invalid_input";
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "unavailable";
  return "invalid_response";
}

export function normalizeFalError(cause: unknown): ProviderExecutionError {
  if (cause instanceof ProviderExecutionError) return cause;
  if (cause instanceof H3InputError) {
    return new ProviderExecutionError(
      {
        category: "invalid_input",
        code: cause.message,
        message: "fal request does not satisfy the selected offering contract",
        retryable: false,
        detail: { violations: cause.violations },
      },
      cause,
    );
  }
  if (cause instanceof Error && cause.name === "AbortError") {
    return new ProviderExecutionError(
      {
        category: "cancelled",
        code: "fal.cancelled",
        message: "fal request was cancelled",
        retryable: false,
      },
      cause,
    );
  }
  if (cause instanceof ApiError) {
    const errorCategory = category(cause.status);
    return new ProviderExecutionError(
      {
        category: errorCategory,
        code: `fal.http_${cause.status}`,
        message: cause.message || "fal request failed",
        retryable: ["rate_limit", "timeout", "unavailable"].includes(errorCategory),
        ...(cause.requestId ? { providerRequestId: cause.requestId } : {}),
      },
      cause,
    );
  }
  const error = cause instanceof Error ? cause : new Error("fal request failed");
  if (error.message === "fal.credential_missing") {
    return new ProviderExecutionError(
      {
        category: "auth",
        code: error.message,
        message: "fal credential is not configured",
        retryable: false,
      },
      cause,
    );
  }
  const knownInvalid = [
    "fal.handle_invalid",
    "fal.result_invalid",
    "fal.endpoint_invalid",
    "provider.asset_resolver_unavailable",
  ].includes(error.message);
  return new ProviderExecutionError(
    {
      category: knownInvalid ? "invalid_input" : "unavailable",
      code: knownInvalid ? error.message : "fal.transport_failed",
      message: knownInvalid ? "fal request is invalid" : "fal request failed",
      retryable: !knownInvalid,
    },
    cause,
  );
}
