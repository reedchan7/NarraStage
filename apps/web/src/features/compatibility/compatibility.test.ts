import { describe, expect, test } from "vitest";
import { evaluateApiCompatibility, type ApiMeta } from "./compatibility";

const client = {
  schemaVersion: 1 as const,
  webRevision: "web-revision",
  supportedContractRange: "^2.0.0",
  openapiSha256: "a".repeat(64),
  generatedClientSha256: "b".repeat(64),
};

function meta(overrides: Partial<ApiMeta> = {}): ApiMeta {
  return {
    backendRevision: "backend-revision",
    contractVersion: "2.0.0",
    openapiSha256: "a".repeat(64),
    webRevision: "web-revision",
    ...overrides,
  };
}

describe("evaluateApiCompatibility", () => {
  test("accepts the exact generated contract and packaged Web revision", () => {
    expect(evaluateApiCompatibility(meta(), client)).toEqual({ compatible: true });
  });

  test("rejects contract-major, OpenAPI digest, and packaged Web drift", () => {
    expect(evaluateApiCompatibility(meta({ contractVersion: "3.0.0" }), client)).toEqual({
      compatible: false,
      code: "contract_version",
    });
    expect(evaluateApiCompatibility(meta({ openapiSha256: "c".repeat(64) }), client)).toEqual({
      compatible: false,
      code: "openapi_digest",
    });
    expect(evaluateApiCompatibility(meta({ webRevision: "another-build" }), client)).toEqual({
      compatible: false,
      code: "web_revision",
    });
  });

  test("allows unpinned development revisions while retaining contract checks", () => {
    expect(evaluateApiCompatibility(meta({ webRevision: "legacy-unpinned" }), client)).toEqual({
      compatible: true,
    });
  });

  test("allows additive compatible server contracts in standalone mode only", () => {
    const additive = meta({
      contractVersion: "2.1.0",
      openapiSha256: "c".repeat(64),
      webRevision: "another-build",
    });
    expect(evaluateApiCompatibility(additive, client, "standalone")).toEqual({
      compatible: true,
    });
    expect(evaluateApiCompatibility(additive, client, "embedded")).toEqual({
      compatible: false,
      code: "openapi_digest",
    });
  });
});
