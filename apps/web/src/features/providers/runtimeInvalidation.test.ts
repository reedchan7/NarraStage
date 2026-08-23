import { describe, expect, test, vi } from "vitest";
import { notifyProviderRuntimeChanged, onProviderRuntimeChanged } from "@/features/providers/runtimeInvalidation";

describe("provider runtime invalidation", () => {
  test("refreshes mounted consumers after credential state changes and supports disposal", () => {
    const listener = vi.fn();
    const dispose = onProviderRuntimeChanged(listener);

    notifyProviderRuntimeChanged();
    expect(listener).toHaveBeenCalledOnce();

    dispose();
    notifyProviderRuntimeChanged();
    expect(listener).toHaveBeenCalledOnce();
  });
});
