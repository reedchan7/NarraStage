import type { ProviderError } from "@/providers/domain/errors";

export class ProviderExecutionError extends Error {
  readonly providerError: ProviderError;

  constructor(providerError: ProviderError, cause?: unknown) {
    super(providerError.message, { cause });
    this.name = "ProviderExecutionError";
    this.providerError = providerError;
  }
}

export function providerErrorHttpStatus(error: ProviderError): number {
  if (error.category === "auth") return 401;
  if (error.category === "forbidden") return 403;
  if (error.category === "billing") return 402;
  if (error.category === "invalid_input") return 422;
  if (error.category === "rate_limit") return 429;
  if (error.category === "cancelled") return 499;
  if (error.category === "timeout") return 504;
  return 503;
}

export function unexpectedProviderError(cause: unknown): ProviderExecutionError {
  if (cause instanceof ProviderExecutionError) return cause;
  return new ProviderExecutionError(
    {
      category: "unavailable",
      code: "provider.execution_failed",
      message: "Provider execution failed",
      retryable: true,
    },
    cause,
  );
}

export function providerRequestError(
  code: string,
  message: string,
  category: ProviderError["category"] = "invalid_input",
): ProviderExecutionError {
  return new ProviderExecutionError({
    category,
    code,
    message,
    retryable: category === "unavailable" || category === "timeout" || category === "rate_limit",
  });
}
