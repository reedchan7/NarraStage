import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import legacyHttp from "@/http/compat";

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("Hono compatibility routes preserve params, query, JSON body, middleware, and status", async () => {
  const app = legacyHttp();
  app.use((request, _response, next) => {
    request.user = { id: 42 };
    return next();
  });
  const router = legacyHttp.Router({ mergeParams: true });
  router.post("/:id", (request, response) =>
    response.status(201).json({
      body: request.body,
      id: request.params.id,
      query: request.query.mode,
      user: request.user,
    }),
  );
  app.use("/api/jobs", router);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const response = await fetch(`http://127.0.0.1:${port}/api/jobs/job-1?mode=retry`, {
    body: JSON.stringify({ prompt: "paper boat" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    body: { prompt: "paper boat" },
    id: "job-1",
    query: "retry",
    user: { id: 42 },
  });
});

test("Hono compatibility routes retain the legacy 100 MB JSON body limit", async () => {
  const app = legacyHttp();
  const router = legacyHttp.Router();
  router.post("/", (_request, response) => response.json({ accepted: true }));
  app.use("/api/import", router);

  const response = await app.hono.request("/api/import", {
    body: "{}",
    headers: {
      "content-length": String(100 * 1024 * 1024 + 1),
      "content-type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({
    code: 413,
    data: null,
    message: "请求内容超过 100 MB 限制",
  });
});

test("Hono compatibility routes stream sendFile responses without falling through to 204", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "narrastage-send-file-"));
  directories.push(directory);
  const filePath = path.join(directory, "asset.bin");
  await writeFile(filePath, Buffer.from("owned-media"));
  const app = legacyHttp();
  const router = legacyHttp.Router();
  router.get("/", (_request, response) => {
    response.type("application/octet-stream");
    response.setHeader("Content-Length", "11");
    return response.sendFile(filePath);
  });
  app.use("/api/media", router);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const response = await fetch(`http://127.0.0.1:${port}/api/media`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("owned-media");
});
