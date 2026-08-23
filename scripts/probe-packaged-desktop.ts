import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const legacyDataDirectory = path.join(userDataDirectory, "data");
const legacyRendererCanary = "legacy-vue-renderer-canary";
await Promise.all([
  mkdir(path.join(legacyDataDirectory, "web"), { recursive: true }),
  mkdir(path.join(legacyDataDirectory, "oss"), { recursive: true }),
]);
await Promise.all([
  writeFile(path.join(legacyDataDirectory, "version.txt"), "2.0.0\n", "utf8"),
  writeFile(path.join(legacyDataDirectory, "web", "index.html"), legacyRendererCanary, "utf8"),
  copyFile(
    path.join(repositoryRoot, "data/skills/art_skills/2D_90s_japanese_anime/images/1.png"),
    path.join(legacyDataDirectory, "oss", "upgrade-probe.png"),
  ),
]);
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
  const portMatch = output.match(/\[桌面客户端就绪\]: http:\/\/localhost:(\d+)/);
  if (!portMatch) throw new Error(`packaged desktop did not report its runtime port\n${output}`);
  const port = Number(portMatch[1]);
  const [metaResponse, thumbnailResponse, renderer, installedVersion] = await Promise.all([
    fetch(`http://localhost:${port}/api/meta`),
    fetch(`http://localhost:${port}/oss/upgrade-probe.png?size=20`),
    readFile(path.join(legacyDataDirectory, "web", "index.html"), "utf8"),
    readFile(path.join(legacyDataDirectory, "version.txt"), "utf8").then((value) => value.trim()),
  ]);
  const meta = (await metaResponse.json()) as { contractVersion?: unknown };
  const thumbnail = await thumbnailResponse.arrayBuffer();
  if (!metaResponse.ok || meta.contractVersion !== "2.0.0") {
    throw new Error(`packaged API metadata probe failed (${metaResponse.status})`);
  }
  if (!thumbnailResponse.ok || thumbnail.byteLength === 0) {
    throw new Error(`packaged Node thumbnail probe failed (${thumbnailResponse.status})`);
  }
  if (renderer.includes(legacyRendererCanary) || installedVersion !== "2.1.0") {
    throw new Error("packaged 2.0.0 runtime data was not upgraded to the React 2.1.0 payload");
  }
  console.log(
    JSON.stringify({
      packaged: true,
      renderer: true,
      isolatedUserData: true,
      upgradedFrom: "2.0.0",
      apiMeta: true,
      nodeThumbnail: true,
    }),
  );
} finally {
  child.kill();
  await child.exited;
  await rm(userDataDirectory, { recursive: true, force: true });
}
