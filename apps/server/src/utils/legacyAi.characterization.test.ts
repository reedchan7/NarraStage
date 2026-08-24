import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("./ai.ts", import.meta.url);

describe("legacy AI compatibility seam", () => {
  test("keeps vendor:model lookup and NarraStage-owned save behavior during migration", async () => {
    const source = await readFile(sourcePath, "utf8");

    expect(source).toContain("modelName.split(/:(.+)/)");
    expect(source).toContain('u.db("o_vendorConfig").where("id", id).first()');
    expect(source).toContain('getVendorTemplateFn("imageRequest", mn)');
    expect(source).toContain('getVendorTemplateFn("videoRequest", mn)');
    expect(source.match(/await u\.oss\.writeFile\(path, this\.result\)/g)).toHaveLength(3);
  });
});
