import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "toonflow-electron-vault-probe."));
const vaultDirectory = path.join(temporaryRoot, "vault");
await mkdir(vaultDirectory);
const buildResult = await Bun.build({
  entrypoints: [path.join(repositoryRoot, "apps/server/tests/electron/credentialVault.probe.ts")],
  external: ["electron"],
  format: "esm",
  naming: "probe.mjs",
  outdir: temporaryRoot,
  target: "node",
});

try {
  if (!buildResult.success) {
    throw new Error(buildResult.logs.map((log) => log.message).join("\n"));
  }
  const child = Bun.spawn(
    [
      path.join(repositoryRoot, "node_modules/.bin/electron"),
      path.join(temporaryRoot, "probe.mjs"),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        TOONFLOW_ELECTRON_VAULT_PROBE_DIR: vaultDirectory,
      },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr || stdout || `desktop.probe_exit_${exitCode}`);
  console.log(stdout.trim());
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
