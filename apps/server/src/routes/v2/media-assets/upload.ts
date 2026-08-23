import legacyHttp from "@/http/compat";
import { getMediaAssetRepository } from "@/assets/runtime";
import { success } from "@/lib/responseFormat";
import { principalIdFromClaims } from "@/security/principal";

const router = legacyHttp.Router();
const maximumUploadBytes = 2 * 1024 * 1024 * 1024;

router.put("/", async (req, res) => {
  const contentLength = Number(req.headers["content-length"]);
  const mediaType = req.headers["x-toonflow-media-type"];
  const encodedFilename = req.headers["x-toonflow-filename"];
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > maximumUploadBytes ||
    typeof mediaType !== "string" ||
    typeof encodedFilename !== "string"
  ) {
    return res.status(400).json({ message: "contract.invalid_asset_upload_headers" });
  }
  let filename: string;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    return res.status(400).json({ message: "contract.invalid_asset_upload_headers" });
  }
  if (!filename || filename.length > 255 || /[\0\r\n]/.test(filename)) {
    return res.status(400).json({ message: "contract.invalid_asset_upload_headers" });
  }
  try {
    const asset = await getMediaAssetRepository().ingestOwnedStream({
      stream: req,
      declaredMediaType: mediaType,
      byteLength: contentLength,
      filename,
      principalId: principalIdFromClaims(req.user),
      maximumBytes: maximumUploadBytes,
    });
    return res.status(201).json(
      success({
        assetId: asset.id,
        kind: asset.kind,
        mediaType: asset.mimeType,
        byteLength: asset.byteLength,
        sha256: asset.sha256,
        filename,
      }),
    );
  } catch (cause) {
    const code = (cause as Error).message;
    if (code.startsWith("asset.")) return res.status(422).json({ message: code });
    throw cause;
  }
});

export default router;
