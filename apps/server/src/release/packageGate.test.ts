import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("release package entry points", () => {
  test("cannot invoke electron-builder before release evidence and provenance pass", () => {
    for (const scriptName of ["pack", "dist", "dist:win", "dist:mac", "dist:linux"] as const) {
      const script = packageJson.scripts[scriptName];
      expect(script.startsWith("bun run release:check && bun run build &&")).toBe(true);
      expect(script.endsWith("&& bun run secrets:check")).toBe(true);
      expect(script.indexOf("release:check")).toBeLessThan(script.indexOf("electron-builder"));
    }
  });

  test("builds repository-local Web source through the aggregate quality gate", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    expect(workflow).not.toContain("repository: HBAI-Ltd/Toonflow-web");
    expect(workflow).not.toContain("corepack yarn");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun run check");
    expect(workflow).toContain(
      "bun run web:package && git diff --exit-code -- data/web data/contracts/web-build.json",
    );
    expect(packageJson.scripts.check).toContain("bun run artifacts:check");
    expect(packageJson.scripts["artifacts:check"]).toContain(
      "git diff --exit-code -- data/web data/contracts/web-build.json data/serve/app.js",
    );
  });

  test("parses the checked-in Bun JSONC lock before evaluating product evidence", async () => {
    const child = Bun.spawn([process.execPath, "scripts/check-release-evidence.ts"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("release.evidence_incomplete");
    expect(stderr).not.toContain("SyntaxError");
  });
});
