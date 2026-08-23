import type { paths } from "@/api/generated/v2";
import { webBuildMeta } from "@/api/buildMeta";

export type ApiMeta = paths["/api/meta"]["get"]["responses"][200]["content"]["application/json"];

export type CompatibilityFailureCode = "contract_version" | "openapi_digest" | "web_revision" | "invalid_metadata";

export type CompatibilityResult = { compatible: true } | { compatible: false; code: CompatibilityFailureCode };

function parseVersion(value: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function satisfiesCaretRange(version: string, range: string): boolean {
  const expected = range.startsWith("^") ? parseVersion(range.slice(1)) : undefined;
  const actual = parseVersion(version);
  if (!expected || !actual) return false;
  if (actual[0] !== expected[0]) return false;
  if (actual[1] < expected[1]) return false;
  return actual[1] !== expected[1] || actual[2] >= expected[2];
}

function isDevelopmentRevision(value: string): boolean {
  return value === "development" || value === "legacy-unpinned";
}

export function evaluateApiCompatibility(
  meta: ApiMeta,
  client = webBuildMeta,
  mode: "embedded" | "standalone" = "embedded",
): CompatibilityResult {
  if (!meta || typeof meta.contractVersion !== "string" || typeof meta.openapiSha256 !== "string" || typeof meta.webRevision !== "string") {
    return { compatible: false, code: "invalid_metadata" };
  }
  if (!satisfiesCaretRange(meta.contractVersion, client.supportedContractRange)) {
    return { compatible: false, code: "contract_version" };
  }
  if (mode === "standalone") return { compatible: true };
  if (meta.openapiSha256 !== client.openapiSha256) {
    return { compatible: false, code: "openapi_digest" };
  }
  if (!isDevelopmentRevision(meta.webRevision) && !isDevelopmentRevision(client.webRevision) && meta.webRevision !== client.webRevision) {
    return { compatible: false, code: "web_revision" };
  }
  return { compatible: true };
}
