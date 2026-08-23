// import "./logger";
import "./err";
import "./env";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Server as NodeServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { logger } from "hono/logger";
import isPathInside from "is-path-inside";
import jwt from "jsonwebtoken";
import type { Knex } from "knex";
import { Server as SocketServer } from "socket.io";
import { AssetGateway } from "@/assets/assetGateway";
import { OwnedMediaAssetResolver } from "@/assets/mediaAssetRepository";
import { configureMediaAssetRuntime } from "@/assets/runtime";
import buildRoute from "@/core";
import {
  configureGenerationRuntime,
  startGenerationWorker,
  stopGenerationWorker,
} from "@/generation/runtime";
import { LegacyHttpApplication, type HonoEnvironment } from "@/http/compat";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { configureOfferingAvailabilityRuntime } from "@/providers/availability/offeringAvailability";
import {
  configureProviderConnectionProbeRuntime,
  ProviderConnectionProbe,
} from "@/providers/availability/connectionProbe";
import {
  configureProviderHealthRuntime,
  ProviderHealthMonitor,
} from "@/providers/availability/providerHealth";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { configureProviderFileLedger } from "@/providers/files/providerFileLedger";
import { configureLanguageExecutionRuntime } from "@/providers/languageExecutionService";
import { configureProviderRuntime } from "@/providers/runtime";
import { productEvidenceDocumentSchema } from "@/release/evidence";
import { resolveLocalApiPolicy } from "@/security/localApiPolicy";
import { migrateLegacyCredentials } from "@/security/credentials/legacyCredentialMigration";
import { configureCredentialVault, getCredentialVault } from "@/security/credentials/runtime";
import type { CredentialVault } from "@/security/credentials/types";
import socketInit from "@/socket/index";
import u from "@/utils";
import { databaseReady, db } from "@/utils/db";
import { isEletron } from "@/utils/getPath";
import { ensureThumbnail, type ThumbnailSize } from "@/utils/image";
import { isPublicApiPath } from "@/security/publicRoutes";

let server: NodeServer | undefined;
let socketServer: SocketServer | undefined;

async function checkPermissions(): Promise<boolean> {
  if (!isEletron()) return true;
  const userDataPath = u.getPath();
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    const testFile = path.join(userDataPath, ".access_test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    const { dialog, app } = await import("electron");
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "权限不足",
      message: "应用无法访问数据目录",
      detail: `无法读写以下目录：\n${userDataPath}\n\n请联系管理员授予权限，或以管理员身份运行本程序。`,
      buttons: ["确认退出"],
      defaultId: 0,
    });
    if (response === 0) app.quit();
    return false;
  }
}

export interface StartServeOptions {
  randomPort?: boolean;
  credentialVault?: CredentialVault;
  credentialMigrationVault?: CredentialVault;
}

async function legacyCredentialDescriptors() {
  const declaredSlots = new Map(
    builtinCatalog.providers.map((provider) => [
      provider.id,
      provider.credentialSlots.map((descriptor) => descriptor.slot),
    ]),
  );
  const rows = await db("o_vendorConfig").select("id");
  return rows.flatMap((row) => {
    if (!row.id) return [];
    const slots = new Set<string>(declaredSlots.get(row.id) ?? []);
    try {
      const vendor = u.vendor.getVendor(row.id) as {
        inputs?: Array<{ key?: unknown; type?: unknown }>;
      };
      for (const input of vendor.inputs ?? []) {
        if (input.type === "password" && typeof input.key === "string") slots.add(input.key);
      }
    } catch {
      if (slots.size === 0) return [];
    }
    return slots.size > 0 ? [{ providerId: row.id, slots: [...slots] }] : [];
  });
}

function thumbnailOptions(size: string): { directory: string; options: ThumbnailSize } | undefined {
  const dimensions = size.match(/^(\d+)x(\d+)$/i);
  if (dimensions) {
    const width = Number.parseInt(dimensions[1]!, 10);
    const height = Number.parseInt(dimensions[2]!, 10);
    return { directory: `${width}x${height}`, options: { type: "dimensions", width, height } };
  }
  const percentage = size.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (!percentage) return undefined;
  return {
    directory: `${percentage[1]}p`,
    options: { type: "percentage", value: Number.parseFloat(percentage[1]!) },
  };
}

