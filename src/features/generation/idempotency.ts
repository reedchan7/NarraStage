import { v7 as uuidv7 } from "uuid";

const prefix = "toonflow:idempotency:";
const maximumAgeMs = 24 * 60 * 60 * 1_000;
const memoryEntries = new Map<string, { key: string; createdAt: number }>();

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function logicalActionScope(prefixValue: string, payload: unknown): string {
  return `${prefixValue}:${fingerprint(stableJson(payload))}`;
}

export function getPendingIdempotencyKey(scope: string): string {
  const storageKey = `${prefix}${scope}`;
  const memoryEntry = memoryEntries.get(storageKey);
  if (memoryEntry && Date.now() - memoryEntry.createdAt <= maximumAgeMs) {
    return memoryEntry.key;
  }
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as { key?: unknown; createdAt?: unknown };
      if (typeof parsed.key === "string" && typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt <= maximumAgeMs) {
        memoryEntries.set(storageKey, { key: parsed.key, createdAt: parsed.createdAt });
        return parsed.key;
      }
    }
    const key = uuidv7();
    const entry = { key, createdAt: Date.now() };
    memoryEntries.set(storageKey, entry);
    sessionStorage.setItem(storageKey, JSON.stringify(entry));
    return key;
  } catch {
    const key = uuidv7();
    memoryEntries.set(storageKey, { key, createdAt: Date.now() });
    return key;
  }
}

export function clearPendingIdempotencyKey(scope: string): void {
  memoryEntries.delete(`${prefix}${scope}`);
  try {
    sessionStorage.removeItem(`${prefix}${scope}`);
  } catch {}
}
