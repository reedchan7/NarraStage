import { describe, expect, test } from "bun:test";
import { nextPollDelay } from "@/generation/backoff";

describe("generation poll backoff", () => {
  test("uses bounded jitter and clamps provider hints", () => {
    const policy = { baseMs: 1_000, maxMs: 10_000, maxAttempts: 4 };
    expect(nextPollDelay(0, policy, () => 0)).toBe(1_000);
    expect(nextPollDelay(3, policy, () => 0.5)).toBe(4_000);
    expect(nextPollDelay(3, policy, () => 1)).toBe(8_000);
    expect(nextPollDelay(1, policy, () => 0, 200)).toBe(1_000);
    expect(nextPollDelay(1, policy, () => 0, 20_000)).toBe(10_000);
    expect(() => nextPollDelay(4, policy)).toThrow("generation.retry_budget_exhausted");
  });
});
