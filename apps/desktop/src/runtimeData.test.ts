import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initializeRuntimeData,
  RUNTIME_PROVENANCE_STAMP,
  runtimeProvenanceFromUnknown,
  shouldReplaceImmutableRuntime,
} from "./runtimeData";

const packaged = {
  backendRevision: "content-aaaa+tree.aaaaaaaaaaaaaaaa",
  webRevision: "content-bbbb+tree.bbbbbbbbbbbbbbbb",
  webBundleSha256: "1".repeat(64),
};

const stale = {
  ...packaged,
  webBundleSha256: "2".repeat(64),
};

describe("immutable runtime replace", () => {
  test("replaces when no local version exists", () => {
    expect(shouldReplaceImmutableRuntime(undefined, "2.1.0", undefined, packaged)).toBe(true);
  });

  test("replaces when the packaged app version is newer", () => {
    expect(shouldReplaceImmutableRuntime("2.0.0", "2.1.0", stale, packaged)).toBe(true);
  });

  test("replaces same-version installs whose provenance no longer matches", () => {
    expect(shouldReplaceImmutableRuntime("2.1.0", "2.1.0", stale, packaged)).toBe(true);
  });

  test("replaces same-version installs that lost local provenance", () => {
    expect(shouldReplaceImmutableRuntime("2.1.0", "2.1.0", undefined, packaged)).toBe(true);
  });

  test("keeps matching same-version data to avoid copying on every launch", () => {
    expect(shouldReplaceImmutableRuntime("2.1.0", "2.1.0", packaged, packaged)).toBe(false);
  });

  test("does not replace a newer local version", () => {
    expect(shouldReplaceImmutableRuntime("2.2.0", "2.1.0", stale, packaged)).toBe(false);
  });
});

describe("runtime provenance parser", () => {
  test("accepts the three identity fields and ignores extras", () => {
    expect(
      runtimeProvenanceFromUnknown({
        ...packaged,
        extra: true,
      }),
    ).toEqual(packaged);
  });

  test("rejects missing, empty, or non-object payloads", () => {
    expect(runtimeProvenanceFromUnknown(null)).toBeUndefined();
    expect(runtimeProvenanceFromUnknown([])).toBeUndefined();
    expect(runtimeProvenanceFromUnknown({ ...packaged, webRevision: "" })).toBeUndefined();
    expect(
      runtimeProvenanceFromUnknown({
        backendRevision: packaged.backendRevision,
        webRevision: packaged.webRevision,
      }),
    ).toBeUndefined();
  });
});

const fixtures: string[] = [];

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })),
  );
});

describe("initializeRuntimeData", () => {
  test("recovers a same-version copy that updated contracts before web", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "narrastage-runtime-"));
    fixtures.push(root);
    const packagedDir = path.join(root, "packaged");
    const userDir = path.join(root, "user");
    await writeTree(packagedDir, {
      "contracts/web-build.json": `${JSON.stringify(packaged, null, 2)}\n`,
      "web/index.html": "new-web",
      "serve/app.js": "new-serve",
      "vendor/custom.ts": "packaged-vendor",
    });
    await writeTree(userDir, {
      "version.txt": "2.1.0\n",
      "contracts/web-build.json": `${JSON.stringify(packaged, null, 2)}\n`,
      "web/index.html": "old-web",
      "serve/app.js": "old-serve",
      "vendor/custom.ts": "user-vendor",
    });

    initializeRuntimeData({
      packagedDataDir: packagedDir,
      userDataDir: userDir,
      appVersion: "2.1.0",
    });

    expect(await readFile(path.join(userDir, "web/index.html"), "utf8")).toBe("new-web");
    expect(await readFile(path.join(userDir, "serve/app.js"), "utf8")).toBe("new-serve");
    expect(await readFile(path.join(userDir, "vendor/custom.ts"), "utf8")).toBe("user-vendor");
    expect(
      JSON.parse(await readFile(path.join(userDir, RUNTIME_PROVENANCE_STAMP), "utf8")),
    ).toEqual(packaged);
  });

  test("does not recopy matching stamped data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "narrastage-runtime-"));
    fixtures.push(root);
    const packagedDir = path.join(root, "packaged");
    const userDir = path.join(root, "user");
    await writeTree(packagedDir, {
      "contracts/web-build.json": `${JSON.stringify(packaged, null, 2)}\n`,
      "web/index.html": "packaged-web",
    });
    await writeTree(userDir, {
      "version.txt": "2.1.0\n",
      [RUNTIME_PROVENANCE_STAMP]: `${JSON.stringify(packaged, null, 2)}\n`,
      "web/index.html": "local-web",
    });

    initializeRuntimeData({
      packagedDataDir: packagedDir,
      userDataDir: userDir,
      appVersion: "2.1.0",
    });

    expect(await readFile(path.join(userDir, "web/index.html"), "utf8")).toBe("local-web");
  });
});
