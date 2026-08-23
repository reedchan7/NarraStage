import { createHash } from "node:crypto";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const buildManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    backendRevision: z.string().min(1),
    webRevision: z.string().min(1),
    contractVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    openapiSha256: sha256Schema,
    supportedContractRange: z.string().min(1),
    generatedClientSha256: sha256Schema,
    dependencyLockSha256: sha256Schema,
    webBundleSha256: sha256Schema,
  })
  .strict();

export type BuildManifest = z.infer<typeof buildManifestSchema>;
export type BuildManifestInput = Omit<BuildManifest, "schemaVersion">;

export function sha256Text(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createBuildManifest(input: BuildManifestInput): BuildManifest {
  return buildManifestSchema.parse({
    schemaVersion: 1,
    ...input,
  });
}

export function assertEmbeddedWebProvenance(
  manifest: BuildManifest,
  actualBundleSha256: string,
): void {
  sha256Schema.parse(actualBundleSha256);
  if (manifest.webBundleSha256 !== actualBundleSha256) {
    throw new Error(
      `embedded Web bundle hash mismatch: expected ${manifest.webBundleSha256}, received ${actualBundleSha256}`,
    );
  }
}

function contentTreeRevision(revision: string): string | undefined {
  return revision.match(/\+tree\.([a-f0-9]{16})$/)?.[1];
}

export function assertBackendSourceProvenance(
  manifest: BuildManifest,
  actualBackendRevision: string,
  actualOpenapiSha256: string,
): void {
  const expectedTree = contentTreeRevision(manifest.backendRevision);
  const actualTree = contentTreeRevision(actualBackendRevision);
  if (!expectedTree || !actualTree || expectedTree !== actualTree) {
    throw new Error(
      `embedded Web backend source revision mismatch: expected ${manifest.backendRevision}, received ${actualBackendRevision}`,
    );
  }
  sha256Schema.parse(actualOpenapiSha256);
  if (manifest.openapiSha256 !== actualOpenapiSha256) {
    throw new Error(
      `embedded Web OpenAPI hash mismatch: expected ${manifest.openapiSha256}, received ${actualOpenapiSha256}`,
    );
  }
}
