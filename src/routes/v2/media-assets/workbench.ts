import express from "express";
import { workbenchAssetIngestRequestSchema } from "@/contracts/v2/schemas";
import { getMediaAssetRepository } from "@/assets/runtime";
import { WorkbenchAssetIngestService } from "@/assets/workbenchAssetIngestService";
import { principalIdFromClaims } from "@/security/principal";
import { success } from "@/lib/responseFormat";
import { db } from "@/utils/db";
import u from "@/utils";
import type { Knex } from "knex";

const router = express.Router();

router.post("/", async (req, res) => {
  const parsed = workbenchAssetIngestRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  const service = new WorkbenchAssetIngestService({
    database: db as unknown as Knex,
    repository: getMediaAssetRepository(),
    readFile: (filePath) => u.oss.getFile(filePath),
  });
  try {
    const assets = await service.ingest({
      principalId: principalIdFromClaims((req as express.Request & { user?: unknown }).user),
      projectId: parsed.data.projectId,
      items: parsed.data.items,
    });
    return res.status(201).json(success({ assets }, "素材已安全导入"));
  } catch (cause) {
    const code = (cause as Error).message;
    if (code.startsWith("asset.")) return res.status(422).json({ message: code });
    throw cause;
  }
});

export default router;
