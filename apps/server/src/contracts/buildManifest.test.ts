import { describe, expect, test } from "bun:test";
import {
  assertBackendSourceProvenance,
  assertEmbeddedWebProvenance,
  createBuildManifest,
  sha256Text,
} from "@/contracts/buildManifest";

describe("build manifest", () => {
  test("binds backend, Web, contract, client, lock and bundle identities", () => {
    const manifest = createBuildManifest({
      backendRevision: "backend-sha",
      webRevision: "web-sha",
      contractVersion: "2.0.0",
      openapiSha256: sha256Text("openapi"),
      supportedContractRange: "^2.0.0",
      generatedClientSha256: sha256Text("client"),
      dependencyLockSha256: sha256Text("lock"),
      webBundleSha256: sha256Text("bundle"),
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      backendRevision: "backend-sha",
      webRevision: "web-sha",
      contractVersion: "2.0.0",
      openapiSha256: sha256Text("openapi"),
      supportedContractRange: "^2.0.0",
      generatedClientSha256: sha256Text("client"),
      dependencyLockSha256: sha256Text("lock"),
      webBundleSha256: sha256Text("bundle"),
    });
    expect(() => assertEmbeddedWebProvenance(manifest, sha256Text("bundle"))).not.toThrow();
  });

  test("rejects an embedded Web bundle that differs from its manifest", () => {
    const manifest = createBuildManifest({
      backendRevision: "backend-sha",
      webRevision: "web-sha",
      contractVersion: "2.0.0",
      openapiSha256: sha256Text("openapi"),
      supportedContractRange: "^2.0.0",
      generatedClientSha256: sha256Text("client"),
      dependencyLockSha256: sha256Text("lock"),
      webBundleSha256: sha256Text("expected-bundle"),
    });

    expect(() => assertEmbeddedWebProvenance(manifest, sha256Text("actual-bundle"))).toThrow(
      /embedded Web bundle hash mismatch/,
    );
  });

  test("rejects stale backend source and OpenAPI artifacts even when the bundle matches", () => {
    const manifest = createBuildManifest({
      backendRevision: `backend-sha+tree.${"a".repeat(16)}`,
      webRevision: "web-sha",
      contractVersion: "2.0.0",
      openapiSha256: sha256Text("old-openapi"),
      supportedContractRange: "^2.0.0",
      generatedClientSha256: sha256Text("client"),
      dependencyLockSha256: sha256Text("lock"),
      webBundleSha256: sha256Text("bundle"),
    });

    expect(() =>
      assertBackendSourceProvenance(
        manifest,
        `another-head+tree.${"b".repeat(16)}`,
        sha256Text("old-openapi"),
      ),
    ).toThrow("embedded Web backend source revision mismatch");
    expect(() =>
      assertBackendSourceProvenance(
        manifest,
        `another-head+tree.${"a".repeat(16)}`,
        sha256Text("new-openapi"),
      ),
    ).toThrow("embedded Web OpenAPI hash mismatch");
  });
});
