import { describe, expect, test } from "vitest";
import {
  createProjectSelectionPersistence,
  projectGenerationSelection,
  resolvePersistedGenerationSelection,
} from "@/features/generation/projectSelection";
import type { ProviderCatalog } from "@/features/models/catalog";

const catalog = {
  offerings: [
    {
      id: "minimax:h3:fal",
      canonicalModelId: "minimax:h3",
      providerId: "fal",
      operations: [{ operation: "video.generate", enabled: true }],
    },
  ],
} as ProviderCatalog;

describe("project generation selection", () => {
  test("serializes an explicit offering pin and restores it after reload", () => {
    expect(
      projectGenerationSelection({
        catalogMode: true,
        canonicalModelId: "minimax:h3",
        model: "minimax:h3:fal",
        providerId: "fal",
      }),
    ).toEqual({
      catalogMode: "builtin",
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
      preferenceMode: "pinned",
    });
    expect(
      resolvePersistedGenerationSelection(
        {
          videoCatalogMode: "builtin",
          videoCanonicalModelId: "minimax:h3",
          videoOfferingId: "minimax:h3:fal",
          videoProviderId: "fal",
        },
        catalog,
      ),
    ).toEqual({
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
    });
  });

  test("fails closed when the persisted provider identity no longer matches the catalog", () => {
    expect(
      resolvePersistedGenerationSelection(
        {
          videoCatalogMode: "builtin",
          videoCanonicalModelId: "minimax:h3",
          videoOfferingId: "minimax:h3:fal",
          videoProviderId: "minimax",
        },
        catalog,
      ),
    ).toBeNull();
  });

  test("keeps queued selections bound to the project captured at schedule time", async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let currentProjectId = 1;
    const writes: Array<{ projectId: number; selection: ProjectGenerationSelection }> = [];
    const committed: ProjectGenerationSelection[] = [];
    const persistence = createProjectSelectionPersistence({
      async write(projectId, selection) {
        writes.push({ projectId, selection });
        if (writes.length === 1) await firstWrite;
      },
      currentProjectId: () => currentProjectId,
      onCommitted: (selection) => committed.push(selection),
    });
    const first: ProjectGenerationSelection = { catalogMode: "custom" };
    const pending: ProjectGenerationSelection = {
      catalogMode: "builtin",
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
      preferenceMode: "pinned",
    };

    persistence.schedule(1, first);
    persistence.schedule(1, pending);
    currentProjectId = 2;
    releaseFirst();
    await persistence.flush();

    expect(writes.map(({ projectId }) => projectId)).toEqual([1, 1]);
    expect(committed).toEqual([]);
  });
});
