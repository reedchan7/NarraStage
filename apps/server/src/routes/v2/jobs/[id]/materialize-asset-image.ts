import express from "express";
import type { Knex } from "knex";
import { db } from "@/utils/db";
import u from "@/utils";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { AssetImageGenerationMaterializer } from "@/generation/assetImageMaterializer";
import { getMediaAssetRepository } from "@/assets/runtime";
import { principalIdFromClaims } from "@/security/principal";
import { success } from "@/lib/responseFormat";

const router = express.Router({ mergeParams: true });

router.post("/", async (req, res) => {
  const database = db as unknown as Knex;
  const materializer = new AssetImageGenerationMaterializer({
    database,
    jobs: new GenerationJobRepository(database),
    assets: getMediaAssetRepository(),
    ossRoot: u.getPath("oss"),
  });
  try {
    const output = await materializer.materialize({
      jobId: (req.params as { id: string }).id,
      principalId: principalIdFromClaims((req as express.Request & { user?: unknown }).user),
    });
    return res.status(200).json(
      success({
        imageId: output.imageId,
        url: await u.oss.getFileUrl(output.filePath),
      }),
    );
  } catch (cause) {
    const code = (cause as Error).message;
    if (code === "generation.job_not_found") return res.status(404).json({ message: code });
    if (code.startsWith("generation.")) return res.status(409).json({ message: code });
    throw cause;
  }
});

export default router;
