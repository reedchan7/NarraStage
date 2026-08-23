// import "./logger";
import "./err";
import "./env";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { Server } from "socket.io";
import http from "node:http";
import expressWs from "express-ws";
import logger from "morgan";
import cors from "cors";
import buildRoute from "@/core";
import path from "path";
import fs from "fs";
import u from "@/utils";
import jwt from "jsonwebtoken";
import socketInit from "@/socket/index";
import { isEletron } from "@/utils/getPath";
import { ensureThumbnail } from "@/utils/image";
import type { ThumbnailSize } from "@/utils/image";
import { isPublicApiPath } from "@/security/publicRoutes";
import { databaseReady, db } from "@/utils/db";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { configureCredentialVault, getCredentialVault } from "@/security/credentials/runtime";
import type { CredentialVault } from "@/security/credentials/types";
import { migrateLegacyCredentials } from "@/security/credentials/legacyCredentialMigration";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { resolveLocalApiPolicy } from "@/security/localApiPolicy";
import type { Knex } from "knex";
import {
  configureGenerationRuntime,
  startGenerationWorker,
  stopGenerationWorker,
} from "@/generation/runtime";
import { configureProviderRuntime } from "@/providers/runtime";
import { configureLanguageExecutionRuntime } from "@/providers/languageExecutionService";
import { configureOfferingAvailabilityRuntime } from "@/providers/availability/offeringAvailability";
import { AssetGateway } from "@/assets/assetGateway";
import { configureMediaAssetRuntime } from "@/assets/runtime";
import { OwnedMediaAssetResolver } from "@/assets/mediaAssetRepository";
import { configureProviderFileLedger } from "@/providers/files/providerFileLedger";
import {
  configureProviderHealthRuntime,
  ProviderHealthMonitor,
} from "@/providers/availability/providerHealth";
import {
  configureProviderConnectionProbeRuntime,
  ProviderConnectionProbe,
} from "@/providers/availability/connectionProbe";
import { productEvidenceDocumentSchema } from "@/release/evidence";

const app = express();
const server = http.createServer(app);

async function checkPermissions() {
  if (!isEletron()) return true;
  const userDataPath = u.getPath();
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    const testFile = path.join(userDataPath, ".access_test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
  } catch (e) {
    const { dialog, app } = await import("electron");
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "权限不足",
      message: "应用无法访问数据目录",
      detail: `无法读写以下目录：\n${userDataPath}\n\n请联系管理员授予权限，或以管理员身份运行本程序。`,
      buttons: ["确认退出"],
      defaultId: 0,
    });
    if (response === 0) {
      app.quit();
    }
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

