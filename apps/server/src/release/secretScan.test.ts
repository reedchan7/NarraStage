import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanFileForSecrets } from "@/release/secretScan";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("release artifact secret scan", () => {
  test("finds configured values across stream chunk boundaries without loading the artifact", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-secret-scan-"));
    directories.push(directory);
    const filePath = path.join(directory, "large.bin");
    const secret = "toonflow-boundary-secret-123456789";
    await writeFile(
      filePath,
      Buffer.concat([Buffer.alloc(1024 * 1024 - 7, 65), Buffer.from(secret), Buffer.alloc(32, 66)]),
    );
    expect(await scanFileForSecrets(filePath, [{ name: "canary", value: secret }])).toContain(
      "canary",
    );
  });

  test("detects common provider key formats even when the exact value was not configured", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-secret-scan-"));
    directories.push(directory);
    const filePath = path.join(directory, "bundle.js");
    await writeFile(filePath, `const leaked = "AIza${"A".repeat(35)}";`);
    expect(await scanFileForSecrets(filePath, [])).toContain("google-api-key-pattern");
  });

  test("does not classify ordinary symbols and CSS identifiers as provider keys", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-secret-scan-"));
    directories.push(directory);
    const filePath = path.join(directory, "app.asar");
    await writeFile(filePath, "mask-image-linear-from-pos sk-image-linear-from-pos");
    expect(await scanFileForSecrets(filePath, [])).toEqual([]);
  });

  test("refuses to claim a configured-value scan when no scan input exists", async () => {
    const env = { ...process.env };
    for (const name of [
      "DEEPSEEK_API_KEY",
      "MINIMAX_API_KEY",
      "FAL_KEY",
      "FAL_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "TOONFLOW_SECRET_SCAN_CANARY",
    ]) {
      delete env[name];
    }
    const child = Bun.spawn([process.execPath, "scripts/check-secrets.ts"], {
      cwd: process.cwd(),
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("release.secret_scan_inputs_missing");
  });
});
