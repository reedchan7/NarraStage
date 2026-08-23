import { describe, expect, test } from "bun:test";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { createDeepSeekAdapter } from "@/providers/adapters/deepseek";
import { ProviderExecutionError } from "@/providers/adapters/deepseek/errors";
import { DeepSeekFilesAdapter } from "@/providers/adapters/deepseek/filesAdapter";
import type {
  FilesUploadPort,
  LanguageGeneratePort,
  LanguageInput,
  LanguageStreamPort,
  OperationPort,
} from "@/providers/ports";
import {
  validateDeepSeekImageBytes,
  withDeepSeekImageDetail,
} from "@/providers/adapters/deepseek/visionAdapter";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXsAAAAASUVORK5CYII=";

function fetchFunction(
  implementation: (
    input: Parameters<FetchFunction>[0],
    init?: Parameters<FetchFunction>[1],
  ) => Promise<Response>,
): FetchFunction {
  return Object.assign(implementation, { preconnect() {} });
}

async function vaultWithCredential() {
  const vault = new MemoryCredentialVault();
  await vault.set({ providerId: "deepseek", slot: "apiKey" }, "test-secret-key");
  return vault;
}

function port<T extends OperationPort["operation"]>(
  ports: readonly OperationPort[],
  operation: T,
): Extract<OperationPort, { operation: T }> {
  const found = ports.find((candidate) => candidate.operation === operation);
  if (!found) throw new Error(`missing test port ${operation}`);
  return found as Extract<OperationPort, { operation: T }>;
}

function request(input: LanguageInput, offeringId = "deepseek:v4-pro:official") {
  return {
    schemaVersion: "1.0.0",
    offeringId,
    idempotencyKey: "contract-case-1",
    input,
  };
}

function successfulResponse(body: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "req-deepseek-1",
      created: 1_787_476_800,
      model: "deepseek-v4-pro-20260821",
      choices: [
        {
          message: {
            role: "assistant",
            reasoning_content: "checked the tool output",
            content: "It is 21 degrees.",
            tool_calls: null,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 12,
        total_tokens: 32,
        prompt_cache_hit_tokens: 4,
        prompt_cache_miss_tokens: 16,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
      ...body,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "wire-request-1" },
    },
  );
}

