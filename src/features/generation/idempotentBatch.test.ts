import { beforeEach, describe, expect, test } from "vitest";
import { clearPendingIdempotencyKey, getPendingIdempotencyKey, logicalActionScope } from "@/features/generation/idempotency";
import { runIdempotentBatch } from "@/features/generation/idempotentBatch";

describe("idempotent batch retries", () => {
  beforeEach(() => sessionStorage.clear());

  test("does not pay for an already accepted item again after a later item fails", async () => {
    const providerCreates = new Set<string>();
    let failB = true;
    const submit = async (item: string) => {
      const scope = logicalActionScope("batch-item", { item });
      const key = getPendingIdempotencyKey(scope);
      if (item === "B" && failB) throw new Error("transient");
      providerCreates.add(key);
      return scope;
    };

    await expect(runIdempotentBatch(["A", "B"], submit, clearPendingIdempotencyKey)).rejects.toThrow("transient");
    expect(providerCreates.size).toBe(1);

    failB = false;
    await runIdempotentBatch(["A", "B"], submit, clearPendingIdempotencyKey);
    expect(providerCreates.size).toBe(2);
  });
});
