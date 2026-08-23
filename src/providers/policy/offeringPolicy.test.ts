import { describe, expect, test } from "bun:test";
import { estimateCost, type FxSnapshot } from "@/providers/domain/pricing";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { selectOffering } from "@/providers/policy/offeringPolicy";

const fx: FxSnapshot = {
  baseCurrency: "USD",
  quoteCurrency: "CNY",
  rate: "6.7817",
  sourceUrl: "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do",
  asOf: "2026-08-21",
  expiresAt: "2026-08-25T00:00:00+08:00",
};

function cost(offeringId: string, resolution: string) {
  const price = builtinCatalog.priceSnapshots.find(
    (snapshot) => snapshot.offeringId === offeringId,
  );
  if (!price) throw new Error(`missing price for ${offeringId}`);
  return estimateCost(
    price,
    {
      resolution,
      outputSeconds: 10,
      inputImages: 0,
      referenceVideoSeconds: 0,
      inputAudioSeconds: 0,
    },
    "CNY",
    fx,
    "2026-08-23T00:00:00+08:00",
  );
}

describe("offering policy", () => {
  test("never switches an explicit pin even when another offering is cheaper", () => {
    const result = selectOffering(
      {
        mode: "pinned",
        offeringId: "minimax:h3:official",
      },
      [
        {
          offeringId: "minimax:h3:official",
          eligible: true,
          priority: 10,
          cost: cost("minimax:h3:official", "768P"),
        },
        {
          offeringId: "minimax:h3:fal",
          eligible: true,
          priority: 10,
          cost: cost("minimax:h3:fal", "768P"),
        },
      ],
    );

    expect(result).toEqual({
      status: "selected",
      offeringId: "minimax:h3:official",
      reasonCodes: ["policy.explicit_pin"],
    });
  });

  test("fails the pin instead of silently falling back when it is unavailable", () => {
    const result = selectOffering(
      {
        mode: "pinned",
        offeringId: "minimax:h3:official",
      },
      [
        {
          offeringId: "minimax:h3:official",
          eligible: false,
          rejectionCodes: ["credential.missing"],
          priority: 10,
        },
        {
          offeringId: "minimax:h3:fal",
          eligible: true,
          priority: 10,
          cost: cost("minimax:h3:fal", "768P"),
        },
      ],
    );

    expect(result).toEqual({
      status: "unavailable",
      reasonCodes: ["credential.missing"],
    });
  });

  test("lowest-cost auto policy uses complete request estimates", () => {
    const candidates = ["minimax:h3:official", "minimax:h3:fal"].map((offeringId) => ({
      offeringId,
      eligible: true,
      priority: 10,
      cost: cost(offeringId, "768P"),
    }));

    expect(selectOffering({ mode: "auto", profile: "lowest_cost" }, candidates)).toEqual({
      status: "selected",
      offeringId: "minimax:h3:fal",
      reasonCodes: ["policy.lower_estimated_cost"],
    });
  });

  test("lowest-cost auto policy refuses official native versus fal upscaled quality mismatch", () => {
    const candidates = ["minimax:h3:official", "minimax:h3:fal"].map((offeringId) => ({
      offeringId,
      eligible: true,
      priority: 10,
      cost: cost(offeringId, "2K"),
    }));

    expect(selectOffering({ mode: "auto", profile: "lowest_cost" }, candidates)).toEqual({
      status: "unavailable",
      reasonCodes: ["policy.quality_profile_mismatch"],
    });
  });
});