function staticRoute(root: string, prefix: string) {
  return serveStatic<HonoEnvironment>({
    root,
    rewriteRequestPath(requestPath) {
      return requestPath.slice(prefix.length) || "/";
    },
  });
}

async function createHttpApplication(
  localApiPolicy: ReturnType<typeof resolveLocalApiPolicy>,
): Promise<Hono<HonoEnvironment>> {
  const app = new Hono<HonoEnvironment>();
  app.use("*", logger());
  app.use("*", async (context, next) => {
    const origin = context.req.header("origin");
    if (!localApiPolicy.isOriginAllowed(origin)) {
      return context.json({ message: "Origin not allowed" }, 403);
    }
    if (origin) {
      context.env.outgoing.setHeader("access-control-allow-origin", origin);
      context.env.outgoing.setHeader(
        "access-control-allow-headers",
        context.req.header("access-control-request-headers") ?? "content-type, authorization",
      );
      context.env.outgoing.setHeader(
        "access-control-allow-methods",
        "GET,HEAD,POST,PUT,PATCH,DELETE",
      );
      context.env.outgoing.setHeader("vary", "Origin");
      if (context.req.method === "OPTIONS") return context.body(null, 204);
    }
    return next();
  });

  const ossDirectory = u.getPath("oss");
  const skillsDirectory = u.getPath("skills");
  const assetsDirectory = u.getPath("assets");
  for (const directory of [ossDirectory, skillsDirectory, assetsDirectory]) {
    fs.mkdirSync(directory, { recursive: true });
    console.log("文件目录:", directory);
  }

  app.get("/oss/*", async (context, next) => {
    const requestedSize = context.req.query("size");
    const selected = requestedSize ? thumbnailOptions(requestedSize) : undefined;
    if (!selected) return next();
    const relativePath = decodeURIComponent(context.req.path.slice("/oss/".length));
    const originalPath = path.resolve(ossDirectory, relativePath);
    if (!isPathInside(originalPath, ossDirectory)) {
      return context.json({ message: "asset.path_escape" }, 403);
    }
    const extension = path.extname(relativePath);
    const thumbnailPath = path.join(
      ossDirectory,
      "smallImage",
      path.dirname(relativePath),
      `${path.basename(relativePath, extension)}_${selected.directory}${extension}`,
    );
    const result = await ensureThumbnail(originalPath, thumbnailPath, selected.options);
    return result ? new Response(Bun.file(result)) : next();
  });
  app.use("/oss/*", staticRoute(ossDirectory, "/oss"));
  app.use("/skills/*", async (context, next) => {
    return /\.(jpe?g|png|gif|webp|svg|ico|bmp)$/i.test(context.req.path)
      ? next()
      : context.body(null, 403);
  });
  app.use("/skills/*", staticRoute(skillsDirectory, "/skills"));
  app.use("/assets/*", staticRoute(assetsDirectory, "/assets"));

  const webDirectory = u.getPath("web");
  if (fs.existsSync(webDirectory)) {
    console.log("静态网站目录:", webDirectory);
    app.use("*", serveStatic<HonoEnvironment>({ root: webDirectory }));
  } else {
    console.warn("静态网站目录不存在:", webDirectory);
  }

  app.use("/api/*", async (context, next) => {
    const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
    if (!setting) {
      return new Response(JSON.stringify({ message: "服务器秘钥未配置，请联系管理员" }), {
        headers: { "content-type": "application/json; charset=utf-8" },
        status: 444,
      });
    }
    if (isPublicApiPath(context.req.path, context.req.method)) return next();
    const rawToken = context.req.header("authorization") || context.req.query("token") || "";
    const token = rawToken.replace("Bearer ", "");
    if (!token) return context.json({ message: "未提供token" }, 401);
    try {
      context.set("user", jwt.verify(token, setting.value as string));
      return next();
    } catch {
      return context.json({ message: "无效的token" }, 401);
    }
  });

  const router = await import("@/router");
  await router.default(new LegacyHttpApplication(app));
  app.notFound((context) => context.json({ message: "API 404 Not Found" }, 404));
  app.onError((error, context) => {
    console.error(error);
    const status = "status" in error && typeof error.status === "number" ? error.status : 500;
    return new Response(JSON.stringify({ message: error.message }), {
      headers: { "content-type": "application/json; charset=utf-8" },
      status,
    });
  });
  return app;
}

