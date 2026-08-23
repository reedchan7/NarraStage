import { describe, expect, test } from "bun:test";
import {
  projectImageOfferingIdSchema,
  projectImageQualitySchema,
  projectModelIdSchema,
} from "@/routes/project/addProject";
import { generationSelectionColumns } from "@/providers/catalog/generationSelection";

describe("project creation defaults", () => {
  test("accepts consumable provider:model identities and production image qualities", () => {
    expect(projectModelIdSchema.parse("toonflow:doubao-seedream-5.0-Lite")).toBe(
      "toonflow:doubao-seedream-5.0-Lite",
    );
    expect(projectModelIdSchema.parse("toonflow:Kling-Video-O1")).toBe("toonflow:Kling-Video-O1");
    expect(projectImageQualitySchema.parse("1K")).toBe("1K");
  });

  test("rejects empty model identities and the obsolete standard quality", () => {
    expect(projectModelIdSchema.safeParse("").success).toBe(false);
    expect(projectModelIdSchema.safeParse("model-without-provider").success).toBe(false);
    expect(projectImageQualitySchema.safeParse("standard").success).toBe(false);
  });

  test("accepts the React defaults as an exact image offering and structured video pin", () => {
    expect(projectImageOfferingIdSchema.parse("google:nano-banana-2-lite:official")).toBe(
      "google:nano-banana-2-lite:official",
    );
    expect(() => projectImageOfferingIdSchema.parse("toonflow:legacy-image")).toThrow();
    expect(projectModelIdSchema.parse("grsai:nano-banana-2")).toBe("grsai:nano-banana-2");
    expect(
      generationSelectionColumns({
        catalogMode: "builtin",
        canonicalModelId: "minimax:h3",
        offeringId: "minimax:h3:official",
        providerId: "minimax",
        preferenceMode: "pinned",
      }),
    ).toMatchObject({ videoOfferingId: "minimax:h3:official" });
  });
});
