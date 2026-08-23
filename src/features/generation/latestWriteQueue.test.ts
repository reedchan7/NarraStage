import { describe, expect, test, vi } from "vitest";
import { createLatestWriteQueue } from "@/features/generation/latestWriteQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("latest write queue", () => {
  test("serializes writes, coalesces pending values, and never commits a stale response", async () => {
    const first = deferred();
    const writes: string[] = [];
    const commits: string[] = [];
    const queue = createLatestWriteQueue<string>({
      async write(value) {
        writes.push(value);
        if (value === "A") await first.promise;
      },
      onCommitted(value, isLatest) {
        if (isLatest) commits.push(value);
      },
    });

    queue.schedule("A");
    queue.schedule("B");
    queue.schedule("C");
    expect(writes).toEqual(["A"]);

    first.resolve();
    await queue.flush();

    expect(writes).toEqual(["A", "C"]);
    expect(commits).toEqual(["C"]);
  });

  test("continues with the newest value after an earlier write fails", async () => {
    const onError = vi.fn();
    const queue = createLatestWriteQueue<number>({
      write: vi.fn(async (value) => {
        if (value === 1) throw new Error("network");
      }),
      onError,
    });

    queue.schedule(1);
    queue.schedule(2);
    await queue.flush();

    expect(onError).toHaveBeenCalledOnce();
  });
});
