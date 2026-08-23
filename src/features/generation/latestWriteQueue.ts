export function createLatestWriteQueue<T>(options: {
  write: (value: T) => Promise<void>;
  onCommitted?: (value: T, isLatest: boolean) => void;
  onError?: (error: unknown, value: T, isLatest: boolean) => void;
}) {
  let pending: T | undefined;
  let drainPromise: Promise<void> | undefined;

  async function drain() {
    while (pending !== undefined) {
      const value = pending;
      pending = undefined;
      try {
        await options.write(value);
        options.onCommitted?.(value, pending === undefined);
      } catch (error) {
        options.onError?.(error, value, pending === undefined);
      }
    }
  }

  function schedule(value: T) {
    pending = value;
    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = undefined;
      });
    }
  }

  async function flush() {
    while (drainPromise) await drainPromise;
  }

  return { schedule, flush };
}
