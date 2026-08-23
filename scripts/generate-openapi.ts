import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpenApiArtifact } from "@/contracts/v2/openapi";

const target = path.resolve(import.meta.dir, "../data/contracts/openapi.v2.json");
const artifact = createOpenApiArtifact();

if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== artifact.json) {
    throw new Error("OpenAPI artifact is stale; run bun run openapi:generate");
  }
} else {
  await writeFile(target, artifact.json, "utf8");
}
