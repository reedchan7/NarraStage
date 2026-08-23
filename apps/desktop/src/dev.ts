import { watch } from "node:fs";
import path from "node:path";
import { build } from "@tooling/build";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");

let electron: ReturnType<typeof Bun.spawn> | undefined;
let rebuilding = false;
let pending = false;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

async function buildAndRestart(): Promise<void> {
  if (rebuilding) {
    pending = true;
    return;
  }

  rebuilding = true;
  do {
    pending = false;
    try {
      await build();
      if (electron) {
        electron.kill();
        await electron.exited;
      }
      electron = Bun.spawn(
        [path.join(repositoryRoot, "node_modules/.bin/electron"), "build/main.js"],
        {
          cwd: repositoryRoot,
          env: { ...process.env, NODE_ENV: "dev" },
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        },
      );
    } catch (error) {
      console.error("[Electron 开发构建失败]", error);
    }
  } while (pending);
  rebuilding = false;
}

function scheduleRestart(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void buildAndRestart(), 100);
}

const watchers = [
  watch(path.join(repositoryRoot, "apps/server/src"), { recursive: true }, scheduleRestart),
  watch(path.join(repositoryRoot, "apps/desktop/src"), { recursive: true }, scheduleRestart),
];

async function stop(): Promise<void> {
  for (const watcher of watchers) watcher.close();
  if (electron) {
    electron.kill();
    await electron.exited;
  }
  process.exit(0);
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

await buildAndRestart();
