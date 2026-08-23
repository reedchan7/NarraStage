const secretKeyPattern = /^(?:api[_-]?key|authorization|credential|password|secret|token)$/i;

export function redactSecrets<T>(value: T): T {
  const ancestors = new WeakSet<object>();
  const visit = (candidate: unknown): unknown => {
    if (!candidate || typeof candidate !== "object") return candidate;
    if (ancestors.has(candidate)) return "[CIRCULAR]";
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) return candidate.map(visit);
      return Object.fromEntries(
        Object.entries(candidate).map(([key, entry]) => [
          key,
          secretKeyPattern.test(key) ? "[REDACTED]" : visit(entry),
        ]),
      );
    } finally {
      ancestors.delete(candidate);
    }
  };
  return visit(value) as T;
}

export function containsSecretCanary(value: unknown, canary: string): boolean {
  return JSON.stringify(value).includes(canary);
}
