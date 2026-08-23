import fg from "fast-glob";
import path from "node:path";

type PackageManifest = {
  name?: string;
  workspaces?: string[];
  devDependencies?: Record<string, string>;
};

const requiredApplications = ["apps/server", "apps/web", "apps/desktop"] as const;
const requiredPackages = ["packages/contracts"] as const;

function parseMajor(version: string): number | undefined {
  const match = version.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

export async function collectWorkspaceViolations(repositoryRoot: string): Promise<string[]> {
  const violations: string[] = [];
  const rootManifest = (await Bun.file(
    path.join(repositoryRoot, "package.json"),
  ).json()) as PackageManifest;
  if (JSON.stringify(rootManifest.workspaces) !== JSON.stringify(["apps/*", "packages/*"])) {
    violations.push("root workspaces must be apps/* and packages/*");
  }

  for (const relativePath of [...requiredApplications, ...requiredPackages]) {
    if (!(await Bun.file(path.join(repositoryRoot, relativePath, "package.json")).exists())) {
      violations.push(`${relativePath}/package.json is required`);
    }
  }

  const lockfiles = await fg(
    ["**/bun.lock", "**/yarn.lock", "**/package-lock.json", "**/pnpm-lock.yaml"],
    {
      cwd: repositoryRoot,
      ignore: ["**/node_modules/**", "**/dist/**"],
    },
  );
  for (const lockfile of lockfiles) {
    if (lockfile !== "bun.lock") violations.push(`secondary lockfile is forbidden: ${lockfile}`);
  }
  if (!lockfiles.includes("bun.lock")) violations.push("root bun.lock is required");

  const manifests = await fg(["package.json", "apps/*/package.json", "packages/*/package.json"], {
    cwd: repositoryRoot,
  });
  for (const manifestPath of manifests) {
    const manifest = (await Bun.file(
      path.join(repositoryRoot, manifestPath),
    ).json()) as PackageManifest;
    const selected = manifest.devDependencies?.typescript;
    if (selected && (parseMajor(selected) ?? 0) < 7) {
      violations.push(`${manifestPath} selects TypeScript below 7: ${selected}`);
    }
  }

  const coupledFiles = [
    "package.json",
    ".github/workflows/release.yml",
    "scripts/package-web.ts",
    "scripts/check-web-provenance.ts",
  ];
  for (const relativePath of coupledFiles) {
    const file = Bun.file(path.join(repositoryRoot, relativePath));
    if (!(await file.exists())) continue;
    const source = await file.text();
    for (const forbidden of ["../Toonflow-web", "HBAI-Ltd/Toonflow-web", "corepack yarn"]) {
      if (source.includes(forbidden)) violations.push(`${relativePath} contains ${forbidden}`);
    }
  }

  return violations;
}

if (import.meta.main) {
  const repositoryRoot = path.resolve(import.meta.dir, "..");
  const violations = await collectWorkspaceViolations(repositoryRoot);
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exit(1);
  }
  console.log("Workspace topology valid (3 apps, 1 shared package, one lockfile)");
}
