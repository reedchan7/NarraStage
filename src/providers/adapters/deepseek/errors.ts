import { APICallError } from "@ai-sdk/provider";
import { ZodError } from "zod";
import type { ProviderError } from "@/providers/domain/errors";
import { ProviderExecutionError } from "@/providers/domain/executionError";

export { ProviderExecutionError } from "@/providers/domain/executionError";

function categoryForStatus(statusCode: number | undefined): ProviderError["category"] {
  if (statusCode === 400 || statusCode === 404 || statusCode === 422) return "invalid_input";
  if (statusCode === 401 || statusCode === 403) return "auth";
  if (statusCode === 402) return "billing";
  if (statusCode === 408 || statusCode === 504) return "timeout";
  if (statusCode === 429) return "rate_limit";
  if (statusCode !== undefined && statusCode >= 500) return "unavailable";
  return "invalid_response";
}

function requestId(headers: Record<string, string> | undefined): string | undefined {
  return headers?.["x-request-id"] ?? headers?.["request-id"] ?? headers?.["x-trace-id"];
}

export function normalizeDeepSeekError(cause: unknown): ProviderExecutionError {
  if (cause instanceof ProviderExecutionError) return cause;
  if (cause instanceof ZodError) {
    return new ProviderExecutionError(
      {
        category: "invalid_input",
        code: "deepseek.input_invalid",
        message: "DeepSeek request does not satisfy the declared contract",
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
        code: "deepseek.cancelled",
        message: "DeepSeek request was cancelled",
        retryable: false,
      },
      cause,
    );
  }
  if (APICallError.isInstance(cause)) {
    const category = categoryForStatus(cause.statusCode);
    const providerRequestId = requestId(cause.responseHeaders);
    const retryAfter = cause.responseHeaders?.["retry-after"];
    const retryAfterMs =
      retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : undefined;
    return new ProviderExecutionError(
      {
        category,
        code: `deepseek.http_${cause.statusCode ?? "transport"}`,
        message: cause.message || "DeepSeek request failed",
        retryable: cause.isRetryable || category === "rate_limit" || category === "unavailable",
        ...(providerRequestId ? { providerRequestId } : {}),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      },
      cause,
    );
  }
  const error = cause instanceof Error ? cause : new Error("DeepSeek request failed");
  if (error.message === "deepseek.credential_missing") {
    return new ProviderExecutionError(
      {
        category: "auth",
        code: error.message,
        message: "DeepSeek credential is not configured",
        retryable: false,
      },
      cause,
    );
  }
  if (error.message.startsWith("deepseek.")) {
    const invalidResponse = [
      "deepseek.vision_wire_image_count_mismatch",
      "deepseek.file_reference_missing",
    ].includes(error.message);
    return new ProviderExecutionError(
      {
        category: invalidResponse ? "invalid_response" : "invalid_input",
        code: error.message,
        message: invalidResponse
          ? "DeepSeek returned an invalid response"
          : "DeepSeek request does not satisfy the declared contract",
        retryable: false,
      },
      cause,
    );
  }
  const isTimeout = /timeout/i.test(error.message);
  return new ProviderExecutionError(
    {
      category: isTimeout ? "timeout" : "unavailable",
      code: isTimeout ? "deepseek.timeout" : "deepseek.transport_failed",
      message: isTimeout ? "DeepSeek request timed out" : "DeepSeek request failed",
      retryable: true,
    },
    cause,
  );
}
