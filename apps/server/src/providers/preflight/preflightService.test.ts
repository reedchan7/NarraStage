import { describe, expect, test } from "bun:test";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { preflightRequest } from "@/providers/preflight/preflightService";

describe("provider preflight", () => {
  test("returns the same H3 role violation for official and fal offerings", () => {
    const result = preflightRequest(
      {
        schemaVersion: "2.0.0",
        canonicalModelId: "minimax:h3",
        operation: "video.generate",
        input: {
          mode: "keyframes",
          values: {
            prompt: "A paper boat crosses a pond",
            durationSeconds: 8,
            resolution: "768P",
          },
          assets: [{ assetId: "last", kind: "image", role: "last_frame" }],
        },
        offeringPreference: {
          mode: "pinned",
          offeringId: "minimax:h3:official",
        },
        displayCurrency: "CNY",
      },
      {
        catalog: builtinCatalog,
        at: "2026-08-23T00:00:00+08:00",
      },
    );

    expect(result.offerings).toHaveLength(2);
    expect(result.offerings.map((offering) => offering.violations)).toEqual([
      [
        {
          code: "capability.asset_role_minimum",
          path: "assets.first_frame",
          message: "first_frame requires at least 1 asset",
        },
      ],
      [
        {
          code: "capability.asset_role_minimum",
          path: "assets.first_frame",
          message: "first_frame requires at least 1 asset",
        },
      ],
    ]);
    expect(result.selection).toEqual({
      status: "unavailable",
      reasonCodes: ["capability.asset_role_minimum"],
    });
  });

  test("auto lowest-cost selects fal for a complete 768P text request", () => {
    const result = preflightRequest(
      {
        schemaVersion: "2.0.0",
        canonicalModelId: "minimax:h3",
        operation: "video.generate",
        input: {
          mode: "text",
          values: {
            prompt: "A paper boat crosses a pond",
            durationSeconds: 10,
            resolution: "768P",
            aspectRatio: "16:9",
          },
          assets: [],
        },
        offeringPreference: {
          mode: "auto",
          profile: "lowest_cost",
        },
        displayCurrency: "CNY",
      },
      {
        catalog: builtinCatalog,
        at: "2026-08-23T00:00:00+08:00",
      },
    );

    expect(result.selection).toEqual({
      status: "selected",
      offeringId: "minimax:h3:fal",
      reasonCodes: ["policy.lower_estimated_cost"],
    });
    expect(result.offerings.map((offering) => offering.cost?.displayTotal)).toEqual([
      { currency: "CNY", amount: "5.00" },
      { currency: "CNY", amount: "4.07" },
    ]);
  });

  test("does not auto-route between official native and fal upscaled 2K as if quality were equal", () => {
    const result = preflightRequest(
      {
        schemaVersion: "2.0.0",
        canonicalModelId: "minimax:h3",
        operation: "video.generate",
        input: {
          mode: "text",
          values: {
            prompt: "A paper boat crosses a pond",
            durationSeconds: 10,
            resolution: "2K",
            aspectRatio: "16:9",
          },
          assets: [],
        },
        offeringPreference: { mode: "auto", profile: "lowest_cost" },
        displayCurrency: "CNY",
      },
      { catalog: builtinCatalog, at: "2026-08-23T00:00:00+08:00" },
    );

    expect(result.selection).toEqual({
      status: "unavailable",
      reasonCodes: ["policy.quality_profile_mismatch"],
    });
  });

  test("keeps runtime unavailability distinct from capability support", () => {
    const result = preflightRequest(
      {
        schemaVersion: "2.0.0",
        canonicalModelId: "minimax:h3",
        operation: "video.generate",
        input: {
          mode: "text",
          values: {
            prompt: "Boat",
            durationSeconds: 5,
            resolution: "768P",
            aspectRatio: "16:9",
          },
          assets: [],
        },
        offeringPreference: { mode: "pinned", offeringId: "minimax:h3:fal" },
        displayCurrency: "CNY",
      },
      {
        catalog: builtinCatalog,
        at: "2026-08-23T00:00:00+08:00",
        availability: new Map([
          [
            "minimax:h3:fal:video.generate",
            { available: false, reasonCodes: ["credential.missing"] },
          ],
        ]),
      },
    );

    expect(result.offerings.find((item) => item.offeringId === "minimax:h3:fal")).toMatchObject({
      eligible: false,
      violations: [expect.objectContaining({ code: "credential.missing" })],
    });
  });
});
