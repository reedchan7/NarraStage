import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Knex } from "knex";
import type { GenerationJobRepository } from "@/generation/jobRepository";
import type { MediaAssetRepository } from "@/assets/mediaAssetRepository";

interface MaterializedRow {
  video_id: number;
}

interface GenerationResult {
  artifacts?: Array<{ kind?: unknown; assetId?: unknown }>;
}

export class WorkbenchGenerationMaterializer {
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
  }): Promise<{ videoId: number; filePath: string }> {
    const existing = (await this.#database("o_generation_workbench_outputs")
      .where({ job_id: input.jobId, principal_id: input.principalId })
      .first()) as MaterializedRow | undefined;
    if (existing) return this.#video(existing.video_id);

    const job = await this.#jobs.getForPrincipal(input.jobId, input.principalId);
    if (!job) throw new Error("generation.job_not_found");
    if (job.state !== "succeeded") throw new Error("generation.job_not_succeeded");
    if (job.consumer?.type !== "workbench") throw new Error("generation.consumer_mismatch");
    const { projectId, scriptId, trackId } = job.consumer.context;
    const track = await this.#database("o_videoTrack")
      .where({ id: trackId, projectId, scriptId })
      .first();
    if (!track) throw new Error("generation.workbench_track_not_found");

    const result = job.result as GenerationResult | undefined;
    const artifact = result?.artifacts?.find(
      (candidate) => candidate.kind === "video" && typeof candidate.assetId === "string",
    );
    if (!artifact || typeof artifact.assetId !== "string") {
      throw new Error("generation.video_artifact_missing");
    }
    const asset = await this.#assets.getOwned(artifact.assetId, input.principalId);
    if (!asset || asset.kind !== "video") throw new Error("generation.video_asset_missing");

    const relativePath = `${projectId}/video/provider-${job.id}.mp4`;
    const targetPath = path.join(this.#ossRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await copyFile(asset.filePath, targetPath);

    let videoId: number;
    try {
      videoId = await this.#database.transaction(async (transaction) => {
        const raced = (await transaction("o_generation_workbench_outputs")
          .where({ job_id: input.jobId })
          .first()) as MaterializedRow | undefined;
        if (raced) return raced.video_id;
        const inserted = await transaction("o_video").insert({
          filePath: `/${relativePath}`,
          time: Date.now(),
          state: "已完成",
          scriptId,
          projectId,
          videoTrackId: trackId,
        });
        const id = Number(inserted[0]);
        await transaction("o_generation_workbench_outputs").insert({
          job_id: input.jobId,
          principal_id: input.principalId,
          project_id: projectId,
          script_id: scriptId,
          track_id: trackId,
          video_id: id,
          created_at: Date.now(),
        });
        return id;
      });
    } catch (cause) {
      const raced = (await this.#database("o_generation_workbench_outputs")
        .where({ job_id: input.jobId, principal_id: input.principalId })
        .first()) as MaterializedRow | undefined;
      if (!raced) throw cause;
      videoId = raced.video_id;
    }
    return { videoId, filePath: `/${relativePath}` };
  }

  async #video(videoId: number): Promise<{ videoId: number; filePath: string }> {
    const video = await this.#database("o_video").where({ id: videoId }).select("filePath").first();
    if (!video?.filePath) throw new Error("generation.materialized_video_missing");
    return { videoId, filePath: String(video.filePath) };
  }
}