export default async function startServe(input: boolean | StartServeOptions = false) {
  const options = typeof input === "boolean" ? { randomPort: input } : input;
  await checkPermissions();
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
  const io = new Server(server, {
    cors: {
      credentials: false,
      origin(origin, callback) {
        callback(null, localApiPolicy.isOriginAllowed(origin));
      },
    },
  });
  socketInit(io, generationRuntime.changes);

  if (process.env.NODE_ENV == "dev") await buildRoute();

  expressWs(app);

  app.use(logger("dev"));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!localApiPolicy.isOriginAllowed(origin)) {
      return res.status(403).json({ message: "Origin not allowed" });
    }
    next();
  });
  app.use(
    cors({
      credentials: false,
      origin(origin, callback) {
        callback(null, localApiPolicy.isOriginAllowed(origin));
      },
    }),
  );
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  // oss 静态资源
  const ossDir = u.getPath("oss");
  if (!fs.existsSync(ossDir)) {
    fs.mkdirSync(ossDir, { recursive: true });
  }
  console.log("文件目录:", ossDir);
  app.use(
    "/oss",
    (req, res, next) => {
      // 如果传参 type=small，则返回小图
      if (req.query.size) {
        const size = req.query.size as string;
        const smallImageBaseDir = path.join(ossDir, "smallImage");
        const originalPath = path.join(ossDir, req.path);

        // 解析 size 参数
        let sizeSubDir: string;
        let sizeOpts: ThumbnailSize | undefined;

        // 判断是否为 WIDTHxHEIGHT 格式，如 "200x300"：等比压缩到指定宽高边界
        const dimensMatch = size.match(/^(\d+)x(\d+)$/i);
        // 判断是否为百分比格式，如 "30"、"30%"：等比压缩到原图的指定百分比
        const percentMatch = size.match(/^(\d+(?:\.\d+)?)\s*%?$/);

        if (dimensMatch) {
          const w = parseInt(dimensMatch[1], 10);
          const h = parseInt(dimensMatch[2], 10);
          sizeSubDir = `${w}x${h}`;
          sizeOpts = { type: "dimensions", width: w, height: h };
        } else if (percentMatch) {
          const pct = parseFloat(percentMatch[1]);
          sizeSubDir = `${percentMatch[1]}p`;
          sizeOpts = { type: "percentage", value: pct };
        } else {
          // 无效的 size 参数，降级返回原图
          express.static(ossDir, { acceptRanges: false })(req, res, next);
          return;
        }

        const ext = path.extname(req.path);
        const base = path.basename(req.path, ext);
        const dir = path.dirname(req.path);
        const smallImagePath = path.join(smallImageBaseDir, dir, `${base}_${sizeSubDir}${ext}`);

        ensureThumbnail(originalPath, smallImagePath, sizeOpts).then((thumbnailPath) => {
          if (thumbnailPath) {
            res.sendFile(thumbnailPath);
          } else {
            // 缩略图生成失败，降级返回原图
            express.static(ossDir, { acceptRanges: false })(req, res, next);
          }
        });
        return;
      }
      next();
    },
    express.static(ossDir, { acceptRanges: false }),
  );
  // skills 静态资源
  const skillsDir = u.getPath("skills");
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }
  console.log("文件目录:", skillsDir);
  // 只允许图片文件访问
  app.use(
    "/skills",
    (req, res, next) => {
      /\.(jpe?g|png|gif|webp|svg|ico|bmp)$/i.test(req.path) ? next() : res.status(403).end();
    },
    express.static(skillsDir, { acceptRanges: false }),
  );

  // assets 静态资源
  const assetsDir = u.getPath("assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  console.log("文件目录:", assetsDir);
  app.use("/assets", express.static(assetsDir, { acceptRanges: false }));

  // data/web 静态网站
  const webDir = u.getPath("web");
  if (fs.existsSync(webDir)) {
    console.log("静态网站目录:", webDir);
    app.use(express.static(webDir, { acceptRanges: false }));
  } else {
    console.warn("静态网站目录不存在:", webDir);
  }

  app.use(async (req, res, next) => {
    const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
    if (!setting) return res.status(444).send({ message: "服务器秘钥未配置，请联系管理员" });
    const { value: tokenKey } = setting;
    // 从 header 或 query 参数获取 token
    const rawToken = req.headers.authorization || (req.query.token as string) || "";
    const token = rawToken.replace("Bearer ", "");
    if (isPublicApiPath(req.path, req.method)) return next();

    if (!token) return res.status(401).send({ message: "未提供token" });
    try {
      const decoded = jwt.verify(token, tokenKey as string);
      (req as any).user = decoded;
      next();
    } catch (err) {
      return res.status(401).send({ message: "无效的token" });
    }
  });

  const router = await import("@/router");
  await router.default(app);

  // 404 处理
  app.use((_, res, next: NextFunction) => {
    return res.status(404).send({ message: "API 404 Not Found" });
  });

  // 错误处理
  app.use((err: any, _: Request, res: Response, __: NextFunction) => {
    res.locals.message = err.message;
    res.locals.error = err;
    console.error(err);
    res.status(err.status || 500).send(err);
  });

  const port = options.randomPort ? 0 : 10588;
  return await new Promise((resolve) => {
    server.listen(port, localApiPolicy.host, async () => {
      const address = server.address();
      const realPort = typeof address === "string" ? address : address?.port;
      if (typeof realPort === "number") localApiPolicy.registerListeningPort(realPort);
      console.log(`[服务启动成功]: http://localhost:${realPort}`);
      resolve(realPort);
    });
  });
}

// 支持await关闭
export function closeServe(): Promise<void> {
  return stopGenerationWorker().then(
    () =>
      new Promise((resolve, reject) => {
        if (server) {
          server.close((err?: Error) => {
            if (err) return reject(err);
            console.log("[服务已关闭]");
            resolve();
          });
        } else {
          resolve();
        }
      }),
  );
}

const isElectron = typeof process.versions?.electron !== "undefined";
if (import.meta.main && !isElectron) await startServe();
