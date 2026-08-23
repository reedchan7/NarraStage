import { describe, expect, test } from "bun:test";
import { containsSecretCanary, redactSecrets } from "@/security/credentials/redact";

describe("credential redaction", () => {
  test("redacts nested credential keys without mutating safe fields", () => {
    const input = {
      providerId: "fal",
      apiKey: "redact-canary",
      nested: { authorization: "Bearer redact-canary", endpoint: "https://fal.run" },
    };

    expect(redactSecrets(input)).toEqual({
      providerId: "fal",
      apiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]", endpoint: "https://fal.run" },
    });
    expect(containsSecretCanary(redactSecrets(input), "redact-canary")).toBe(false);
    expect(input.apiKey).toBe("redact-canary");
  });

  test("preserves repeated safe references while still rejecting actual cycles", () => {
    const shared = { endpoint: "https://fal.run" };
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;

    expect(redactSecrets({ first: shared, second: shared, cycle })).toEqual({
      first: shared,
      second: shared,
      cycle: { self: "[CIRCULAR]" },
    });
  });
});
