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

export async function repositoryContentRevision(
  repositoryRoot: string,
  excluded: ReadonlySet<string>,
  excludedPrefixes: readonly string[] = [],
): Promise<string> {
  const [head, listed] = await Promise.all([
    command(repositoryRoot, "git", ["rev-parse", "HEAD"]),
    command(repositoryRoot, "git", [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ]),
  ]);
  const files = listed
    .split("\0")
    .filter(Boolean)
    .filter(
      (entry) =>
        !excluded.has(entry) && !excludedPrefixes.some((prefix) => entry.startsWith(prefix)),
    )
    .sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update("\0");
    digest.update(await readFile(path.join(repositoryRoot, file)));
    digest.update("\0");
  }
  return `${head.trim()}+tree.${digest.digest("hex").slice(0, 16)}`;
}

export async function packageWeb(webRoot: string): Promise<void> {
  const backendRoot = path.resolve(import.meta.dir, "..");
  const openapiPath = path.join(backendRoot, "data/contracts/openapi.v2.json");
  const generatedClientPath = path.join(webRoot, "src/api/generated/v2.ts");
  const generatedSourcePath = path.join(webRoot, "src/api/generated/source.json");
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
      readFile(path.join(webRoot, "yarn.lock")),
      repositoryContentRevision(
        backendRoot,
        new Set(["data/contracts/web-build.json", "data/web/index.html"]),
        ["build/", "data/serve/", "docs/"],
      ),
      repositoryContentRevision(
        webRoot,
        new Set(["src/types/auto-imports.d.ts", "src/types/components.d.ts"]),
        ["dist/"],
      ),
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
  await command(webRoot, "corepack", ["yarn", "build-only"], {
    ...globalThis.process.env,
    VITE_TOONFLOW_WEB_REVISION: webRevision,
    VITE_TOONFLOW_CONTRACT_RANGE: supportedContractRange,
    VITE_TOONFLOW_OPENAPI_SHA256: openapiSha256,
    VITE_TOONFLOW_GENERATED_CLIENT_SHA256: generatedClientSha256,
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
  const webRoot = process.argv[2];
  if (!webRoot) throw new Error("usage: bun scripts/package-web.ts <Toonflow-web-root>");
  await packageWeb(path.resolve(webRoot));
}
