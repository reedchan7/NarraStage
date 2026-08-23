import { describe, expect, test } from "bun:test";
import { validateCapabilityInput } from "@/providers/domain/capabilities";
import { h3CapabilityFixtures } from "@/contracts/v2/fixtures";
import { builtinCapabilitySchemas } from "@/providers/catalog/builtinCatalog";

describe("declarative capability validation", () => {
  test("returns stable violations for an invalid H3 keyframe role combination", () => {
    const result = validateCapabilityInput(h3CapabilityFixtures.official, {
      mode: "keyframes",
      values: {
        prompt: "A paper boat crosses a pond",
        durationSeconds: 8,
        resolution: "768P",
      },
      assets: [{ assetId: "asset-last", kind: "image", role: "last_frame" }],
    });

    expect(result.violations).toEqual([
      {
        code: "capability.asset_role_minimum",
        path: "assets.first_frame",
        message: "first_frame requires at least 1 asset",
      },
    ]);
  });

  test("accepts the equivalent valid H3 keyframe request", () => {
    const result = validateCapabilityInput(h3CapabilityFixtures.official, {
      mode: "keyframes",
      values: {
        prompt: "A paper boat crosses a pond",
        durationSeconds: 8,
        resolution: "768P",
      },
      assets: [{ assetId: "asset-first", kind: "image", role: "first_frame" }],
    });

    expect(result).toEqual({ violations: [], warnings: [] });
  });

  test("enforces Veo sparse durations and mode/resolution combinations before submission", () => {
    const capability = builtinCapabilitySchemas.find(
      (candidate) => candidate.id === "google:veo-3.1:v1",
    )!;
    const input = (mode: string, durationSeconds: number, resolution: string) => ({
      mode,
      values: {
        prompt: "A paper boat crosses a pond",
        durationSeconds,
        resolution,
        aspectRatio: "16:9",
      },
      assets:
        mode === "reference"
          ? [{ assetId: "reference", kind: "image" as const, role: "reference_image" }]
          : mode === "extend"
            ? [{ assetId: "source", kind: "video" as const, role: "source_video" }]
            : [],
    });

    expect(validateCapabilityInput(capability, input("text", 4, "720P")).violations).toEqual([]);
    expect(validateCapabilityInput(capability, input("text", 6, "720P")).violations).toEqual([]);
    expect(validateCapabilityInput(capability, input("text", 8, "4K")).violations).toEqual([]);
    for (const duration of [5, 7]) {
      expect(
        validateCapabilityInput(capability, input("text", duration, "720P")).violations,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "capability.field_allowed_value" }),
        ]),
      );
    }
    expect(validateCapabilityInput(capability, input("text", 4, "1080P")).violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "capability.field_constraint" })]),
    );
    expect(validateCapabilityInput(capability, input("reference", 6, "720P")).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "capability.field_allowed_value_for_mode" }),
      ]),
    );
    expect(validateCapabilityInput(capability, input("extend", 8, "1080P")).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "capability.field_allowed_value_for_mode" }),
      ]),
    );
  });
});
