import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required build metadata: ${name}`);
  return value;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const outputPath = process.argv[2];
if (!outputPath) throw new Error("usage: bun run build:meta <output-path>");

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const [bundle, lockfile] = await Promise.all([
  readFile(path.join(repositoryRoot, "dist/index.html")),
  readFile(path.resolve(repositoryRoot, "../..", "bun.lock")),
]);

const metadata = {
  schemaVersion: 1,
  backendRevision: required("NARRASTAGE_BACKEND_REVISION"),
  webRevision: required("NARRASTAGE_WEB_REVISION"),
  contractVersion: required("NARRASTAGE_CONTRACT_VERSION"),
  openapiSha256: required("NARRASTAGE_OPENAPI_SHA256"),
  supportedContractRange: required("NARRASTAGE_SUPPORTED_CONTRACT_RANGE"),
  generatedClientSha256: required("NARRASTAGE_GENERATED_CLIENT_SHA256"),
  dependencyLockSha256: sha256(lockfile),
  webBundleSha256: sha256(bundle),
};

await writeFile(path.resolve(outputPath), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
