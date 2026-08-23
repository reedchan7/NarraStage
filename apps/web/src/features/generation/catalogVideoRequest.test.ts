import { describe, expect, test } from "vitest";
import { buildCatalogVideoJobRequest } from "./catalogVideoRequest";
import type { CatalogOffering } from "@/features/models/catalog";

const offering = {
  id: "google:gemini-omni-flash:official",
  canonicalModelId: "google:gemini-omni-flash",
  providerId: "google",
  providerModelId: "gemini-omni-flash-preview",
  accessChannel: "official",
  lifecycle: "preview",
  operations: [],
  support: { implementation: "implemented", evidence: ["contract_verified"] },
} as CatalogOffering;

describe("buildCatalogVideoJobRequest", () => {
  test("preserves continuation lineage for a stateful video edit", () => {
    expect(
      buildCatalogVideoJobRequest({
        offering,
        capabilityInput: {
          mode: "edit",
          values: { prompt: String(1) },
          assets: [],
        },
        projectId: 3,
        scriptId: 7,
        trackId: 11,
        idempotencyKey: "request-1",
        continuationParentJobId: "parent-job",
      }),
    ).toMatchObject({
      operation: "video.generate",
      continuation: { parentJobId: "parent-job" },
      consumer: {
        type: "workbench",
        key: "project:3:script:7:track:11",
        context: { projectId: 3, scriptId: 7, trackId: 11 },
      },
    });
  });
});
