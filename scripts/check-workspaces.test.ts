import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectWorkspaceViolations } from "./check-workspaces";

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "toonflow-workspace-"));
  await mkdir(path.join(root, "apps/server"), { recursive: true });
  await mkdir(path.join(root, "apps/web"), { recursive: true });
  await mkdir(path.join(root, "apps/desktop"), { recursive: true });
  await mkdir(path.join(root, "packages/contracts"), { recursive: true });
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      workspaces: ["apps/*", "packages/*"],
      devDependencies: { typescript: "7.0.2" },
    }),
  );
  for (const relative of ["apps/server", "apps/web", "apps/desktop", "packages/contracts"]) {
    await writeFile(path.join(root, relative, "package.json"), JSON.stringify({ name: relative }));
  }
  await writeFile(path.join(root, "bun.lock"), "{}");
  await cp(path.join(root, "bun.lock"), path.join(root, "scripts/package-web.ts"));
  await cp(path.join(root, "bun.lock"), path.join(root, "scripts/check-web-provenance.ts"));
  await cp(path.join(root, "bun.lock"), path.join(root, ".github/workflows/release.yml"));
  return root;
}

describe("workspace policy", () => {
  test("accepts explicit apps and shared contracts with one TypeScript 7 lock graph", async () => {
    const root = await fixture();
    try {
      expect(await collectWorkspaceViolations(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a sibling Web checkout, secondary lockfile, and old TypeScript", async () => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, "apps/web/yarn.lock"), "legacy");
      await writeFile(
        path.join(root, "apps/web/package.json"),
        JSON.stringify({ name: "web", devDependencies: { typescript: "5.6.3" } }),
      );
      await writeFile(path.join(root, "scripts/package-web.ts"), "../Toonflow-web");
      const violations = await collectWorkspaceViolations(root);
      expect(violations).toContain("secondary lockfile is forbidden: apps/web/yarn.lock");
      expect(violations).toContain("apps/web/package.json selects TypeScript below 7: 5.6.3");
      expect(violations).toContain("scripts/package-web.ts contains ../Toonflow-web");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
