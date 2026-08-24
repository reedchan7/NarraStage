import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "narrastage-server-probe."));
const temporaryData = path.join(temporaryRoot, "data");
const previousDataDirectory = process.env.NARRASTAGE_DATA_DIR;
const previousNodeEnvironment = process.env.NODE_ENV;
let started = false;
let destroyDatabase: (() => Promise<void>) | undefined;
let probeSocket: ReturnType<typeof io> | undefined;

try {
  await cp(path.join(repositoryRoot, "data"), temporaryData, { recursive: true });
  process.env.NARRASTAGE_DATA_DIR = temporaryData;
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
  const allowedOrigin = `http://localhost:${port}`;
  const corsResponse = await fetch(`http://localhost:${port}/api/meta`, {
    headers: { origin: allowedOrigin },
  });
  if (
    corsResponse.status !== 200 ||
    corsResponse.headers.get("access-control-allow-origin") !== allowedOrigin
  ) {
    throw new Error("runtime.probe_cors_contract");
  }
  const blockedOrigin = await fetch(`http://localhost:${port}/api/meta`, {
    headers: { origin: "https://malicious.example" },
  });
  if (blockedOrigin.status !== 403) throw new Error("runtime.probe_origin_rejection");
  const renderer = await fetch(`http://localhost:${port}/`);
  if (renderer.status !== 200 || !(await renderer.text()).includes("<title>NarraStage</title>")) {
    throw new Error("runtime.probe_renderer_missing");
  }
  const tokenSetting = await db("o_setting").where("key", "tokenKey").select("value").first();
  if (!tokenSetting?.value) throw new Error("runtime.probe_token_key_missing");
  probeSocket = io(`http://localhost:${port}/api/socket/scriptAgent`, {
    auth: {
      isolationKey: "runtime-probe",
      projectId: 0,
      token: jwt.sign({ id: 1 }, tokenSetting.value as string),
    },
    transports: ["websocket"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("runtime.probe_socket_timeout")), 3_000);
    probeSocket!.once("connect_error", reject);
    probeSocket!.once("connect", () => {
      setTimeout(() => {
        clearTimeout(timeout);
        probeSocket!.connected ? resolve() : reject(new Error("runtime.probe_socket_rejected"));
      }, 100);
    });
  });
  probeSocket.disconnect();
  console.log(
    JSON.stringify({
      port,
      meta,
      isolatedData: true,
      socket: true,
      staticRenderer: true,
      originPolicy: true,
    }),
  );
  await server.closeServe();
  started = false;
} finally {
  probeSocket?.disconnect();
  if (started) {
    const server = await import("@/app");
    await server.closeServe().catch(() => undefined);
  }
  await destroyDatabase?.();
  if (previousDataDirectory === undefined) delete process.env.NARRASTAGE_DATA_DIR;
  else process.env.NARRASTAGE_DATA_DIR = previousDataDirectory;
  if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnvironment;
  await rm(temporaryRoot, { recursive: true, force: true });
}
