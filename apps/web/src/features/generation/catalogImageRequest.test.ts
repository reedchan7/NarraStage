import { describe, expect, test } from "vitest";
import { buildCatalogImageJobRequest } from "./catalogImageRequest";
import type { CatalogOffering } from "@/features/models/catalog";

const offering = {
  id: "google:nano-banana-2:official",
  canonicalModelId: "google:nano-banana-2",
  providerId: "google",
  providerModelId: "gemini-3.1-flash-image",
  accessChannel: "official",
  lifecycle: "stable",
  operations: [],
  support: { implementation: "implemented", evidence: ["contract_verified"] },
} as CatalogOffering;

describe("buildCatalogImageJobRequest", () => {
  test("routes text generation to the durable asset image consumer", () => {
    expect(
      buildCatalogImageJobRequest({
        offering,
        capabilityInput: { mode: "text", values: { prompt: "A paper boat" }, assets: [] },
        projectId: 3,
        assetId: 9,
        assetType: "scene",
        idempotencyKey: "request-1",
      }),
    ).toMatchObject({
      operation: "image.generate",
      canonicalModelId: "google:nano-banana-2",
      offeringId: "google:nano-banana-2:official",
      consumer: {
        type: "asset_image",
        key: "project:3:asset:9",
        context: { projectId: 3, assetId: 9, assetType: "scene" },
      },
    });
  });

  test("routes owned reference assets to image editing", () => {
    const request = buildCatalogImageJobRequest({
      offering,
      capabilityInput: {
        mode: "reference",
        values: { prompt: "Add rain" },
        assets: [{ assetId: "owned-image", kind: "image", role: "reference_image" }],
      },
      projectId: 3,
      assetId: 9,
      assetType: "scene",
      idempotencyKey: "request-2",
    });
    expect(request.operation).toBe("image.edit");
    expect(request.input.assets[0]).toEqual({ assetId: "owned-image", kind: "image", role: "reference_image" });
  });
});
