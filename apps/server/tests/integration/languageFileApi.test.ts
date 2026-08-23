import { afterEach, expect, test } from "bun:test";
import express from "express";
import http from "node:http";
import uploadRoute from "@/routes/v2/files/upload";
import { defineProviderAdapter, type OperationContext } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import {
  configureLanguageExecutionRuntime,
  resetLanguageExecutionRuntimeForTests,
} from "@/providers/languageExecutionService";
import { principalIdFromClaims } from "@/security/principal";
import knex, { type Knex } from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import {
  configureProviderFileLedger,
  resetProviderFileLedgerForTests,
} from "@/providers/files/providerFileLedger";

const servers: http.Server[] = [];
let database: Knex | undefined;

afterEach(async () => {
  resetLanguageExecutionRuntimeForTests();
  resetProviderFileLedgerForTests();
  await database?.destroy();
  database = undefined;
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

test("owned provider-file uploads carry the authenticated principal to the asset resolver", async () => {
  database = knex({
    client: "sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  configureProviderFileLedger(database);
  let observedContext: OperationContext | undefined;
  const registry = new ProviderRegistry();
  registry.register(
    defineProviderAdapter({
      providerId: "google",
      ports: [
        {
          operation: "files.upload" as const,
          async upload(_request, context) {
            observedContext = context;
            return {
              schemaVersion: "1.0.0" as const,
              providerId: "google",
              fileId: "files/owned",
              mediaType: "application/pdf",
            };
          },
        },
      ],
    }),
  );
  configureLanguageExecutionRuntime(registry);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: 42 };
    next();
  });
  app.use("/api/v2/files/upload", uploadRoute);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const response = await fetch(`${origin}/api/v2/files/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: "1.0.0",
      canonicalModelId: "google:gemini-3.7-flash",
      offeringId: "google:gemini-3.7-flash:official",
      idempotencyKey: "file-upload-principal",
      input: { source: "owned_asset", assetId: `sha256:${"a".repeat(64)}` },
    }),
  });

  expect(response.status).toBe(200);
  expect(observedContext?.principalId).toBe(principalIdFromClaims({ id: 42 }));
});
