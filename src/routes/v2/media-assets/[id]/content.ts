import express from "express";
import { z } from "zod";
import { getMediaAssetRepository } from "@/assets/runtime";
import { principalIdFromClaims } from "@/security/principal";

const router = express.Router();
const assetIdSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

router.get("/", async (req, res) => {
  const parsed = assetIdSchema.safeParse((req.params as Record<string, string>).id);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_asset_id" });
  const asset = await getMediaAssetRepository().getOwned(
    parsed.data,
    principalIdFromClaims((req as express.Request & { user?: unknown }).user),
  );
  if (!asset) return res.status(404).json({ message: "asset.not_found" });
  res.type(asset.mimeType);
  res.setHeader("Content-Length", String(asset.byteLength));
  res.setHeader("Cache-Control", "private, max-age=3600, immutable");
  return res.sendFile(asset.filePath);
});

export default router;
