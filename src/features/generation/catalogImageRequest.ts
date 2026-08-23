import type { SubmitGenerationJobRequest } from "@/features/generation/jobStore";
import type { CapabilityInput, CatalogOffering } from "@/features/models/catalog";

export function buildCatalogImageJobRequest(input: {
  offering: CatalogOffering;
  capabilityInput: CapabilityInput;
  projectId: number;
  assetId: number;
  assetType: "role" | "scene" | "tool";
  idempotencyKey: string;
}): SubmitGenerationJobRequest {
  const operation = input.capabilityInput.assets.length ? "image.edit" : "image.generate";
  return {
    schemaVersion: "2.0.0",
    idempotencyKey: input.idempotencyKey,
    canonicalModelId: input.offering.canonicalModelId,
    offeringId: input.offering.id,
    operation,
    input: input.capabilityInput,
    consumer: {
      type: "asset_image",
      key: `project:${input.projectId}:asset:${input.assetId}`,
      context: {
        projectId: input.projectId,
        assetId: input.assetId,
        assetType: input.assetType,
      },
    },
  };
}
