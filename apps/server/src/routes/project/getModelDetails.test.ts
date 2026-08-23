import { describe, expect, test } from "bun:test";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { agentModelDetailsForOffering } from "@/routes/project/getModelDetails";

describe("agent model details", () => {
  test("exposes the complete Gemini multimodal and grounding contract", () => {
    const offering = builtinCatalog.offerings.find(
      (candidate) => candidate.id === "google:gemini-3.7-flash:official",
    );
    if (!offering) throw new Error("test offering missing");
    const details = agentModelDetailsForOffering(offering);
    expect(details.acceptsAttachments).toBe(true);
    expect(details.supportedMediaTypes).toContain("image/png");
    expect(details.supportedMediaTypes).toContain("video/mp4");
    expect(details.supportedMediaTypes).toContain("audio/mpeg");
    expect(details.supportedMediaTypes).toContain("application/pdf");
    expect(details.supportsGrounding).toBe(true);
    expect(details.filesUpload).toBe(true);
    expect(details.available).toBe(true);
  });

  test("does not overstate DeepSeek vision media or grounding support", () => {
    const offering = builtinCatalog.offerings.find(
      (candidate) => candidate.id === "deepseek:v4-flash-vision-exp:official",
    );
    if (!offering) throw new Error("test offering missing");
    const details = agentModelDetailsForOffering(offering);
    expect(details.supportedMediaTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ]);
    expect(details.supportsGrounding).toBe(false);
  });

  test("can fail closed when runtime availability is missing", () => {
    const offering = builtinCatalog.offerings.find(
      (candidate) => candidate.id === "google:gemini-3.7-flash:official",
    );
    if (!offering) throw new Error("test offering missing");
    expect(agentModelDetailsForOffering(offering, false).available).toBe(false);
  });
});