describe("DeepSeek V4 adapter contract", () => {
  test("preserves thinking, effort, tools, and V4 reasoning continuity on the SDK wire", async () => {
    let wireBody: Record<string, unknown> | undefined;
    const mockFetch = fetchFunction(async (_input, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-secret-key");
      wireBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return successfulResponse();
    });
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: mockFetch,
    });
    const generate = port(adapter.ports, "language.generate") as LanguageGeneratePort;
    const result = await generate.generate(
      request({
        messages: [
          { role: "system", content: "Be precise." },
          { role: "user", content: [{ type: "text", text: "Weather?" }] },
          {
            role: "assistant",
            content: [
              { type: "reasoning", text: "I need the weather tool." },
              {
                type: "tool_call",
                toolCallId: "call-1",
                toolName: "weather",
                input: { city: "Shanghai" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolCallId: "call-1",
                toolName: "weather",
                output: { celsius: 21 },
              },
            ],
          },
        ],
        thinking: { mode: "enabled", effort: "max" },
        tools: [
          {
            name: "weather",
            description: "Read current weather",
            inputSchema: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
              additionalProperties: false,
            },
            strict: true,
          },
        ],
        toolChoice: { type: "tool", toolName: "weather" },
      }),
    );

    expect(wireBody).toMatchObject({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled" },
      reasoning_effort: "max",
      tool_choice: { type: "function", function: { name: "weather" } },
      messages: [
        { role: "system", content: "Be precise." },
        { role: "user", content: "Weather?" },
        {
          role: "assistant",
          reasoning_content: "I need the weather tool.",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "weather", arguments: '{"city":"Shanghai"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: '{"celsius":21}' },
      ],
    });
    expect(result).toEqual({
      schemaVersion: "1.0.0",
      text: "It is 21 degrees.",
      reasoning: "checked the tool output",
      toolCalls: [],
      finishReason: "stop",
      usage: {
        inputTokens: 20,
        outputTokens: 12,
        reasoningTokens: 5,
        cacheReadTokens: 4,
      },
      providerMetadata: {
        deepseek: {
          promptCacheHitTokens: 4,
          promptCacheMissTokens: 16,
        },
      },
      providerRequestId: "req-deepseek-1",
      resolvedModelId: "deepseek-v4-pro-20260821",
    });
  });

  test("preserves inline, URL, Files, and image detail semantics for the new vision model", async () => {
    let wireBody: Record<string, unknown> | undefined;
    const mockFetch = fetchFunction(async (_input, init) => {
      wireBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return successfulResponse({ model: "deepseek-v4-flash-vision-exp" });
    });
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: mockFetch,
    });
    const generate = port(adapter.ports, "language.generate") as LanguageGeneratePort;
    await generate.generate(
      request(
        {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Compare these images" },
                {
                  type: "image",
                  detail: "original",
                  source: {
                    type: "inline",
                    mediaType: "image/png",
                    dataBase64: onePixelPng,
                    byteLength: Buffer.from(onePixelPng, "base64").byteLength,
                    width: 1,
                    height: 1,
                  },
                },
                {
                  type: "image",
                  detail: "low",
                  source: { type: "url", url: "https://assets.example.com/chart.webp" },
                },
                {
                  type: "image",
                  source: {
                    type: "provider_file",
                    providerId: "deepseek",
                    fileId: "file-api-reused",
                    mediaType: "image/jpeg",
                    byteLength: 1_024,
                  },
                },
              ],
            },
          ],
        },
        "deepseek:v4-flash-vision-exp:official",
      ),
    );

    expect(wireBody).toMatchObject({
      model: "deepseek-v4-flash-vision-exp",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Compare these images" },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${onePixelPng}`,
                detail: "original",
              },
            },
            {
              type: "image_url",
              image_url: { url: "https://assets.example.com/chart.webp", detail: "low" },
            },
            { type: "file", file_id: "file-api-reused" },
          ],
        },
      ],
    });
  });

  test("fails preflight before network for unsupported vision combinations", async () => {
    let calls = 0;
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: fetchFunction(async () => {
        calls += 1;
        return successfulResponse();
      }),
    });
    const generate = port(adapter.ports, "language.generate") as LanguageGeneratePort;
    const invalidCases: Array<{ input: LanguageInput; offeringId?: string; code: string }> = [
      {
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "url",
                    url: "https://assets.example.com/image.png",
                  },
                },
              ],
            },
          ],
        },
        code: "deepseek.model_does_not_support_images",
      },
      {
        input: {
          messages: [{ role: "user", content: [{ type: "text", text: "Think" }] }],
          thinking: { mode: "adaptive" },
        },
        code: "deepseek.adaptive_thinking_not_officially_supported",
      },
      {
        offeringId: "deepseek:v4-flash-vision-exp:official",
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  detail: "low",
                  source: {
                    type: "provider_file",
                    providerId: "deepseek",
                    fileId: "file-api-1",
                    mediaType: "image/png",
                  },
                },
              ],
            },
          ],
        },
        code: "deepseek.file_detail_unsupported",
      },
    ];
    for (const invalid of invalidCases) {
      await expect(
        generate.generate(request(invalid.input, invalid.offeringId)),
      ).rejects.toMatchObject({
        providerError: { category: "invalid_input", code: invalid.code, retryable: false },
      });
    }
    expect(calls).toBe(0);
  });

  test("normalizes reasoning, text, tool calls, usage, and model identity from an SSE stream", async () => {
    const chunks = [
      {
        id: "stream-1",
        created: 1,
        model: "deepseek-v4-flash-20260821",
        choices: [{ delta: { role: "assistant", reasoning_content: "check" } }],
      },
      {
        id: "stream-1",
        created: 1,
        model: "deepseek-v4-flash-20260821",
        choices: [{ delta: { content: "done" } }],
      },
      {
        id: "stream-1",
        created: 1,
        model: "deepseek-v4-flash-20260821",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  function: { name: "lookup", arguments: '{"id":1}' },
                },
              ],
            },
          },
        ],
      },
      {
        id: "stream-1",
        created: 1,
        model: "deepseek-v4-flash-20260821",
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 4,
          completion_tokens_details: { reasoning_tokens: 1 },
        },
      },
    ];
    const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: fetchFunction(
        async () =>
          new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    });
    const streamPort = port(adapter.ports, "language.stream") as LanguageStreamPort;
    const stream = await streamPort.stream(
      request(
        { messages: [{ role: "user", content: [{ type: "text", text: "Go" }] }] },
        "deepseek:v4-flash:official",
      ),
    );
    const events = [];
    for await (const event of stream) events.push(event);
    expect(events).toEqual([
      { type: "reasoning_delta", delta: "check" },
      { type: "text_delta", delta: "done" },
      {
        type: "tool_call",
        call: { toolCallId: "call-1", toolName: "lookup", input: { id: 1 } },
      },
      {
        type: "finish",
        finishReason: "tool_calls",
        usage: {
          inputTokens: 3,
          outputTokens: 4,
          reasoningTokens: 1,
          cacheReadTokens: 0,
        },
        providerRequestId: "stream-1",
        resolvedModelId: "deepseek-v4-flash-20260821",
      },
    ]);
  });

  test("maps authenticated provider errors without leaking credentials", async () => {
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: fetchFunction(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "Too many requests", type: "rate_limit", code: "429" },
            }),
            {
              status: 429,
              headers: {
                "content-type": "application/json",
                "x-request-id": "rate-1",
                "retry-after": "2",
              },
            },
          ),
      ),
    });
    const generate = port(adapter.ports, "language.generate") as LanguageGeneratePort;
    let caught: unknown;
    try {
      await generate.generate(
        request({ messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }] }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderExecutionError);
    expect((caught as ProviderExecutionError).providerError).toEqual({
      category: "rate_limit",
      code: "deepseek.http_429",
      message: "Too many requests",
      retryable: true,
      providerRequestId: "rate-1",
      retryAfterMs: 2_000,
    });
    expect(JSON.stringify((caught as ProviderExecutionError).providerError)).not.toContain(
      "test-secret-key",
    );
  });

  test("uploads Files through the official multipart contract and returns a scoped reference", async () => {
    let form: FormData | undefined;
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: fetchFunction(async (_input, init) => {
        form = init?.body as FormData;
        return new Response(
          JSON.stringify({
            id: "file-api-123",
            object: "file",
            bytes: 3,
            created_at: 1_787_476_800,
            filename: "pixel.png",
            purpose: "user_data",
            expires_at: 1_787_480_400,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    });
    const files = port(adapter.ports, "files.upload") as FilesUploadPort;
    const result = await files.upload({
      schemaVersion: "1.0.0",
      offeringId: "deepseek:v4-flash-vision-exp:official",
      idempotencyKey: "file-case-1",
      input: {
        dataBase64: onePixelPng,
        byteLength: Buffer.from(onePixelPng, "base64").byteLength,
        mediaType: "image/png",
        filename: "pixel.png",
        expiresAfterSeconds: 3_600,
      },
    });
    expect(form?.get("purpose")).toBe("user_data");
    expect(form?.get("expires_after[seconds]")).toBe("3600");
    expect(result).toEqual({
      schemaVersion: "1.0.0",
      providerId: "deepseek",
      fileId: "file-api-123",
      mediaType: "image/png",
      filename: "pixel.png",
      byteLength: Buffer.from(onePixelPng, "base64").byteLength,
      expiresAt: "2026-08-23T10:20:00.000Z",
    });
  });

  test("rejects oversized owned files before touching their content", async () => {
    const oversizedAssetId = `sha256:${"a".repeat(64)}`;
    let blobReads = 0;
    const oversizedBlob = new Blob();
    Object.defineProperty(oversizedBlob, "arrayBuffer", {
      value: async () => {
        blobReads += 1;
        throw new Error("oversized blob must not be read");
      },
    });
    const oversizedSources = [
      { kind: "path" as const, path: "/definitely-not-present/toonflow-oversize.png" },
      { kind: "blob" as const, blob: oversizedBlob },
    ];

    for (const source of oversizedSources) {
      const files = new DeepSeekFilesAdapter(undefined, {
        async resolveFile() {
          return {
            assetId: oversizedAssetId,
            mimeType: "image/png",
            byteLength: 65 * 1024 * 1024,
            sha256: "a".repeat(64),
            source,
          };
        },
      });
      await expect(
        files.upload(
          {
            schemaVersion: "1.0.0",
            offeringId: "deepseek:v4-flash-vision-exp:official",
            idempotencyKey: `oversized-owned-${source.kind}`,
            input: { source: "owned_asset", assetId: oversizedAssetId },
          },
          { principalId: "user:1" },
        ),
      ).rejects.toMatchObject({
        providerError: {
          category: "invalid_input",
          code: "deepseek.image_byte_limit_exceeded",
        },
      });
    }

    expect(blobReads).toBe(0);
  });

  test("rejects spoofed image formats and non-image Files before network", async () => {
    expect(() =>
      validateDeepSeekImageBytes(Buffer.from(onePixelPng, "base64"), "image/jpeg"),
    ).toThrow("deepseek.image_media_type_mismatch");
    expect(() => validateDeepSeekImageBytes(Buffer.from("plain text"), "image/png")).toThrow(
      "deepseek.image_format_unsupported",
    );

    let calls = 0;
    const adapter = createDeepSeekAdapter({
      credentialVault: await vaultWithCredential(),
      fetch: fetchFunction(async () => {
        calls += 1;
        return successfulResponse();
      }),
    });
    const files = port(adapter.ports, "files.upload") as FilesUploadPort;
    await expect(
      files.upload({
        schemaVersion: "1.0.0",
        offeringId: "deepseek:v4-flash-vision-exp:official",
        idempotencyKey: "file-spoof-case",
        input: {
          dataBase64: onePixelPng,
          byteLength: Buffer.from(onePixelPng, "base64").byteLength,
          mediaType: "application/pdf",
          filename: "spoof.pdf",
        },
      }),
    ).rejects.toMatchObject({
      providerError: {
        category: "invalid_input",
        code: "deepseek.image_media_type_unsupported",
      },
    });
    expect(calls).toBe(0);
  });

  test("enforces DeepSeek's wire body limit before opening the network", async () => {
    let calls = 0;
    const wrapped = withDeepSeekImageDetail(
      fetchFunction(async () => {
        calls += 1;
        return successfulResponse();
      }),
      [],
    );
    const oversized = "x".repeat(48 * 1024 * 1024 + 1);
    await expect(
      wrapped("https://api.deepseek.com/chat/completions", {
        method: "POST",
        body: oversized,
      }),
    ).rejects.toThrow("deepseek.request_body_limit_exceeded");
    expect(calls).toBe(0);
  });
});
