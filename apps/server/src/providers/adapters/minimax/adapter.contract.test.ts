import { describe, expect, test } from "bun:test";
import { createMiniMaxAdapter } from "@/providers/adapters/minimax";
import { MiniMaxOfficialTransport } from "@/providers/adapters/minimax/officialTransport";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import type {
  OperationPort,
  ProviderAssetResolver,
  VideoCancelPort,
  VideoGeneratePort,
} from "@/providers/ports";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";

function port<T extends OperationPort["operation"]>(
  ports: readonly OperationPort[],
  operation: T,
): Extract<OperationPort, { operation: T }> {
  const found = ports.find((candidate) => candidate.operation === operation);
  if (!found) throw new Error(`missing ${operation}`);
  return found as Extract<OperationPort, { operation: T }>;
}

async function setup(responses: Array<Response>) {
  const vault = new MemoryCredentialVault();
  await vault.set({ providerId: "minimax", slot: "apiKey" }, "minimax-contract-key");
  const calls: Array<{
    url: string;
    method: string;
    body?: unknown;
    authorization: string | null;
  }> = [];
  const mockFetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      const response = responses.shift();
      if (!response) throw new Error("unexpected fetch");
      return response;
    },
    { preconnect() {} },
  );
  const transport = new MiniMaxOfficialTransport({
    credentialVault: vault,
    baseUrl: "https://minimax.test",
    fetch: mockFetch,
  });
  const assetResolver: ProviderAssetResolver = {
    async resolve(asset) {
      return {
        assetId: asset.assetId,
        kind: asset.kind,
        mimeType: asset.kind === "audio" ? "audio/mpeg" : "image/png",
        byteLength: 10,
        sha256: "a".repeat(64),
        source: { kind: "url", url: `https://assets.example/${asset.assetId}` },
      };
    },
  };
  const adapter = createMiniMaxAdapter({ credentialVault: vault, transport, assetResolver });
  return {
    generate: port(adapter.ports, "video.generate") as VideoGeneratePort,
    cancel: port(adapter.ports, "video.cancel") as VideoCancelPort,
    calls,
  };
}

function request(input: Record<string, unknown>) {
  return {
    schemaVersion: "1.0.0",
    offeringId: "minimax:h3:official",
    idempotencyKey: "minimax-h3-contract-1",
    input,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MiniMax official H3 adapter contract", () => {
  test("accepts official 4-second output and emits v2 content[]", async () => {
    const fixture = await setup([json({ task_id: "official-task-1" })]);
    expect(
      await fixture.generate.start(
        request({
          mode: "text",
          values: {
            prompt: "A ship leaves orbit",
            durationSeconds: 4,
            resolution: "2K",
            aspectRatio: "21:9",
          },
          assets: [],
        }),
      ),
    ).toEqual({ providerHandle: "official-task-1", providerOutcome: "queued" });
    expect(fixture.calls).toEqual([
      {
        url: "https://minimax.test/v2/video_generation",
        method: "POST",
        authorization: "Bearer minimax-contract-key",
        body: {
          model: "MiniMax-H3",
          content: [{ type: "text", text: "A ship leaves orbit" }],
          duration: 4,
          resolution: "2K",
          ratio: "21:9",
        },
      },
    ]);
  });

  test("rejects audio-only reference and fal-only resolutions", async () => {
    const fixture = await setup([json({ task_id: "official-task-2" })]);
    await expect(
      fixture.generate.start(
        request({
          mode: "reference",
          values: { prompt: "Use reference audio 1", durationSeconds: 6, resolution: "768P" },
          assets: [
            {
              assetId: "voice.mp3",
              kind: "audio",
              role: "reference_audio",
              durationSeconds: 4,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ProviderExecutionError);

    await expect(
      fixture.generate.start(
        request({
          mode: "text",
          values: {
            prompt: "not official",
            durationSeconds: 5,
            resolution: "4K",
            aspectRatio: "16:9",
          },
          assets: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ProviderExecutionError);
    expect(fixture.calls).toHaveLength(0);
  });

  test("cancels only queued tasks and never deletes running or terminal records", async () => {
    const queued = await setup([
      json({ task: { id: "queued-1", status: "queued" } }),
      json({ task_id: "queued-1", action: "cancelled", status: "cancelled" }),
    ]);
    expect(await queued.cancel.cancel("queued-1")).toEqual({ outcome: "confirmed" });
    expect(queued.calls.map((call) => call.method)).toEqual(["GET", "DELETE"]);

    const running = await setup([json({ task: { id: "running-1", status: "running" } })]);
    expect(await running.cancel.cancel("running-1")).toEqual({ outcome: "not_supported" });
    expect(running.calls.map((call) => call.method)).toEqual(["GET"]);

    const succeeded = await setup([
      json({
        task: {
          id: "done-1",
          status: "succeeded",
          content: { url: "https://cdn.example/output.mp4" },
        },
      }),
    ]);
    expect(await succeeded.cancel.cancel("done-1")).toEqual({ outcome: "already_terminal" });
    expect(succeeded.calls.map((call) => call.method)).toEqual(["GET"]);
  });
});
