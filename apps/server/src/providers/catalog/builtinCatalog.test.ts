import { describe, expect, test } from "bun:test";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { ProviderCatalog } from "@/providers/domain/models";

describe("built-in provider catalog", () => {
  test("keeps MiniMax H3 ownership while exposing official and fal offerings", () => {
    const catalog: ProviderCatalog = builtinCatalog;
    const model = catalog.models.find((item) => item.id === "minimax:h3");
    const offerings = catalog.offerings.filter((item) => item.canonicalModelId === "minimax:h3");

    expect(model).toMatchObject({
      id: "minimax:h3",
      owner: "minimax",
      family: "h3",
    });
    expect(offerings).toHaveLength(2);
    expect(offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "minimax:h3:official",
          providerId: "minimax",
          accessChannel: "official",
        }),
        expect.objectContaining({
          id: "minimax:h3:fal",
          providerId: "fal",
          accessChannel: "aggregator",
        }),
      ]),
    );
    expect(
      offerings.find((offering) => offering.id === "minimax:h3:fal")?.operations[0]?.outputProfiles,
    ).toContainEqual({ resolution: "2K", delivery: "upscaled", sourceResolution: "768P" });
    expect(
      offerings.find((offering) => offering.id === "minimax:h3:official")?.operations[0]
        ?.outputProfiles,
    ).toContainEqual({ resolution: "2K", delivery: "native" });
  });
});
