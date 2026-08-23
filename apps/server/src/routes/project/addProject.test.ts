import { describe, expect, test } from "bun:test";
import { projectImageQualitySchema, projectModelIdSchema } from "@/routes/project/addProject";

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
});
