import { describe, expect, test } from "bun:test";
import { LegacyVendorAdapter } from "@/providers/legacy/LegacyVendorAdapter";

describe("trusted-local legacy vendor adapter", () => {
  test("preserves model discovery and operation invocation behind an explicit trust label", async () => {
    const invoked: unknown[] = [];
    const adapter = new LegacyVendorAdapter({
      async listModels(providerId) {
        expect(providerId).toBe("custom");
        return [{ modelName: "org:model:v1", name: "Custom model", type: "image" }];
      },
      async invoke(request) {
        invoked.push(request);
        return "encoded-result";
      },
    });

    expect(adapter.trust).toBe("trusted-local");
    expect(await adapter.listModels("custom")).toEqual([
      {
        legacyId: "custom:org:model:v1",
        providerId: "custom",
        providerModelId: "org:model:v1",
        name: "Custom model",
        type: "image",
      },
    ]);
    expect(
      await adapter.invoke("custom:org:model:v1", "image.generate", {
        prompt: "fixture",
      }),
    ).toBe("encoded-result");
    expect(invoked).toEqual([
      {
        providerId: "custom",
        providerModelId: "org:model:v1",
        operation: "image.generate",
        input: { prompt: "fixture" },
      },
    ]);
  });
});
