import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function packagedExecutable(repositoryRoot: string): string {
  if (process.platform === "darwin") {
    return path.join(
      repositoryRoot,
      "dist",
      process.arch === "arm64" ? "mac-arm64" : "mac",
      "ToonFlow.app",
      "Contents",
      "MacOS",
      "ToonFlow",
    );
  }
  if (process.platform === "win32") {
    return path.join(repositoryRoot, "dist", "win-unpacked", "ToonFlow.exe");
  }
  return path.join(repositoryRoot, "dist", "linux-unpacked", "toonflow");
}

const repositoryRoot = path.resolve(import.meta.dir, "..");
const executable = packagedExecutable(repositoryRoot);
await access(executable);
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "toonflow-packaged-probe."));
const child = Bun.spawn([executable], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    NODE_ENV: "prod",
    TOONFLOW_USER_DATA_DIR: userDataDirectory,
  },
  stderr: "pipe",
  stdout: "pipe",
});
const stderr = new Response(child.stderr).text();

try {
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";
  const ready = (async () => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value, { stream: true });
      if (output.includes("[桌面客户端就绪]")) return;
    }
    throw new Error(`packaged desktop exited before ready\n${output}\n${await stderr}`);
  })();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`packaged desktop readiness timeout\n${output}`)),
      30_000,
    );
  });
  try {
    await Promise.race([ready, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  await access(path.join(userDataDirectory, "data", "web", "index.html"));
  console.log(JSON.stringify({ packaged: true, renderer: true, isolatedUserData: true }));
} finally {
  child.kill();
  await child.exited;
  await rm(userDataDirectory, { recursive: true, force: true });
}
