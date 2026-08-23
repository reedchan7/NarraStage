import { describe, expect, test } from "vitest";
import {
  assetModeViolation,
  buildGenerationRequest,
  configuredProjectOffering,
  extractMediaArtifact,
  idempotencyKeyFor,
  normalizeCapabilityValues,
} from "@/features/generation/contracts";
import type { CapabilitySchema, Offering } from "@/api/client";

const offering: Offering = {
  id: "fixture:image",
  canonicalModelId: "fixture:image-v1",
  accessChannel: "official",
  lifecycle: "stable",
  providerId: "fixture",
  providerModelId: "image-v1",
  operations: [{ operation: "image.generate", capabilitySchemaId: "fixture:image", enabled: true }],
  support: { implementation: "implemented", evidence: ["contract_verified"] },
};
const schema: CapabilitySchema = {
  id: "fixture:image",
  schemaVersion: "1.0.0",
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

  test("prefers structured video pins and exact image model identities from the project", () => {
    const project = {
      id: 7,
      name: "Fixture",
      intro: null,
      type: null,
      artStyle: null,
      videoRatio: "16:9",
      projectType: "animation",
      imageModel: "google:nano-banana-2-lite:official",
      videoModel: "toonflow:Kling-Video-O1",
      videoOfferingId: "minimax:h3:official",
    };
    expect(configuredProjectOffering(project, "image.generate")).toBe(
      "google:nano-banana-2-lite:official",
    );
    expect(configuredProjectOffering(project, "video.generate")).toBe("minimax:h3:official");
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

  test("preserves selected asset modes and binds assets into the paid idempotency key", () => {
    const keyframeMode = {
      id: "keyframes",
      label: "Keyframes",
      roles: [
        { role: "first_frame", kinds: ["image" as const], minimum: 1, maximum: 1 },
        { role: "last_frame", kinds: ["image" as const], minimum: 0, maximum: 1 },
      ],
      minimumTotalAssets: 1,
      maximumTotalAssets: 2,
    };
    const assets = [
      { assetId: `sha256:${"a".repeat(64)}`, kind: "image" as const, role: "first_frame" },
    ];
    expect(assetModeViolation(keyframeMode, assets)).toBeNull();
    expect(assetModeViolation(keyframeMode, [])).toContain("至少需要");

    const request = buildGenerationRequest({
      projectId: 7,
      operation: "image.generate",
      offering,
      schema,
      values: { prompt: "moon harbor" },
      mode: "keyframes",
      assets,
    });
    expect(request.input).toMatchObject({ mode: "keyframes", assets });
    expect(request.idempotencyKey).not.toBe(
      idempotencyKeyFor(7, "image.generate", offering.id, {
        prompt: "moon harbor",
        aspectRatio: "16:9",
      }),
    );
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

  test("materializes discrete integer and conditional capability constraints", () => {
    const videoSchema: CapabilitySchema = {
      id: "fixture:video",
      schemaVersion: "1.0.0",
      operation: "video.generate",
      fields: [
        { path: "prompt", kind: "text", label: "Prompt", required: true },
        {
          path: "durationSeconds",
          kind: "integer",
          label: "Duration",
          required: true,
          allowedValues: [4, 6, 8],
        },
        {
          path: "resolution",
          kind: "enum",
          label: "Resolution",
          required: true,
          enumValues: ["720P", "1080P"],
        },
        { path: "seed", kind: "integer", label: "Seed", required: false, advanced: true },
        {
          path: "enableSafetyChecker",
          kind: "boolean",
          label: "Safety",
          required: false,
          advanced: true,
        },
      ],
      assetModes: [
        { id: "text", label: "Text", roles: [], maximumTotalAssets: 0 },
        {
          id: "reference",
          label: "Reference",
          roles: [{ role: "reference_image", kinds: ["image"], minimum: 1, maximum: 3 }],
          minimumTotalAssets: 1,
          maximumTotalAssets: 3,
          fieldRules: [{ path: "durationSeconds", allowedValues: [8] }],
        },
      ],
      valueConstraints: [
        {
          when: { path: "resolution", values: ["1080P"] },
          require: [{ path: "durationSeconds", allowedValues: [8] }],
        },
      ],
    };
    const textMode = videoSchema.assetModes![0];
    const defaults = normalizeCapabilityValues(videoSchema, textMode, { prompt: "harbor" });
    expect(defaults).toMatchObject({ durationSeconds: 4, resolution: "720P" });
    expect(defaults.seed).toBeUndefined();
    expect(defaults.enableSafetyChecker).toBeUndefined();

    const highResolution = normalizeCapabilityValues(videoSchema, textMode, {
      ...defaults,
      resolution: "1080P",
    });
    expect(highResolution.durationSeconds).toBe(8);
    const reference = normalizeCapabilityValues(videoSchema, videoSchema.assetModes![1], defaults);
    expect(reference.durationSeconds).toBe(8);

    const request = buildGenerationRequest({
      projectId: 7,
      operation: "video.generate",
      offering: { ...offering, operations: [], id: "fixture:video" },
      schema: videoSchema,
      values: defaults,
      mode: "text",
    });
    expect(request.input.values).not.toHaveProperty("seed");
    expect(request.input.values).not.toHaveProperty("enableSafetyChecker");
  });
});
