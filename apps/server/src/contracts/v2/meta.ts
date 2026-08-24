import { readFile } from "node:fs/promises";
import { createOpenApiArtifact } from "@/contracts/v2/openapi";
import { contractVersion, metaSchema } from "@/contracts/v2/schemas";
import getPath from "@/utils/getPath";

export async function getApiMeta() {
  const webBuildManifest = JSON.parse(
    await readFile(getPath("contracts/web-build.json"), "utf8"),
  ) as { backendRevision?: unknown; webRevision?: unknown };
  return metaSchema.parse({
    contractVersion,
    openapiSha256: createOpenApiArtifact().sha256,
    backendRevision:
      process.env.NARRASTAGE_BACKEND_REVISION ?? webBuildManifest.backendRevision ?? "development",
    webRevision: webBuildManifest.webRevision,
  });
}
