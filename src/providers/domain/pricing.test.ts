import { describe, expect, test } from "bun:test";
import {
  compareCostEstimates,
  estimateCost,
  type FxSnapshot,
  type PriceSnapshot,
} from "@/providers/domain/pricing";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";

const fx: FxSnapshot = {
  baseCurrency: "USD",
  quoteCurrency: "CNY",
  rate: "6.7817",
  sourceUrl: "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do",
  asOf: "2026-08-21",
  expiresAt: "2026-08-25T00:00:00+08:00",
};

function snapshot(id: string): PriceSnapshot {
  const found = builtinCatalog.priceSnapshots.find((item) => item.id === id);
  if (!found) throw new Error(`missing price snapshot ${id}`);
  return found;
}

describe("request-scoped offering prices", () => {
  test("compares native 768P but refuses to equate official 2K with fal's upscaled delivery", () => {
    const official = snapshot("minimax:h3:cn:2026-08-23");
    const fal = snapshot("fal:minimax:h3:public:2026-08-23");
    const baseUsage = {
      outputSeconds: 10,
      inputImages: 0,
      referenceVideoSeconds: 0,
      inputAudioSeconds: 0,
    };

    const official768 = estimateCost(
      official,
      { ...baseUsage, resolution: "768P" },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );
    const fal768 = estimateCost(
      fal,
      { ...baseUsage, resolution: "768P" },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );
    expect(official768.originalTotal).toEqual({ currency: "CNY", amount: "5.00" });
    expect(official768.fx).toBeUndefined();
    expect(fal768.originalTotal).toEqual({ currency: "USD", amount: "0.60" });
    expect(fal768.displayTotal).toEqual({ currency: "CNY", amount: "4.07" });
    expect(fal768.fx).toEqual(fx);
    expect(compareCostEstimates([official768, fal768])).toMatchObject({
      comparable: true,
      cheaperOfferingId: "minimax:h3:fal",
    });

    const official2k = estimateCost(
      official,
      { ...baseUsage, resolution: "2K" },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );
    const fal2k = estimateCost(
      fal,
      { ...baseUsage, resolution: "2K" },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );
    expect(official2k.displayTotal).toEqual({ currency: "CNY", amount: "8.00" });
    expect(fal2k.displayTotal).toEqual({ currency: "CNY", amount: "8.82" });
    expect(compareCostEstimates([official2k, fal2k])).toEqual({
      comparable: false,
      reason: "quality_profile_mismatch",
    });
  });

  test("includes MiniMax extra images and reference-video input cost", () => {
    const estimate = estimateCost(
      snapshot("minimax:h3:cn:2026-08-23"),
      {
        resolution: "768P",
        outputSeconds: 10,
        inputImages: 6,
        referenceVideoSeconds: 3,
        inputAudioSeconds: 5,
      },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );

    expect(estimate.status).toBe("complete");
    expect(estimate.originalTotal).toEqual({ currency: "CNY", amount: "6.70" });
    expect(estimate.components.map((item) => [item.meter, item.amount.amount])).toEqual([
      ["output_video_second", "5.00"],
      ["input_image", "0.20"],
      ["input_reference_video_second", "1.50"],
      ["input_audio_second", "0.00"],
    ]);
  });

  test("does not claim a cheaper route when input pricing or FX is not comparable", () => {
    const falWithReferences = estimateCost(
      snapshot("fal:minimax:h3:public:2026-08-23"),
      {
        resolution: "768P",
        outputSeconds: 10,
        inputImages: 1,
        referenceVideoSeconds: 3,
        inputAudioSeconds: 0,
      },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );
    expect(falWithReferences.status).toBe("incomplete");
    expect(falWithReferences.issues).toContain("price.reference_video_unknown");
    expect(compareCostEstimates([falWithReferences])).toEqual({
      comparable: false,
      reason: "estimate_incomplete",
    });

    const accountComputeSnapshot: PriceSnapshot = {
      id: "fal:account-compute",
      offeringId: "minimax:h3:fal",
      operation: "video.generate",
      currency: "USD",
      pricingModel: "provider_compute",
      rates: [
        {
          meter: "provider_compute_second",
          unitPrice: "0.00017",
        },
      ],
      coverage: {
        inputImage: "unknown",
        referenceVideo: "unknown",
        inputAudio: "unknown",
      },
      sourceUrl: "https://api.fal.ai/v1/models/pricing",
      sourceScope: "account",
      asOf: "2026-08-23",
      expiresAt: "2026-08-24T00:00:00+08:00",
    };
    const accountEstimate = estimateCost(
      accountComputeSnapshot,
      {
        resolution: "768P",
        outputSeconds: 10,
        inputImages: 0,
        referenceVideoSeconds: 0,
        inputAudioSeconds: 0,
      },
      "CNY",
      fx,
      "2026-08-23T00:00:00+08:00",
    );
    expect(accountEstimate.status).toBe("incomplete");
    expect(accountEstimate.issues).toContain("price.compute_conversion_unknown");
  });

  test("marks an otherwise calculable conversion incomparable when FX is stale", () => {
    const estimate = estimateCost(
      snapshot("fal:minimax:h3:public:2026-08-23"),
      {
        resolution: "768P",
        outputSeconds: 10,
        inputImages: 0,
        referenceVideoSeconds: 0,
        inputAudioSeconds: 0,
      },
      "CNY",
      fx,
      "2026-08-26T00:00:00+08:00",
    );

    expect(estimate.status).toBe("incomplete");
    expect(estimate.issues).toContain("price.fx_stale");
    expect(compareCostEstimates([estimate])).toEqual({
      comparable: false,
      reason: "estimate_incomplete",
    });
  });
});
