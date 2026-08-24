import { access, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";

function packagedExecutable(repositoryRoot: string): string {
  if (process.platform === "darwin") {
    return path.join(
      repositoryRoot,
      "dist",
      process.arch === "arm64" ? "mac-arm64" : "mac",
      "NarraStage.app",
      "Contents",
      "MacOS",
      "NarraStage",
    );
  }
  if (process.platform === "win32") {
    return path.join(repositoryRoot, "dist", "win-unpacked", "NarraStage.exe");
  }
  return path.join(repositoryRoot, "dist", "linux-unpacked", "narrastage");
}

const repositoryRoot = path.resolve(import.meta.dir, "..");
const executable = packagedExecutable(repositoryRoot);
await access(executable);
const userDataDirectory = await mkdtemp(path.join(tmpdir(), "narrastage-packaged-probe."));
const legacyDataDirectory = path.join(userDataDirectory, "data");
const legacyRendererCanary = "legacy-vue-renderer-canary";
const customVendorCanary = "custom-vendor-survives-upgrade";
const editedSkillCanary = "edited-skill-survives-upgrade";
await Promise.all([
  mkdir(path.join(legacyDataDirectory, "web"), { recursive: true }),
  mkdir(path.join(legacyDataDirectory, "oss"), { recursive: true }),
  cp(path.join(repositoryRoot, "data", "vendor"), path.join(legacyDataDirectory, "vendor"), {
    recursive: true,
  }),
  cp(path.join(repositoryRoot, "data", "skills"), path.join(legacyDataDirectory, "skills"), {
    recursive: true,
  }),
  cp(path.join(repositoryRoot, "data", "models"), path.join(legacyDataDirectory, "models"), {
    recursive: true,
  }),
  cp(path.join(repositoryRoot, "data", "assets"), path.join(legacyDataDirectory, "assets"), {
    recursive: true,
  }),
  cp(path.join(repositoryRoot, "data", "contracts"), path.join(legacyDataDirectory, "contracts"), {
    recursive: true,
  }),
]);
await Promise.all([
  writeFile(path.join(legacyDataDirectory, "version.txt"), "2.0.0\n", "utf8"),
  writeFile(path.join(legacyDataDirectory, "web", "index.html"), legacyRendererCanary, "utf8"),
  copyFile(
    path.join(repositoryRoot, "data/skills/art_skills/2D_90s_japanese_anime/images/1.png"),
    path.join(legacyDataDirectory, "oss", "upgrade-probe.png"),
  ),
  writeFile(
    path.join(legacyDataDirectory, "vendor", "custom-probe.ts"),
    `${await readFile(path.join(repositoryRoot, "data", "vendor", "null.ts"), "utf8")}\n// ${customVendorCanary}\n`,
    "utf8",
  ),
  writeFile(
    path.join(legacyDataDirectory, "skills", "script_agent_decision.md"),
    editedSkillCanary,
    "utf8",
  ),
]);

const legacyDatabase = knex({
  client: "sqlite3",
  connection: { filename: path.join(legacyDataDirectory, "db2.sqlite") },
  useNullAsDefault: true,
});
await legacyDatabase.schema.createTable("o_vendorConfig", (table) => {
  table.string("id").primary();
  table.text("inputValues");
  table.text("models");
  table.integer("enable");
});
await legacyDatabase("o_vendorConfig").insert({
  id: "custom-probe",
  inputValues: "{}",
  models: "[]",
  enable: 1,
});
await legacyDatabase.destroy();
const child = Bun.spawn([executable], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    NODE_ENV: "prod",
    NARRASTAGE_USER_DATA_DIR: userDataDirectory,
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
  const loginResponse = await fetch(`http://localhost:${port}/api/login/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const login = (await loginResponse.json()) as { data?: { token?: string } };
  if (!loginResponse.ok || !login.data?.token) throw new Error("packaged login probe failed");
  const ownedAssetBytes = await readFile(
    path.join(repositoryRoot, "data/skills/art_skills/2D_90s_japanese_anime/images/1.png"),
  );
  const uploadResponse = await fetch(`http://localhost:${port}/api/v2/media-assets/upload`, {
    method: "PUT",
    headers: {
      Authorization: login.data.token,
      "X-NarraStage-Media-Type": "image/png",
      "X-NarraStage-Filename": "packaged-owned-asset.png",
    },
    body: ownedAssetBytes,
  });
  const upload = (await uploadResponse.json()) as { data?: { assetId?: string } };
  if (!uploadResponse.ok || !upload.data?.assetId) {
    throw new Error("packaged owned asset upload failed");
  }
  const ownedAssetResponse = await fetch(
    `http://localhost:${port}/api/v2/media-assets/${encodeURIComponent(upload.data.assetId)}/content`,
    { headers: { Authorization: login.data.token } },
  );
  const ownedAsset = await ownedAssetResponse.arrayBuffer();
  const vendorResponse = await fetch(
    `http://localhost:${port}/api/setting/vendorConfig/getVendorList`,
    {
      method: "POST",
      headers: { Authorization: login.data.token },
    },
  );
  const vendors = (await vendorResponse.json()) as { data?: Array<{ id?: string }> };
  const [metaResponse, thumbnailResponse, renderer, installedVersion, customVendor, editedSkill] =
    await Promise.all([
      fetch(`http://localhost:${port}/api/meta`),
      fetch(`http://localhost:${port}/oss/upgrade-probe.png?size=20`),
      readFile(path.join(legacyDataDirectory, "web", "index.html"), "utf8"),
      readFile(path.join(legacyDataDirectory, "version.txt"), "utf8").then((value) => value.trim()),
      readFile(path.join(legacyDataDirectory, "vendor", "custom-probe.ts"), "utf8"),
      readFile(path.join(legacyDataDirectory, "skills", "script_agent_decision.md"), "utf8"),
    ]);
  const meta = (await metaResponse.json()) as { contractVersion?: unknown };
  const thumbnail = await thumbnailResponse.arrayBuffer();
  if (!metaResponse.ok || meta.contractVersion !== "2.0.0") {
    throw new Error(`packaged API metadata probe failed (${metaResponse.status})`);
  }
  if (!thumbnailResponse.ok || thumbnail.byteLength === 0) {
    throw new Error(`packaged Node thumbnail probe failed (${thumbnailResponse.status})`);
  }
  if (!ownedAssetResponse.ok || ownedAsset.byteLength !== ownedAssetBytes.byteLength) {
    throw new Error(`packaged Node owned asset probe failed (${ownedAssetResponse.status})`);
  }
  if (renderer.includes(legacyRendererCanary) || installedVersion !== "2.1.0") {
    throw new Error(
      `packaged 2.0.0 runtime data was not upgraded to the React 2.1.0 payload (version=${installedVersion}, legacyRenderer=${renderer.includes(legacyRendererCanary)})`,
    );
  }
  if (
    !vendorResponse.ok ||
    !vendors.data?.some((vendor) => vendor.id === "custom-probe") ||
    !customVendor.includes(customVendorCanary) ||
    editedSkill !== editedSkillCanary
  ) {
    throw new Error("packaged upgrade did not preserve custom vendor, database row, and skill");
  }
  console.log(
    JSON.stringify({
      packaged: true,
      renderer: true,
      isolatedUserData: true,
      upgradedFrom: "2.0.0",
      apiMeta: true,
      nodeThumbnail: true,
      nodeOwnedAsset: true,
      mutableDataPreserved: true,
    }),
  );
} finally {
  child.kill();
  await child.exited;
  await rm(userDataDirectory, { recursive: true, force: true });
}
