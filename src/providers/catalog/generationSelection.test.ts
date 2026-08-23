import { describe, expect, test } from "bun:test";
import {
  generationSelectionColumns,
  generationSelectionSchema,
} from "@/providers/catalog/generationSelection";

describe("generation selection persistence", () => {
  test("persists a structured offering pin", () => {
    const input = generationSelectionSchema.parse({
      catalogMode: "builtin",
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
      preferenceMode: "pinned",
    });
    expect(generationSelectionColumns(input)).toEqual({
      videoCatalogMode: "builtin",
      videoCanonicalModelId: "minimax:h3",
      videoOfferingId: "minimax:h3:fal",
      videoProviderId: "fal",
      videoOfferingPreferenceMode: "pinned",
    });
  });

  test("rejects mismatched or non-video catalog identities", () => {
    expect(() =>
      generationSelectionColumns({
        catalogMode: "builtin",
        canonicalModelId: "minimax:h3",
        offeringId: "minimax:h3:fal",
        providerId: "minimax",
        preferenceMode: "pinned",
      }),
    ).toThrow("project.generation_selection_invalid");
  });
});