export default async function startServe(input: boolean | StartServeOptions = false) {
  const options = typeof input === "boolean" ? { randomPort: input } : input;
  if (!(await checkPermissions())) throw new Error("runtime.data_directory_unavailable");
  await databaseReady;

  const credentialVault = options.credentialVault ?? getCredentialVault();
  configureCredentialVault(credentialVault);
  await runProviderPlatformMigrations(db as unknown as Knex);
  const providerAssetDirectory = u.getPath("provider-assets");
  const mediaAssetRepository = configureMediaAssetRuntime(
    db as unknown as Knex,
    providerAssetDirectory,
  );
  const ownedAssetResolver = new OwnedMediaAssetResolver(mediaAssetRepository);
  const providerRegistry = configureProviderRuntime(credentialVault, {
    assetResolver: ownedAssetResolver,
    fileAssetResolver: ownedAssetResolver,
  });
  configureProviderFileLedger(db as unknown as Knex);
  const providerHealth = configureProviderHealthRuntime(new ProviderHealthMonitor());
  configureProviderConnectionProbeRuntime(
    new ProviderConnectionProbe({ credentialVault, healthMonitor: providerHealth }),
  );
  const productEvidence = productEvidenceDocumentSchema.parse(
    JSON.parse(fs.readFileSync(u.getPath("contracts/provider-release-evidence.json"), "utf8")),
  );
  const offeringAvailability = configureOfferingAvailabilityRuntime(
    builtinCatalog,
    providerRegistry,
    credentialVault,
    {
      providerHealth: (offeringId) => providerHealth.get(offeringId),
      productEvidence: (offeringId) =>
        productEvidence.records.find((record) => record.offeringId === offeringId),
    },
  );
  configureLanguageExecutionRuntime(providerRegistry, builtinCatalog, offeringAvailability);
  const generationRuntime = configureGenerationRuntime(db as unknown as Knex, undefined, {
    registry: providerRegistry,
    availability: offeringAvailability,
    assetGateway: new AssetGateway({
      rootDirectory: providerAssetDirectory,
      credentialVault,
    }),
    mediaAssetRepository,
  });
  await migrateLegacyCredentials(
    db as unknown as Knex,
    options.credentialMigrationVault ?? credentialVault,
    await legacyCredentialDescriptors(),
  );
  await startGenerationWorker();
  await u.writeVersion();

  const localApiPolicy = resolveLocalApiPolicy({
    runtime: isEletron() ? "desktop" : "standalone",
    nodeEnv: process.env.NODE_ENV ?? "prod",
    env: process.env,
  });
  if (process.env.NODE_ENV === "dev") await buildRoute();
  const app = await createHttpApplication(localApiPolicy);
  server = createAdaptorServer({ fetch: app.fetch, hostname: localApiPolicy.host }) as NodeServer;
  socketServer = new SocketServer(server, {
    cors: {
      credentials: false,
      origin(origin, callback) {
        callback(null, localApiPolicy.isOriginAllowed(origin));
      },
    },
  });
  socketInit(socketServer, generationRuntime.changes);

  const requestedPort = options.randomPort ? 0 : 10588;
  return new Promise<number>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(requestedPort, localApiPolicy.host, () => {
      const address = server!.address();
      const realPort = typeof address === "string" ? undefined : address?.port;
      if (typeof realPort !== "number") return reject(new Error("runtime.port_unavailable"));
      localApiPolicy.registerListeningPort(realPort);
      console.log(`[服务启动成功]: http://localhost:${realPort}`);
      resolve(realPort);
    });
  });
}

export async function closeServe(): Promise<void> {
  await stopGenerationWorker();
  socketServer?.disconnectSockets(true);
  if (socketServer) {
    await new Promise<void>((resolve) => socketServer!.close(() => resolve()));
  }
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
  }
  socketServer = undefined;
  server = undefined;
  console.log("[服务已关闭]");
}

if (import.meta.main && !isEletron()) await startServe();
