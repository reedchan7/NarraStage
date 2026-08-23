import { afterEach, expect, test } from "bun:test";
import legacyHttp from "@/http/compat";
import http from "node:http";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import generateRoute from "@/routes/v2/language/generate";
import streamRoute from "@/routes/v2/language/stream";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { createDeepSeekAdapter } from "@/providers/adapters/deepseek";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import {
  configureLanguageExecutionRuntime,
  resetLanguageExecutionRuntimeForTests,
} from "@/providers/languageExecutionService";

const servers: http.Server[] = [];

afterEach(async () => {
  resetLanguageExecutionRuntimeForTests();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

function fetchFunction(
  implementation: (
    input: Parameters<FetchFunction>[0],
    init?: Parameters<FetchFunction>[1],
  ) => Promise<Response>,
): FetchFunction {
  return Object.assign(implementation, { preconnect() {} });
}

async function startApi() {
  const vault = new MemoryCredentialVault();
  await vault.set({ providerId: "deepseek", slot: "apiKey" }, "api-test-key");
  const mockFetch = fetchFunction(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { stream?: boolean };
    if (body.stream) {
      return new Response(
        [
          `data: ${JSON.stringify({
            id: "stream-api-1",
            created: 1,
            model: "deepseek-v4-flash",
            choices: [{ delta: { role: "assistant", content: "hello" } }],
          })}\n\n`,
          `data: ${JSON.stringify({
            id: "stream-api-1",
            created: 1,
            model: "deepseek-v4-flash",
            choices: [{ delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }
    return new Response(
      JSON.stringify({
        id: "generate-api-1",
        created: 1,
        model: "deepseek-v4-pro",
        choices: [
          {
            message: { role: "assistant", content: "hello", reasoning_content: "" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const registry = new ProviderRegistry();
  registry.register(createDeepSeekAdapter({ credentialVault: vault, fetch: mockFetch }));
  configureLanguageExecutionRuntime(registry);

  const app = legacyHttp();
  app.use(legacyHttp.json());
  app.use("/api/v2/language/generate", generateRoute);
  app.use("/api/v2/language/stream", streamRoute);
  app.useError((error, _req, res, _next) => {
    res.status(500).json({ message: (error as Error).message });
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

function request(offeringId = "deepseek:v4-pro:official") {
  return {
    schemaVersion: "1.0.0",
    idempotencyKey: "language-api-case",
    canonicalModelId:
      offeringId === "deepseek:v4-pro:official" ? "deepseek:v4-pro" : "deepseek:v4-flash",
    offeringId,
    input: { messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }] },
  };
}

test("language REST and SSE routes expose only normalized provider contracts", async () => {
  const origin = await startApi();
  const generate = await fetch(`${origin}/api/v2/language/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request()),
  });
  expect(generate.status).toBe(200);
  expect(await generate.json()).toMatchObject({
    data: {
      schemaVersion: "1.0.0",
      text: "hello",
      resolvedModelId: "deepseek-v4-pro",
    },
  });

  const stream = await fetch(`${origin}/api/v2/language/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request("deepseek:v4-flash:official")),
  });
  expect(stream.status).toBe(200);
  expect(stream.headers.get("content-type")).toContain("text/event-stream");
  const body = await stream.text();
  expect(body).toContain('"type":"text_delta","delta":"hello"');
  expect(body).toContain('"type":"finish"');
  expect(body).not.toContain("api-test-key");
});
