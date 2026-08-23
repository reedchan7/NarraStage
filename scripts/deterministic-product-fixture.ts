import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Server as SocketServer } from "socket.io";

interface FixtureJob {
  id: string;
  schemaVersion: "2.0.0";
  idempotencyKey: string;
  canonicalModelId: string;
  offeringId: string;
  providerId: string;
  operation: "image.generate" | "video.generate";
  input: unknown;
  state: "running" | "succeeded" | "cancelled";
  providerOutcome: "running" | "succeeded" | "cancelled";
  result?: unknown;
  nextRunAt: number;
  pollAttemptCount: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  requiresReconciliation: false;
}

function envelope<T>(data: T, message = "成功") {
  return { code: 200, data, message };
}

function assertAuthenticated(authorization: string | undefined) {
  return authorization === "Bearer deterministic-acceptance";
}

const IMAGE_ASSET_ID = `sha256:${"a".repeat(64)}`;
const VIDEO_ASSET_ID = `sha256:${"b".repeat(64)}`;

export async function startDeterministicProductFixture(requestedPort = 0) {
  const repositoryRoot = path.resolve(import.meta.dir, "..");
  const [imageBytes, videoBytes] = await Promise.all([
    readFile(
      path.join(repositoryRoot, "data/skills/art_skills/2D_90s_japanese_anime/images/1.png"),
    ),
    readFile(path.join(repositoryRoot, "data/assets/ending.mp4")),
  ]);
  const app = new Hono();
  const jobsById = new Map<string, FixtureJob>();
  const jobsByKey = new Map<string, { identity: string; job: FixtureJob }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  app.get("/ready", (context) => context.json({ ready: true }));
  app.post("/api/login/login", (context) =>
    context.json(
      envelope(
        {
          token: "Bearer deterministic-acceptance",
          name: "acceptance",
          id: 1,
          role: "operator",
        },
        "登录成功",
      ),
    ),
  );
  app.use("/api/*", async (context, next) => {
    if (!assertAuthenticated(context.req.header("authorization"))) {
      return context.json({ code: 401, data: null, message: "未提供token" }, 401);
    }
    await next();
  });
  app.post("/api/project/getProject", (context) =>
    context.json(
      envelope([
        {
          id: 7001,
          name: "月港信使",
          intro: "一名信使在潮汐封锁前送出最后一卷胶片。",
          projectType: "animation",
          type: "short",
          artStyle: "手绘胶片质感",
          videoRatio: "16:9",
        },
      ]),
    ),
  );
  app.post("/api/project/addProject", (context) =>
    context.json(envelope({ message: "新增项目成功" })),
  );
  app.get("/api/v2/providers", (context) =>
    context.json(
      envelope({
        schemaVersion: "2.0.0",
        providers: [
          {
            providerId: "deterministic",
            health: "healthy",
            slots: [{ slot: "local", configured: true, source: "memory", writable: false }],
          },
        ],
      }),
    ),
  );
  app.get("/api/v2/catalog", (context) =>
    context.json(
      envelope({
        schemaVersion: "2.0.0",
        providers: [],
        models: [],
        offerings: [
          {
            id: "deterministic:image",
            canonicalModelId: "deterministic:image-v1",
            providerId: "deterministic",
            providerModelId: "image-v1",
            operations: [
              {
                operation: "image.generate",
                capabilitySchemaId: "deterministic:image",
                enabled: true,
              },
            ],
            support: { implementation: "implemented", evidence: ["product_accepted"] },
          },
          {
            id: "deterministic:video",
            canonicalModelId: "deterministic:video-v1",
            providerId: "deterministic",
            providerModelId: "video-v1",
            operations: [
              {
                operation: "video.generate",
                capabilitySchemaId: "deterministic:video",
                enabled: true,
              },
            ],
            support: { implementation: "implemented", evidence: ["product_accepted"] },
          },
        ],
        capabilitySchemas: [
          {
            id: "deterministic:image",
            schemaVersion: "1.0.0",
            operation: "image.generate",
            fields: [
              {
                path: "prompt",
                kind: "text",
                label: "镜头描述",
                required: true,
                maximumLength: 4_000,
              },
              {
                path: "aspectRatio",
                kind: "enum",
                label: "画幅",
                required: true,
                enumValues: ["16:9", "9:16", "1:1"],
              },
            ],
          },
          {
            id: "deterministic:video",
            schemaVersion: "1.0.0",
            operation: "video.generate",
            fields: [
              {
                path: "prompt",
                kind: "text",
                label: "运动描述",
                required: true,
                maximumLength: 4_000,
              },
              {
                path: "durationSeconds",
                kind: "integer",
                label: "时长",
                required: true,
                minimum: 4,
                maximum: 10,
              },
              {
                path: "resolution",
                kind: "enum",
                label: "分辨率",
                required: true,
                enumValues: ["768P", "1080P"],
              },
              {
                path: "aspectRatio",
                kind: "enum",
                label: "画幅",
                required: true,
                enumValues: ["16:9", "9:16"],
              },
            ],
            assetModes: [{ id: "text", label: "Text to video", roles: [] }],
          },
        ],
        priceSnapshots: [],
        availability: [
          {
            offeringId: "deterministic:image",
            available: true,
            health: "healthy",
            reasons: [],
          },
          {
            offeringId: "deterministic:video",
            available: true,
            health: "healthy",
            reasons: [],
          },
        ],
      }),
    ),
  );
  app.post("/api/v2/jobs", async (context) => {
    const request = (await context.req.json()) as {
      idempotencyKey: string;
      canonicalModelId: string;
      offeringId: string;
      operation: "image.generate" | "video.generate";
      input: unknown;
    };
    const identity = JSON.stringify({
      canonicalModelId: request.canonicalModelId,
      offeringId: request.offeringId,
      operation: request.operation,
      input: request.input,
    });
    const existing = jobsByKey.get(request.idempotencyKey);
    if (existing && existing.identity !== identity) {
      return context.json({ message: "generation.idempotency_conflict" }, 409);
    }
    if (existing) return context.json(envelope(existing.job, "任务已接受"), 202);
    const now = Date.now();
    const job: FixtureJob = {
      id: randomUUID(),
      schemaVersion: "2.0.0",
      idempotencyKey: request.idempotencyKey,
      canonicalModelId: request.canonicalModelId,
      offeringId: request.offeringId,
      providerId: "deterministic",
      operation: request.operation,
      input: request.input,
      state: "running",
      providerOutcome: "running",
      nextRunAt: now,
      pollAttemptCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      requiresReconciliation: false,
    };
    jobsById.set(job.id, job);
    jobsByKey.set(job.idempotencyKey, { identity, job });
    return context.json(envelope(job, "任务已接受"), 202);
  });
  app.get("/api/v2/jobs/:id", (context) => {
    const job = jobsById.get(context.req.param("id"));
    if (!job) return context.json({ message: "generation.job_not_found" }, 404);
    if (job.state === "running") {
      job.state = "succeeded";
      job.providerOutcome = "succeeded";
      job.pollAttemptCount += 1;
      job.version += 1;
      job.updatedAt = Date.now();
      job.result = {
        outputs: [
          job.operation === "image.generate"
            ? { kind: "image", assetId: IMAGE_ASSET_ID, mimeType: "image/png" }
            : { kind: "video", assetId: VIDEO_ASSET_ID, mimeType: "video/mp4" },
        ],
        provenance: { providerRequestId: `deterministic-${job.id}` },
      };
    }
    return context.json(envelope(job));
  });
  app.post("/api/v2/jobs/:id/cancel", (context) => {
    const job = jobsById.get(context.req.param("id"));
    if (!job) return context.json({ message: "generation.job_not_found" }, 404);
    job.state = "cancelled";
    job.providerOutcome = "cancelled";
    job.version += 1;
    job.updatedAt = Date.now();
    return context.json(envelope(job));
  });
  app.get("/api/v2/media-assets/:id/content", (context) => {
    const id = context.req.param("id");
    if (id === IMAGE_ASSET_ID) {
      return context.body(imageBytes, 200, {
        "Content-Type": "image/png",
        "Content-Length": String(imageBytes.byteLength),
        "Cache-Control": "no-store",
      });
    }
    if (id === VIDEO_ASSET_ID) {
      return context.body(videoBytes, 200, {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBytes.byteLength),
        "Cache-Control": "no-store",
      });
    }
    return context.json({ message: "media_asset.not_found" }, 404);
  });

  const nodeServer = serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: requestedPort,
  });
  const socketServer = new SocketServer(nodeServer, {
    cors: { origin: ["http://localhost:50188", "http://127.0.0.1:50188"] },
  });
  socketServer.of("/api/socket/scriptAgent").on("connection", (socket) => {
    if (!assertAuthenticated(socket.handshake.auth.token)) {
      socket.disconnect(true);
      return;
    }
    socket.on("chat", (input: { content?: string }) => {
      const messageId = randomUUID();
      const contentId = randomUUID();
      socket.emit("message", {
        id: messageId,
        role: "assistant",
        name: "统筹",
        status: "pending",
        datetime: new Date().toISOString(),
        content: [],
      });
      socket.emit("content:add", {
        messageId,
        content: { id: contentId, type: "text", data: "", status: "pending" },
      });
      const parts = [
        "我会把这个创作意图拆成三个镜头：",
        "建立月港环境、跟随信使穿过潮门、用胶片交付完成情绪收束。",
      ];
      parts.forEach((part, index) => {
        const timer = setTimeout(
          () => {
            socket.emit("content:update", {
              messageId,
              contentId,
              type: "text",
              data: part,
              strategy: "append",
              status: index === parts.length - 1 ? "complete" : "streaming",
            });
            if (index === parts.length - 1) {
              socket.emit("message:update", { id: messageId, status: "complete" });
            }
            timers.delete(timer);
          },
          40 + index * 60,
        );
        timers.add(timer);
      });
      if (!input.content?.trim()) {
        socket.emit("error", { code: "agent.chat_input_invalid", message: "消息不能为空" });
      }
    });
  });

  if (!nodeServer.listening) {
    await new Promise<void>((resolve, reject) => {
      nodeServer.once("listening", resolve);
      nodeServer.once("error", reject);
    });
  }
  const port = (nodeServer.address() as AddressInfo).port;
  return {
    port,
    async close() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
      if (nodeServer.listening) {
        await new Promise<void>((resolve, reject) =>
          nodeServer.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  };
}

if (import.meta.main) {
  const fixture = await startDeterministicProductFixture(
    Number(process.env.TOONFLOW_ACCEPTANCE_PORT ?? 10588),
  );
  console.log(`DETERMINISTIC_FIXTURE_PORT=${fixture.port}`);
  const close = async () => {
    await fixture.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
