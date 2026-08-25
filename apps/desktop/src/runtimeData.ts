import fs from "node:fs";
import path from "node:path";

export interface RuntimeProvenance {
  backendRevision: string;
  webRevision: string;
  webBundleSha256: string;
}

export const IMMUTABLE_RUNTIME_ENTRIES = ["assets", "contracts", "models", "serve", "web"] as const;
export const MUTABLE_RUNTIME_ENTRIES = ["skills", "vendor"] as const;
export const RUNTIME_PROVENANCE_STAMP = "runtime-provenance.json";

export function compareVersions(a: string, b: string): number {
  const pa = a
    .split(".")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  const pb = b
    .split(".")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function shouldReplaceImmutableRuntime(
  localVersion: string | undefined,
  appVersion: string,
  localProvenance: RuntimeProvenance | undefined,
  packagedProvenance: RuntimeProvenance | undefined,
): boolean {
  if (!localVersion) return true;
  if (compareVersions(localVersion, appVersion) < 0) return true;
  if (compareVersions(localVersion, appVersion) > 0) return false;
  if (!packagedProvenance) return false;
  if (!localProvenance) return true;
  return (
    localProvenance.backendRevision !== packagedProvenance.backendRevision ||
    localProvenance.webRevision !== packagedProvenance.webRevision ||
    localProvenance.webBundleSha256 !== packagedProvenance.webBundleSha256
  );
}

export function runtimeProvenanceFromUnknown(value: unknown): RuntimeProvenance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.backendRevision !== "string" ||
    record.backendRevision.length === 0 ||
    typeof record.webRevision !== "string" ||
    record.webRevision.length === 0 ||
    typeof record.webBundleSha256 !== "string" ||
    record.webBundleSha256.length === 0
  ) {
    return undefined;
  }
  return {
    backendRevision: record.backendRevision,
    webRevision: record.webRevision,
    webBundleSha256: record.webBundleSha256,
  };
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.existsSync(d) || fs.copyFileSync(s, d);
  }
}

function readProvenanceFile(filePath: string): RuntimeProvenance | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return runtimeProvenanceFromUnknown(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch {
    return undefined;
  }
}

export function initializeRuntimeData(input: {
  packagedDataDir: string;
  userDataDir: string;
  appVersion: string;
}): void {
  const versionFilePath = path.join(input.userDataDir, "version.txt");
  const stampPath = path.join(input.userDataDir, RUNTIME_PROVENANCE_STAMP);
  let localVersion: string | undefined;
  try {
    if (fs.existsSync(versionFilePath)) {
      localVersion = fs.readFileSync(versionFilePath, "utf-8").trim() || undefined;
    }
  } catch {
    localVersion = undefined;
  }
  const packagedProvenance = readProvenanceFile(
    path.join(input.packagedDataDir, "contracts", "web-build.json"),
  );
  const shouldForceReplace = shouldReplaceImmutableRuntime(
    localVersion,
    input.appVersion,
    readProvenanceFile(stampPath),
    packagedProvenance,
  );

  for (const dir of IMMUTABLE_RUNTIME_ENTRIES) {
    const targetDir = path.join(input.userDataDir, dir);
    if (shouldForceReplace) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      copyDir(path.join(input.packagedDataDir, dir), targetDir);
      continue;
    }
    if (!fs.existsSync(targetDir)) {
      copyDir(path.join(input.packagedDataDir, dir), targetDir);
    }
  }

  for (const dir of MUTABLE_RUNTIME_ENTRIES) {
    copyDir(path.join(input.packagedDataDir, dir), path.join(input.userDataDir, dir));
  }

  if (shouldForceReplace) {
    fs.mkdirSync(input.userDataDir, { recursive: true });
    fs.writeFileSync(versionFilePath, `${input.appVersion}\n`, "utf-8");
    if (packagedProvenance) {
      fs.writeFileSync(stampPath, `${JSON.stringify(packagedProvenance, null, 2)}\n`, "utf-8");
    }
  }
}
