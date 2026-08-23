import type { Knex } from "knex";
import type { MediaAssetRepository, OwnedMediaAsset } from "@/assets/mediaAssetRepository";
import type { MediaKind } from "@/providers/domain/capabilities";

export interface WorkbenchAssetReference {
  source: "assets" | "storyboard";
  id: number;
  kind: MediaKind;
  role: string;
  durationSeconds?: number;
}

export interface IngestedWorkbenchAsset {
  assetId: string;
  kind: MediaKind;
  role: string;
  durationSeconds?: number;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

interface SourceRow {
  filePath?: string | null;
  projectId?: number | null;
}

export class WorkbenchAssetIngestService {
  readonly #database: Knex;
  readonly #repository: MediaAssetRepository;
  readonly #readFile: (path: string) => Promise<Buffer>;

  constructor(input: {
    database: Knex;
    repository: MediaAssetRepository;
    readFile(path: string): Promise<Buffer>;
  }) {
    this.#database = input.database;
    this.#repository = input.repository;
    this.#readFile = input.readFile;
  }

  async ingest(input: {
    principalId: string;
    projectId: number;
    items: WorkbenchAssetReference[];
  }): Promise<IngestedWorkbenchAsset[]> {
    if (input.items.length > 12) throw new Error("asset.maximum_items_exceeded");
    const seen = new Set<string>();
    const result: IngestedWorkbenchAsset[] = [];
    for (const item of input.items) {
      const sourceIdentity = `${item.source}:${item.id}`;
      if (seen.has(sourceIdentity)) throw new Error("asset.duplicate_source");
      seen.add(sourceIdentity);
      const source = await this.#resolveSource(item.source, item.id);
      if (!source?.filePath || Number(source.projectId) !== input.projectId) {
        throw new Error("asset.source_not_found");
      }
      const bytes = await this.#readFile(source.filePath);
      const stored = await this.#repository.ingestOwnedBytes({
        bytes,
        declaredKind: item.kind,
        principalId: input.principalId,
        projectId: input.projectId,
        sourceKind: item.source,
        sourceId: String(item.id),
        ...(item.durationSeconds === undefined ? {} : { durationSeconds: item.durationSeconds }),
      });
      result.push(this.#toResult(stored, item));
    }
    return result;
  }

  async #resolveSource(source: "assets" | "storyboard", id: number) {
    if (source === "storyboard") {
      return (await this.#database("o_storyboard")
        .where({ id })
        .select("filePath", "projectId")
        .first()) as SourceRow | undefined;
    }
    return (await this.#database("o_assets")
      .leftJoin("o_image", "o_image.id", "o_assets.imageId")
      .where("o_assets.id", id)
      .select("o_image.filePath as filePath", "o_assets.projectId as projectId")
      .first()) as SourceRow | undefined;
  }

  #toResult(stored: OwnedMediaAsset, item: WorkbenchAssetReference): IngestedWorkbenchAsset {
    return {
      assetId: stored.id,
      kind: item.kind,
      role: item.role,
      ...(item.durationSeconds === undefined ? {} : { durationSeconds: item.durationSeconds }),
      mimeType: stored.mimeType,
      byteLength: stored.byteLength,
      sha256: stored.sha256,
    };
  }
}
