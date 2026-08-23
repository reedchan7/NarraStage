import { describe, expect, test } from "vitest";
import { normalizeCapabilityInput } from "./capabilityInput";
import type { CatalogCapability } from "@/features/models/catalog";

const capability: CatalogCapability = {
  id: "google:image:generate:v1",
  schemaVersion: "1.0.0",
  operation: "image.generate",
  fields: [
    { path: "prompt", kind: "text", label: "Prompt", required: true },
    { path: "imageSize", kind: "enum", label: "Size", required: false, enumValues: ["1K", "2K"] },
    { path: "copies", kind: "integer", label: "Copies", required: false, minimum: 1, maximum: 4 },
    { path: "durationSeconds", kind: "integer", label: "Duration", required: false, allowedValues: [4, 6, 8] },
    { path: "grounding", kind: "boolean", label: "Grounding", required: false },
  ],
  assetModes: [{ id: "text", label: "Text", roles: [], maximumTotalAssets: 0 }],
};

describe("normalizeCapabilityInput", () => {
  test("keeps only declared fields and applies catalog defaults and bounds", () => {
    expect(
      normalizeCapabilityInput(capability, {
        mode: "missing",
        values: { prompt: "A paper boat", imageSize: "8K", copies: 9, durationSeconds: 5, stale: true },
        assets: [{ assetId: "old", kind: "image", role: "reference_image" }],
      }),
    ).toEqual({
      mode: "text",
      values: { prompt: "A paper boat", imageSize: "1K", copies: 4, durationSeconds: 4, grounding: false },
      assets: [],
    });
  });
});
