import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "toonflow-server-probe."));
const temporaryData = path.join(temporaryRoot, "data");
const previousDataDirectory = process.env.TOONFLOW_DATA_DIR;
const previousNodeEnvironment = process.env.NODE_ENV;
let started = false;
let destroyDatabase: (() => Promise<void>) | undefined;

try {
  await cp(path.join(repositoryRoot, "data"), temporaryData, { recursive: true });
  process.env.TOONFLOW_DATA_DIR = temporaryData;
  process.env.NODE_ENV = "prod";

  const server = await import("@/app");
  const { db } = await import("@/utils/db");
  destroyDatabase = () => db.destroy();
  const port = await server.default({ randomPort: true });
  started = true;
  const response = await fetch(`http://localhost:${port}/api/meta`);
  if (!response.ok) throw new Error(`runtime.probe_http_${response.status}`);
  const meta = (await response.json()) as Record<string, unknown>;
  for (const key of ["contractVersion", "openapiSha256", "backendRevision", "webRevision"]) {
    if (typeof meta[key] !== "string" || meta[key].length === 0) {
      throw new Error(`runtime.probe_invalid_meta:${key}`);
    }
  }
  console.log(JSON.stringify({ port, meta, isolatedData: true }));
  await server.closeServe();
  started = false;
} finally {
  if (started) {
    const server = await import("@/app");
    await server.closeServe().catch(() => undefined);
  }
  await destroyDatabase?.();
  if (previousDataDirectory === undefined) delete process.env.TOONFLOW_DATA_DIR;
  else process.env.TOONFLOW_DATA_DIR = previousDataDirectory;
  if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnvironment;
  await rm(temporaryRoot, { recursive: true, force: true });
}
