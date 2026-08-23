import { APICallError } from "@ai-sdk/provider";
import { ZodError } from "zod";
import type { ProviderError } from "@/providers/domain/errors";
import { ProviderExecutionError } from "@/providers/domain/executionError";

function categoryForStatus(statusCode: number | undefined): ProviderError["category"] {
  if ([400, 404, 422].includes(statusCode ?? 0)) return "invalid_input";
  if (statusCode === 401 || statusCode === 403) return "auth";
  if (statusCode === 402) return "billing";
  if (statusCode === 408 || statusCode === 504) return "timeout";
  if (statusCode === 429) return "rate_limit";
  if (statusCode !== undefined && statusCode >= 500) return "unavailable";
  return "invalid_response";
}

function statusFromNativeError(cause: unknown): number | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const candidate = cause as { status?: unknown; statusCode?: unknown; code?: unknown };
  for (const value of [candidate.status, candidate.statusCode, candidate.code]) {
    if (typeof value === "number" && value >= 100 && value <= 599) return value;
  }
  return undefined;
}

export function normalizeGoogleError(cause: unknown): ProviderExecutionError {
  if (cause instanceof ProviderExecutionError) return cause;
  if (cause instanceof ZodError) {
    return new ProviderExecutionError(
      {
        category: "invalid_input",
        code: "google.input_invalid",
        message: "Google request does not satisfy the declared contract",
        retryable: false,
        detail: {
          issues: cause.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        },
      },
      cause,
    );
  }
  if (cause instanceof Error && cause.name === "AbortError") {
    return new ProviderExecutionError(
      {
        category: "cancelled",
        code: "google.cancelled",
        message: "Google request was cancelled",
        retryable: false,
      },
      cause,
    );
  }
  if (APICallError.isInstance(cause)) {
    const category = categoryForStatus(cause.statusCode);
    return new ProviderExecutionError(
      {
        category,
        code: `google.http_${cause.statusCode ?? "transport"}`,
        message: cause.message || "Google request failed",
        retryable: cause.isRetryable || ["rate_limit", "timeout", "unavailable"].includes(category),
        ...(cause.responseHeaders?.["x-request-id"]
          ? { providerRequestId: cause.responseHeaders["x-request-id"] }
          : {}),
      },
      cause,
    );
  }
  const error = cause instanceof Error ? cause : new Error("Google request failed");
  if (error.message === "google.credential_missing") {
    return new ProviderExecutionError(
      {
        category: "auth",
        code: error.message,
        message: "Google credential is not configured",
        retryable: false,
      },
      cause,
    );
  }
  if (error.message.startsWith("provider.asset_")) {
    return new ProviderExecutionError(
      {
        category: "invalid_input",
        code: error.message,
        message: "Provider asset cannot be resolved for this request",
        retryable: false,
      },
      cause,
    );
  }
  if (error.message.startsWith("google.")) {
    const invalidResponse =
      error.message.includes("response_") || error.message.includes("output_");
    return new ProviderExecutionError(
      {
        category: invalidResponse ? "invalid_response" : "invalid_input",
        code: error.message,
        message: invalidResponse
          ? "Google returned an invalid response"
          : "Google request is invalid",
        retryable: false,
      },
      cause,
    );
  }
  const status = statusFromNativeError(cause);
  const category = categoryForStatus(status);
  const isTimeout = /timeout/i.test(error.message);
  return new ProviderExecutionError(
    {
      category: isTimeout ? "timeout" : status ? category : "unavailable",
      code: isTimeout
        ? "google.timeout"
        : status
          ? `google.http_${status}`
          : "google.transport_failed",
      message: isTimeout ? "Google request timed out" : "Google request failed",
      retryable:
        isTimeout || !status || ["rate_limit", "timeout", "unavailable"].includes(category),
    },
    cause,
  );
}
