import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const openapiPath = path.resolve(repositoryRoot, "../Toonflow-app/data/contracts/openapi.v2.json");
const generatedPath = path.resolve(repositoryRoot, "src/api/generated/v2.ts");
const sourcePath = path.resolve(repositoryRoot, "src/api/generated/source.json");
const [openapi, generated] = await Promise.all([readFile(openapiPath), readFile(generatedPath)]);
const document = JSON.parse(openapi.toString("utf8")) as {
  info: { version: string };
};

await writeFile(
  sourcePath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      contractVersion: document.info.version,
      openapiSha256: sha256(openapi),
      generatedClientSha256: sha256(generated),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
