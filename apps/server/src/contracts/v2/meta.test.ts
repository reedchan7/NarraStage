import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getApiMeta } from "@/contracts/v2/meta";

describe("API compatibility metadata", () => {
  test("uses packaged provenance when no deployment revision overrides it", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(process.cwd(), "data/contracts/web-build.json"), "utf8"),
    ) as { backendRevision: string; webRevision: string; openapiSha256: string };
    const meta = await getApiMeta();

    expect(meta.backendRevision).toBe(
      process.env.TOONFLOW_BACKEND_REVISION ?? manifest.backendRevision,
    );
    expect(meta.webRevision).toBe(manifest.webRevision);
    expect(meta.openapiSha256).toBe(manifest.openapiSha256);
  });
});
