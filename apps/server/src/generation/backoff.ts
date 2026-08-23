export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
}

export const defaultPollBackoff: BackoffPolicy = {
  baseMs: 1_000,
  maxMs: 60_000,
  maxAttempts: 120,
};

export function nextPollDelay(
  attempt: number,
  policy: BackoffPolicy = defaultPollBackoff,
  random: () => number = Math.random,
  providerHintMs?: number,
): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("generation.invalid_attempt");
  if (attempt >= policy.maxAttempts) throw new Error("generation.retry_budget_exhausted");
  if (providerHintMs !== undefined) {
    return Math.min(policy.maxMs, Math.max(policy.baseMs, Math.floor(providerHintMs)));
  }
  const ceiling = Math.min(policy.maxMs, policy.baseMs * 2 ** attempt);
  return Math.max(policy.baseMs, Math.floor(random() * ceiling));
}
