import { z } from "zod";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";

export const generationSelectionSchema = z.discriminatedUnion("catalogMode", [
  z.object({ catalogMode: z.literal("custom") }).strict(),
  z
    .object({
      catalogMode: z.literal("builtin"),
      canonicalModelId: z.string().min(1),
      offeringId: z.string().min(1),
      providerId: z.string().min(1),
      preferenceMode: z.enum(["auto", "pinned"]),
    })
    .strict(),
]);

export type GenerationSelection = z.infer<typeof generationSelectionSchema>;

export function generationSelectionColumns(input: GenerationSelection) {
  if (input.catalogMode === "custom") {
    return {
      videoCatalogMode: "custom",
      videoCanonicalModelId: null,
      videoOfferingId: null,
      videoProviderId: null,
      videoOfferingPreferenceMode: null,
    };
  }
  const offering = builtinCatalog.offerings.find((candidate) => candidate.id === input.offeringId);
  if (
    !offering ||
    offering.canonicalModelId !== input.canonicalModelId ||
    offering.providerId !== input.providerId ||
    !offering.operations.some(
      (operation) => operation.operation === "video.generate" && operation.enabled,
    )
  ) {
    throw new Error("project.generation_selection_invalid");
  }
  return {
    videoCatalogMode: "builtin",
    videoCanonicalModelId: input.canonicalModelId,
    videoOfferingId: input.offeringId,
    videoProviderId: input.providerId,
    videoOfferingPreferenceMode: input.preferenceMode,
  };
}
