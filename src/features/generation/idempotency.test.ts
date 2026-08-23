import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clearPendingIdempotencyKey, getPendingIdempotencyKey, logicalActionScope } from "@/features/generation/idempotency";

describe("generation idempotency", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  test("reuses a UUIDv7 for the same unfinished logical action", () => {
    const scope = logicalActionScope("video", { trackId: 7, prompt: "Boat" });
    const first = getPendingIdempotencyKey(scope);
    expect(getPendingIdempotencyKey(scope)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    clearPendingIdempotencyKey(scope);
    expect(getPendingIdempotencyKey(scope)).not.toBe(first);
  });

  test("separates requests when their stable logical payload changes", () => {
    expect(logicalActionScope("video", { prompt: "A", trackId: 1 })).not.toBe(logicalActionScope("video", { prompt: "B", trackId: 1 }));
    expect(logicalActionScope("video", { prompt: "A", trackId: 1 })).toBe(logicalActionScope("video", { trackId: 1, prompt: "A" }));
  });

  test("keeps the same pending key when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage disabled");
    });
    const scope = logicalActionScope("restricted-storage", { projectId: 7 });

    const first = getPendingIdempotencyKey(scope);
    expect(getPendingIdempotencyKey(scope)).toBe(first);

    clearPendingIdempotencyKey(scope);
    expect(getPendingIdempotencyKey(scope)).not.toBe(first);
  });
});
