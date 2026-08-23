import { describe, expect, test } from "bun:test";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { providerCatalogSchema } from "@/providers/domain/models";
import { createOpenApiArtifact, validateCatalogIntegrity } from "@/contracts/v2/openapi";

describe("v2 contract", () => {
  test("validates the catalog and every offering capability reference", () => {
    expect(() => providerCatalogSchema.parse(builtinCatalog)).not.toThrow();
    expect(() => validateCatalogIntegrity(builtinCatalog)).not.toThrow();
  });

  test("generates a stable OpenAPI artifact and identity", () => {
    const artifact = createOpenApiArtifact();

    expect(artifact.document.info.version).toBe("2.0.0");
    expect(Object.keys(artifact.document.paths)).toEqual([
      "/api/meta",
      "/api/v2/catalog",
      "/api/v2/preflight",
      "/api/v2/providers",
      "/api/v2/providers/{providerId}/health-check",
      "/api/v2/support",
      "/api/v2/language/generate",
      "/api/v2/language/stream",
      "/api/v2/files/upload",
      "/api/v2/media-assets/workbench",
      "/api/v2/media-assets/upload",
      "/api/v2/media-assets/{id}/content",
      "/api/v2/jobs",
      "/api/v2/jobs/{id}/resume-import",
      "/api/v2/jobs/{id}",
      "/api/v2/jobs/{id}/cancel",
      "/api/v2/jobs/{id}/reconcile",
      "/api/v2/jobs/{id}/materialize-workbench",
      "/api/v2/jobs/{id}/materialize-asset-image",
    ]);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.json.endsWith("\n")).toBe(true);
  });
});
