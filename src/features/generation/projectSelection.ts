import type { ProviderCatalog } from "@/features/models/catalog";
import { createLatestWriteQueue } from "@/features/generation/latestWriteQueue";

export type ProjectGenerationSelection =
  | { catalogMode: "custom" }
  | {
      catalogMode: "builtin";
      canonicalModelId: string;
      offeringId: string;
      providerId: string;
      preferenceMode: "pinned";
    };

export function createProjectSelectionPersistence(options: {
  write: (projectId: number, selection: ProjectGenerationSelection) => Promise<void>;
  currentProjectId: () => number | undefined;
  onCommitted: (selection: ProjectGenerationSelection) => void;
  onError?: (error: unknown) => void;
}) {
  const queue = createLatestWriteQueue<{
    projectId: number;
    selection: ProjectGenerationSelection;
  }>({
    write({ projectId, selection }) {
      return options.write(projectId, selection);
    },
    onCommitted({ projectId, selection }, isLatest) {
      if (isLatest && options.currentProjectId() === projectId) {
        options.onCommitted(selection);
      }
    },
    onError(error, { projectId }, isLatest) {
      if (isLatest && options.currentProjectId() === projectId) {
        options.onError?.(error);
      }
    },
  });

  return {
    schedule(projectId: number, selection: ProjectGenerationSelection) {
      queue.schedule({ projectId, selection });
    },
    flush: queue.flush,
  };
}

export function projectGenerationSelection(input: {
  catalogMode?: boolean;
  canonicalModelId?: string;
  model: string;
  providerId?: string;
}): ProjectGenerationSelection | null {
  if (!input.catalogMode) return { catalogMode: "custom" };
  if (!input.canonicalModelId || !input.model || !input.providerId) return null;
  return {
    catalogMode: "builtin",
    canonicalModelId: input.canonicalModelId,
    offeringId: input.model,
    providerId: input.providerId,
    preferenceMode: "pinned",
  };
}

export function resolvePersistedGenerationSelection(
  project: {
    videoCatalogMode?: "custom" | "builtin" | null;
    videoCanonicalModelId?: string | null;
    videoOfferingId?: string | null;
    videoProviderId?: string | null;
  } | null,
  catalog: ProviderCatalog,
) {
  if (project?.videoCatalogMode !== "builtin" || !project.videoCanonicalModelId || !project.videoOfferingId || !project.videoProviderId) {
    return null;
  }
  const offering = catalog.offerings.find((candidate) => candidate.id === project.videoOfferingId);
  if (
    !offering ||
    offering.canonicalModelId !== project.videoCanonicalModelId ||
    offering.providerId !== project.videoProviderId ||
    !offering.operations.some((operation) => operation.operation === "video.generate" && operation.enabled)
  ) {
    return null;
  }
  return {
    canonicalModelId: offering.canonicalModelId,
    offeringId: offering.id,
    providerId: offering.providerId,
  };
}
