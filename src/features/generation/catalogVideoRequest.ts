import type { SubmitGenerationJobRequest } from "@/features/generation/jobStore";
import type { CapabilityInput, CatalogOffering } from "@/features/models/catalog";

export function buildCatalogVideoJobRequest(input: {
  offering: CatalogOffering;
  capabilityInput: CapabilityInput;
  projectId: number;
  scriptId: number;
  trackId: number;
  idempotencyKey: string;
  continuationParentJobId?: string;
}): SubmitGenerationJobRequest {
  return {
    schemaVersion: "2.0.0",
    idempotencyKey: input.idempotencyKey,
    canonicalModelId: input.offering.canonicalModelId,
    offeringId: input.offering.id,
    operation: "video.generate",
    input: input.capabilityInput,
    ...(input.continuationParentJobId ? { continuation: { parentJobId: input.continuationParentJobId } } : {}),
    consumer: {
      type: "workbench",
      key: `project:${input.projectId}:script:${input.scriptId}:track:${input.trackId}`,
      context: {
        projectId: input.projectId,
        scriptId: input.scriptId,
        trackId: input.trackId,
      },
    },
  };
}
