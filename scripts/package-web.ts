import { createHash } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBuildManifest, sha256Text } from "@/contracts/buildManifest";

async function command(cwd: string, executable: string, args: string[], env?: NodeJS.ProcessEnv) {
  const process = Bun.spawn([executable, ...args], {
    cwd,
    env: env ?? globalThis.process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed (${exitCode})\n${stderr || stdout}`);
  }
  return stdout;
}

export interface RepositoryRevisionScope {
  includedFiles?: ReadonlySet<string>;
  includedPrefixes?: readonly string[];
  excludedFiles?: ReadonlySet<string>;
  excludedPrefixes?: readonly string[];
}

export const backendRevisionScope: RepositoryRevisionScope = {
  includedFiles: new Set([
    "package.json",
    "bun.lock",
    "tsconfig.json",
    "tsconfig.base.json",
    "electron-builder.yml",
    "Dockerfile",
    "data/contracts/openapi.v2.json",
  ]),
  includedPrefixes: ["apps/server/", "apps/desktop/", "scripts/", "data/vendor/"],
  excludedPrefixes: ["data/serve/", "apps/web/"],
};

export const webRevisionScope: RepositoryRevisionScope = {
  includedFiles: new Set(["package.json", "bun.lock", "tsconfig.base.json"]),
  includedPrefixes: ["apps/web/", "packages/contracts/"],
  excludedPrefixes: ["apps/web/dist/", "apps/web/coverage/"],
};

export async function repositoryContentRevision(
  repositoryRoot: string,
  scope: RepositoryRevisionScope,
): Promise<string> {
  const listed = await command(repositoryRoot, "git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const files = listed
    .split("\0")
    .filter(Boolean)
    .filter((entry) => {
      const included =
        scope.includedFiles?.has(entry) ||
        scope.includedPrefixes?.some((prefix) => entry.startsWith(prefix));
      if (!included) return false;
      return (
        !scope.excludedFiles?.has(entry) &&
        !scope.excludedPrefixes?.some((prefix) => entry.startsWith(prefix))
      );
    })
    .sort();
  const digest = createHash("sha256");
  for (const file of files) {
    const contents = await readFile(path.join(repositoryRoot, file)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      },
    );
    if (!contents) continue;
    digest.update(file);
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  const contentDigest = digest.digest("hex");
  return `content-${contentDigest.slice(0, 40)}+tree.${contentDigest.slice(0, 16)}`;
}

export async function packageWeb(): Promise<void> {
  const backendRoot = path.resolve(import.meta.dir, "..");
  const webRoot = path.join(backendRoot, "apps/web");
  const openapiPath = path.join(backendRoot, "data/contracts/openapi.v2.json");
  const generatedClientPath = path.join(backendRoot, "packages/contracts/src/generated/v2.ts");
  const generatedSourcePath = path.join(
    backendRoot,
    "packages/contracts/src/generated/source.json",
  );
  const [openapi, generatedClient, generatedSource, dependencyLock, backendRevision, webRevision] =
    await Promise.all([
      readFile(openapiPath),
      readFile(generatedClientPath),
      readFile(generatedSourcePath, "utf8").then(
        (value) =>
          JSON.parse(value) as {
            contractVersion: string;
            openapiSha256: string;
            generatedClientSha256: string;
          },
      ),
      readFile(path.join(backendRoot, "bun.lock")),
      repositoryContentRevision(backendRoot, backendRevisionScope),
      repositoryContentRevision(backendRoot, webRevisionScope),
    ]);

  const openapiSha256 = sha256Text(openapi);
  const generatedClientSha256 = sha256Text(generatedClient);
  if (
    generatedSource.openapiSha256 !== openapiSha256 ||
    generatedSource.generatedClientSha256 !== generatedClientSha256
  ) {
    throw new Error("generated Web API client does not match the backend OpenAPI artifact");
  }

  const supportedContractRange = `^${generatedSource.contractVersion}`;
  await command(webRoot, "bun", ["run", "build-only"], {
    ...globalThis.process.env,
    VITE_NARRASTAGE_WEB_REVISION: webRevision,
    VITE_NARRASTAGE_CONTRACT_RANGE: supportedContractRange,
    VITE_NARRASTAGE_OPENAPI_SHA256: openapiSha256,
    VITE_NARRASTAGE_GENERATED_CLIENT_SHA256: generatedClientSha256,
  });

  const bundlePath = path.join(webRoot, "dist/index.html");
  const bundle = Buffer.from(
    (await readFile(bundlePath, "utf8")).replace(/[ \t]+(?=\r?$)/gm, ""),
    "utf8",
  );
  const manifest = createBuildManifest({
    backendRevision,
    webRevision,
    contractVersion: generatedSource.contractVersion,
    openapiSha256,
    supportedContractRange,
    generatedClientSha256,
    dependencyLockSha256: sha256Text(dependencyLock),
    webBundleSha256: sha256Text(bundle),
  });
  const targetBundle = path.join(backendRoot, "data/web/index.html");
  const targetManifest = path.join(backendRoot, "data/contracts/web-build.json");
  const temporaryBundle = `${targetBundle}.next`;
  const temporaryManifest = `${targetManifest}.next`;
  try {
    await writeFile(temporaryBundle, bundle);
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporaryBundle, targetBundle);
    await rename(temporaryManifest, targetManifest);
  } finally {
    await Promise.all([
      unlink(temporaryBundle).catch(() => undefined),
      unlink(temporaryManifest).catch(() => undefined),
    ]);
  }
}

if (import.meta.main) {
  await packageWeb();
}
