import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import legacyHttp from "@/http/compat";
import knex from "knex";
import jobsRoute from "@/routes/v2/jobs/index";
import jobRoute from "@/routes/v2/jobs/[id]/index";
import cancelRoute from "@/routes/v2/jobs/[id]/cancel";
import reconcileRoute from "@/routes/v2/jobs/[id]/reconcile";
import { configureGenerationRuntime, resetGenerationRuntimeForTests } from "@/generation/runtime";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { ProviderCatalog } from "@/providers/domain/models";

const directories: string[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  resetGenerationRuntimeForTests();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("job API deduplicates retries and returns the same snapshot after runtime restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-job-api-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "jobs.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  const catalog = structuredClone(builtinCatalog) as ProviderCatalog;
  catalog.offerings.find((offering) => offering.id === "minimax:h3:fal")!.support.implementation =
    "implemented";
  configureGenerationRuntime(database, catalog);

  const app = legacyHttp();
  app.use(legacyHttp.json());
  app.use((req, _res, next) => {
    req.user = { id: 42 };
    next();
  });
  app.use("/api/v2/jobs/:id/cancel", cancelRoute);
  app.use("/api/v2/jobs/:id/reconcile", reconcileRoute);
  app.use("/api/v2/jobs/:id", jobRoute);
  app.use("/api/v2/jobs", jobsRoute);
  app.useError((error, _req, res, _next) => {
    res.status(500).json({ message: (error as Error).message });
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const request = {
    schemaVersion: "2.0.0",
    idempotencyKey: "api-idempotency-key",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    operation: "video.generate",
    input: {
      mode: "text",
      values: {
        prompt: "A paper boat",
        durationSeconds: 5,
        resolution: "768P",
        aspectRatio: "16:9",
      },
      assets: [],
    },
  };
  const submit = () =>
    fetch(`${origin}/api/v2/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  const [firstResponse, duplicateResponse] = await Promise.all([submit(), submit()]);
  expect(firstResponse.status).toBe(202);
  expect(duplicateResponse.status).toBe(202);
  const first = (await firstResponse.json()) as { data: { id: string } };
  const duplicate = (await duplicateResponse.json()) as { data: { id: string } };
  expect(duplicate.data.id).toBe(first.data.id);

  const conflict = await fetch(`${origin}/api/v2/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...request,
      input: { ...request.input, values: { ...request.input.values, prompt: "Other" } },
    }),
  });
  expect(conflict.status).toBe(409);

  configureGenerationRuntime(database, catalog);
  const restored = await fetch(`${origin}/api/v2/jobs/${first.data.id}`);
  expect(restored.status).toBe(200);
  expect(((await restored.json()) as { data: { id: string } }).data.id).toBe(first.data.id);
  await database.destroy();
});
