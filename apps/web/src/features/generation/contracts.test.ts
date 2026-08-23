import { describe, expect, test } from "vitest";
import {
  buildGenerationRequest,
  extractMediaArtifact,
  idempotencyKeyFor,
} from "@/features/generation/contracts";
import type { CapabilitySchema, Offering } from "@/api/client";

const offering: Offering = {
  id: "fixture:image",
  canonicalModelId: "fixture:image-v1",
  providerId: "fixture",
  providerModelId: "image-v1",
  operations: [{ operation: "image.generate", capabilitySchemaId: "fixture:image", enabled: true }],
  support: { implementation: "implemented", evidence: ["contract_verified"] },
};
const schema: CapabilitySchema = {
  id: "fixture:image",
  operation: "image.generate",
  fields: [
    { path: "prompt", kind: "text", label: "Prompt", required: true },
    {
      path: "aspectRatio",
      kind: "enum",
      label: "Aspect ratio",
      required: true,
      enumValues: ["16:9", "1:1"],
    },
  ],
};

describe("generation request contract", () => {
  test("uses a stable key for identical paid submissions", () => {
    const left = idempotencyKeyFor(7, "image.generate", offering.id, { prompt: "moon harbor" });
    const right = idempotencyKeyFor(7, "image.generate", offering.id, { prompt: "moon harbor" });
    expect(left).toBe(right);
    expect(left.length).toBeGreaterThanOrEqual(8);
    expect(idempotencyKeyFor(7, "image.generate", offering.id, { prompt: "sunrise" })).not.toBe(
      left,
    );
  });

  test("fills declared required defaults without inventing fields", () => {
    expect(
      buildGenerationRequest({
        projectId: 7,
        operation: "image.generate",
        offering,
        schema,
        values: { prompt: "moon harbor" },
      }),
    ).toMatchObject({
      schemaVersion: "2.0.0",
      offeringId: "fixture:image",
      input: { values: { prompt: "moon harbor", aspectRatio: "16:9" }, assets: [] },
    });
  });

  test("finds owned and URL media in normalized provider results", () => {
    expect(
      extractMediaArtifact({
        outputs: [{ kind: "video", url: "/fixture/video.mp4", mimeType: "video/mp4" }],
      }),
    ).toEqual({ kind: "video", url: "/fixture/video.mp4", mimeType: "video/mp4" });
    expect(
      extractMediaArtifact({
        artifacts: [{ kind: "image", assetId: "sha256:abc", mimeType: "image/png" }],
      }),
    ).toEqual({ kind: "image", assetId: "sha256:abc", mimeType: "image/png" });
  });
});
