import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import express from "express";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { configureMediaAssetRuntime, resetMediaAssetRuntimeForTests } from "@/assets/runtime";
import uploadRoute from "@/routes/v2/media-assets/upload";

const directories: string[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  resetMediaAssetRuntimeForTests();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("raw asset upload streams into principal-owned storage and rejects MIME spoofing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-asset-upload-api-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "assets.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  configureMediaAssetRuntime(database, path.join(directory, "content"));

  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: 42 };
    next();
  });
  app.use("/api/v2/media-assets/upload", uploadRoute);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const pdf = Buffer.from("%PDF-1.7\n%%EOF");
  const upload = (mediaType: string) =>
    fetch(`${origin}/api/v2/media-assets/upload`, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-toonflow-media-type": mediaType,
        "x-toonflow-filename": encodeURIComponent("brief.pdf"),
      },
      body: pdf,
    });

  const accepted = await upload("application/pdf");
  expect(accepted.status).toBe(201);
  expect(await accepted.json()).toMatchObject({
    data: { kind: "file", mediaType: "application/pdf", filename: "brief.pdf" },
  });
  const spoofed = await upload("image/png");
  expect(spoofed.status).toBe(422);
  expect(await spoofed.json()).toMatchObject({ message: "asset.content_type_mismatch" });
  await database.destroy();
});
