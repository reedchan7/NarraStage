import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertBackendSourceProvenance,
  assertEmbeddedWebProvenance,
  buildManifestSchema,
  sha256Text,
} from "@/contracts/buildManifest";
import { backendRevisionScope, repositoryContentRevision, webRevisionScope } from "./package-web";

export async function checkWebProvenance(
  manifestPath: string,
  bundlePath: string,
  repositoryRoot: string,
): Promise<void> {
  const openapiPath = path.join(repositoryRoot, "data/contracts/openapi.v2.json");
  const contractsRoot = path.join(repositoryRoot, "packages/contracts/src/generated");
  const [manifestContents, bundleContents, openapi, backendRevision] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(bundlePath),
    readFile(openapiPath),
    repositoryContentRevision(repositoryRoot, backendRevisionScope),
  ]);
  const manifest = buildManifestSchema.parse(JSON.parse(manifestContents));
  assertEmbeddedWebProvenance(manifest, sha256Text(bundleContents));
  assertBackendSourceProvenance(manifest, backendRevision, sha256Text(openapi));
  const [webRevision, generatedClient, generatedSource, dependencyLock] = await Promise.all([
    repositoryContentRevision(repositoryRoot, webRevisionScope),
    readFile(path.join(contractsRoot, "v2.ts")),
    readFile(path.join(contractsRoot, "source.json"), "utf8").then(JSON.parse) as Promise<{
      openapiSha256: string;
      generatedClientSha256: string;
    }>,
    readFile(path.join(repositoryRoot, "bun.lock")),
  ]);
  const generatedClientSha256 = sha256Text(generatedClient);
  if (manifest.webRevision !== webRevision) throw new Error("build.web_revision_mismatch");
  if (manifest.generatedClientSha256 !== generatedClientSha256) {
    throw new Error("build.generated_client_mismatch");
  }
  if (
    generatedSource.openapiSha256 !== manifest.openapiSha256 ||
    generatedSource.generatedClientSha256 !== generatedClientSha256
  ) {
    throw new Error("build.generated_source_mismatch");
  }
  if (manifest.dependencyLockSha256 !== sha256Text(dependencyLock)) {
    throw new Error("build.dependency_lock_mismatch");
  }
}

if (import.meta.main) {
  const repositoryRoot = path.resolve(import.meta.dir, "..");
  await checkWebProvenance(
    path.join(repositoryRoot, "data/contracts/web-build.json"),
    path.join(repositoryRoot, "data/web/index.html"),
    repositoryRoot,
  );
}
