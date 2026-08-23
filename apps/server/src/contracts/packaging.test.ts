import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("packaged contract provenance", () => {
  test("copies immutable contract artifacts into the Electron runtime data directory", async () => {
    const mainSource = await readFile(path.join(process.cwd(), "apps/desktop/src/main.ts"), "utf8");
    const builderSource = await readFile(path.join(process.cwd(), "electron-builder.yml"), "utf8");

    expect(mainSource).toContain('"contracts"');
    expect(builderSource).toContain("- from: data");
    expect(builderSource).not.toContain("!contracts/**");
  });

  test("packages Web only after generated contract provenance is verified", async () => {
    const packageSource = await readFile(
      path.join(process.cwd(), "scripts/package-web.ts"),
      "utf8",
    );

    expect(packageSource).toContain("generated Web API client does not match");
    expect(packageSource).toContain("VITE_TOONFLOW_OPENAPI_SHA256");
    expect(packageSource).toContain("createBuildManifest");
    expect(packageSource).toContain("rename(temporaryManifest, targetManifest)");
  });

  test("fails release builds closed and constrains Electron to one trusted renderer", async () => {
    const [mainSource, packageSource] = await Promise.all([
      readFile(path.join(process.cwd(), "apps/desktop/src/main.ts"), "utf8"),
      readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ]);

    expect(mainSource).toContain("requestSingleInstanceLock");
    expect(mainSource).toContain('setWindowOpenHandler(() => ({ action: "deny" }))');
    expect(mainSource).toContain('win.webContents.on("will-navigate"');
    expect(mainSource).toContain("event.sender !== mainWindow?.webContents");
    expect(mainSource).toContain("randomPort: !process.env.VITE_DEV");
    expect(mainSource).toContain("createMainWindow(activeRuntimePort)");
    for (const channel of [
      "toonflow:window:minimize",
      "toonflow:window:toggle-maximize",
      "toonflow:window:close",
    ]) {
      expect(mainSource).toMatch(
        new RegExp(
          `ipcMain\\.handle\\("${channel}", async \\(event\\) => \\{\\s+trustedRequest\\(event\\);`,
        ),
      );
    }
    expect(JSON.parse(packageSource).scripts.build).toContain("provenance:check");
  });
});
