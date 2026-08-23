import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Knex } from "knex";
import type { GenerationJobRepository } from "@/generation/jobRepository";
import type { MediaAssetRepository } from "@/assets/mediaAssetRepository";
import { generationResultSchema } from "@/providers/domain/results";

interface MaterializedRow {
  image_id: number;
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      throw new Error("generation.image_mime_unsupported");
  }
}

export class AssetImageGenerationMaterializer {
  readonly #database: Knex;
  readonly #jobs: GenerationJobRepository;
  readonly #assets: MediaAssetRepository;
  readonly #ossRoot: string;

  constructor(input: {
    database: Knex;
    jobs: GenerationJobRepository;
    assets: MediaAssetRepository;
    ossRoot: string;
  }) {
    this.#database = input.database;
    this.#jobs = input.jobs;
    this.#assets = input.assets;
    this.#ossRoot = path.resolve(input.ossRoot);
  }

  async materialize(input: {
    jobId: string;
    principalId: string;
  }): Promise<{ imageId: number; filePath: string }> {
    const existing = (await this.#database("o_generation_asset_outputs")
      .where({ job_id: input.jobId, principal_id: input.principalId })
      .first()) as MaterializedRow | undefined;
    if (existing) return this.#image(existing.image_id);

    const job = await this.#jobs.getForPrincipal(input.jobId, input.principalId);
    if (!job) throw new Error("generation.job_not_found");
    if (job.state !== "succeeded") throw new Error("generation.job_not_succeeded");
    if (job.consumer?.type !== "asset_image") throw new Error("generation.consumer_mismatch");
    const { projectId, assetId, assetType } = job.consumer.context;
    const productAsset = await this.#database("o_assets")
      .where({ id: assetId, projectId, type: assetType })
      .first();
    if (!productAsset) throw new Error("generation.product_asset_not_found");

    const result = generationResultSchema.safeParse(job.result);
    const artifact = result.success
      ? result.data.artifacts.find((candidate) => candidate.kind === "image")
      : undefined;
    if (!artifact) throw new Error("generation.image_artifact_missing");
    const owned = await this.#assets.getOwned(artifact.assetId, input.principalId);
    if (!owned || owned.kind !== "image") throw new Error("generation.image_asset_missing");
    const relativePath = `${projectId}/${assetType}/provider-${job.id}.${extensionFor(owned.mimeType)}`;
    const targetPath = path.join(this.#ossRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await copyFile(owned.filePath, targetPath);

    let imageId: number;
    try {
      imageId = await this.#database.transaction(async (transaction) => {
        const raced = (await transaction("o_generation_asset_outputs")
          .where({ job_id: input.jobId })
          .first()) as MaterializedRow | undefined;
        if (raced) return raced.image_id;
        const inserted = await transaction("o_image").insert({
          assetsId: assetId,
          filePath: `/${relativePath}`,
          type: assetType,
          model: job.offeringId,
          resolution:
            typeof job.input.values.imageSize === "string" ? job.input.values.imageSize : undefined,
          state: "已完成",
        });
        const id = Number(inserted[0]);
        await transaction("o_generation_asset_outputs").insert({
          job_id: input.jobId,
          principal_id: input.principalId,
          project_id: projectId,
          asset_id: assetId,
          image_id: id,
          created_at: Date.now(),
        });
        return id;
      });
    } catch (cause) {
      const raced = (await this.#database("o_generation_asset_outputs")
        .where({ job_id: input.jobId, principal_id: input.principalId })
        .first()) as MaterializedRow | undefined;
      if (!raced) throw cause;
      imageId = raced.image_id;
    }
    return { imageId, filePath: `/${relativePath}` };
  }

  async #image(imageId: number): Promise<{ imageId: number; filePath: string }> {
    const image = await this.#database("o_image").where({ id: imageId }).select("filePath").first();
    if (!image?.filePath) throw new Error("generation.materialized_image_missing");
    return { imageId, filePath: String(image.filePath) };
  }
}
