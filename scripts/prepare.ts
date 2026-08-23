import { existsSync } from "node:fs";

async function installHooks(): Promise<void> {
  if (!existsSync(".git")) return;

  const lefthook = Bun.which("lefthook");
  if (!lefthook) return;

  const hookProcess = Bun.spawn([lefthook, "install"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await hookProcess.exited;
}

void installHooks();
