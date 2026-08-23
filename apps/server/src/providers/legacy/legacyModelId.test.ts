import { describe, expect, test } from "bun:test";
import { decodeLegacyModelId, encodeLegacyModelId } from "@/providers/legacy/legacyModelId";

describe("legacy model ID codec", () => {
  test("splits only the first separator and round-trips provider:model IDs", () => {
    const structured = decodeLegacyModelId("custom:org:model:v1");

    expect(structured).toEqual({
      providerId: "custom",
      providerModelId: "org:model:v1",
    });
    expect(encodeLegacyModelId(structured)).toBe("custom:org:model:v1");
  });

  test("rejects malformed legacy IDs instead of guessing", () => {
    expect(() => decodeLegacyModelId("missing-separator")).toThrow(/invalid legacy model ID/);
    expect(() => decodeLegacyModelId(":missing-provider")).toThrow(/invalid legacy model ID/);
  });
});
