import fg from "fast-glob";
import path from "node:path";

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function packageNames(manifestPath: string): Promise<string[]> {
  const manifest = (await Bun.file(manifestPath).json()) as Manifest;
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
}

export async function collectForbiddenFrameworks(
  repositoryRoot: string,
  serverOnly: boolean,
): Promise<string[]> {
  const failures: string[] = [];
  const rootPackages = await packageNames(path.join(repositoryRoot, "package.json"));
  for (const dependency of ["express", "express-ws", "@types/express", "@types/express-ws"]) {
    if (rootPackages.includes(dependency))
      failures.push(`server dependency is forbidden: ${dependency}`);
  }
  const serverSources = await fg(["apps/server/**/*.{ts,tsx}", "apps/desktop/**/*.{ts,tsx}"], {
    absolute: true,
    cwd: repositoryRoot,
  });
  for (const sourcePath of serverSources) {
    const source = await Bun.file(sourcePath).text();
    if (/from\s+["']express(?:-ws)?["']|require\(["']express(?:-ws)?["']\)/.test(source)) {
      failures.push(`server source imports Express: ${path.relative(repositoryRoot, sourcePath)}`);
    }
  }

  if (!serverOnly) {
    const webPackages = await packageNames(path.join(repositoryRoot, "apps/web/package.json"));
    for (const dependency of webPackages) {
      if (/^(?:@vue|vue(?:-|$)|pinia(?:-|$))/.test(dependency)) {
        failures.push(`web dependency is forbidden: ${dependency}`);
      }
    }
    const vueFiles = await fg(["apps/web/**/*.vue"], {
      cwd: repositoryRoot,
      ignore: ["**/node_modules/**", "**/dist/**"],
    });
    for (const file of vueFiles) failures.push(`Vue source is forbidden: ${file}`);
  }
  return failures;
}

if (import.meta.main) {
  const failures = await collectForbiddenFrameworks(
    path.resolve(import.meta.dir, ".."),
    process.argv.includes("--server"),
  );
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("Forbidden framework scan passed");
}
