import { describe, expect, test } from "bun:test";
import type { FalClient, QueueStatus } from "@fal-ai/client";
import { createFalAdapter } from "@/providers/adapters/fal";
import { decodeFalHandle, FalQueueTransport } from "@/providers/adapters/fal/transport";
import { ProviderExecutionError } from "@/providers/domain/executionError";
import type {
  OperationPort,
  ProviderAssetResolver,
  VideoCancelPort,
  VideoGeneratePort,
  VideoStatusPort,
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

async function setup() {
  const vault = new MemoryCredentialVault();
  await vault.set({ providerId: "fal", slot: "apiKey" }, "fal-contract-key");
  const submissions: Array<{ endpoint: string; input: unknown }> = [];
  const uploads: Blob[] = [];
  let status: QueueStatus = {
    status: "IN_QUEUE",
    request_id: "fal-request-1",
    response_url: "https://queue.fal.run/response",
    status_url: "https://queue.fal.run/status",
    cancel_url: "https://queue.fal.run/cancel",
    queue_position: 2,
  };
  let result: unknown = {
    video: { url: "https://v3.fal.media/files/h3.mp4", content_type: "video/mp4" },
  };
  const client = {
    storage: {
      async upload(blob: Blob) {
        uploads.push(blob);
        return "https://v3.fal.media/files/uploaded.png";
      },
    },
    queue: {
      async submit(endpoint: string, options: { input?: unknown }) {
        submissions.push({ endpoint, input: options.input });
        return {
          status: "IN_QUEUE" as const,
          request_id: "fal-request-1",
          response_url: "https://queue.fal.run/response",
          status_url: "https://queue.fal.run/status",
          cancel_url: "https://queue.fal.run/cancel",
          queue_position: 0,
        };
      },
      async status() {
        return status;
      },
      async result() {
        return { data: result, requestId: "fal-request-1" };
      },
      async cancel() {},
    },
  } as unknown as FalClient;
  const transport = new FalQueueTransport({
    credentialVault: vault,
    clientFactory(apiKey) {
      expect(apiKey).toBe("fal-contract-key");
      return client;
    },
  });
  const assetResolver: ProviderAssetResolver = {
    async resolve(asset) {
      if (asset.assetId === "blob-image") {
        const blob = new Blob(["image"], { type: "image/png" });
        return {
          assetId: asset.assetId,
          kind: asset.kind,
          mimeType: "image/png",
          byteLength: blob.size,
          sha256: "a".repeat(64),
          source: { kind: "blob", blob },
        };
      }
      return {
        assetId: asset.assetId,
        kind: asset.kind,
        mimeType: asset.kind === "video" ? "video/mp4" : "audio/mpeg",
        byteLength: 10,
        sha256: "b".repeat(64),
        source: { kind: "url", url: `https://assets.example/${asset.assetId}` },
      };
    },
  };
  const adapter = createFalAdapter({ credentialVault: vault, transport, assetResolver });
  return {
    transport,
    generate: port(adapter.ports, "video.generate") as VideoGeneratePort,
    videoStatus: port(adapter.ports, "video.status") as VideoStatusPort,
    cancel: port(adapter.ports, "video.cancel") as VideoCancelPort,
    submissions,
    uploads,
    setStatus(value: QueueStatus) {
      status = value;
    },
    setResult(value: unknown) {
      result = value;
    },
  };
}

function request(input: Record<string, unknown>) {
  return {
    schemaVersion: "1.0.0",
    offeringId: "minimax:h3:fal",
    idempotencyKey: "fal-h3-contract-1",
    input,
  };
}

describe("fal H3 adapter contract", () => {
  test("reuses the generic storage and queue lifecycle for a second offering manifest", async () => {
    const fixture = await setup();
    const secondManifest = {
      offeringId: "fal-fixture:image:aggregator",
      endpoint: "fal-ai/fixture-image",
      input: { prompt: "transport-only fixture" },
    } as const;

    expect(await fixture.transport.upload(new Blob(["fixture"], { type: "text/plain" }))).toBe(
      "https://v3.fal.media/files/uploaded.png",
    );
    const handle = await fixture.transport.submit(secondManifest.endpoint, secondManifest.input);
    expect(decodeFalHandle(handle)).toMatchObject({ endpoint: secondManifest.endpoint });
    expect(await fixture.transport.status(handle)).toMatchObject({
      outcome: "queued",
      queuePosition: 2,
    });
    fixture.setStatus({
      status: "COMPLETED",
      request_id: "fal-request-1",
      response_url: "https://queue.fal.run/response",
      status_url: "https://queue.fal.run/status",
      cancel_url: "https://queue.fal.run/cancel",
      logs: [],
    });
    fixture.setResult({ image: { url: "https://v3.fal.media/files/fixture.png" } });
    expect(await fixture.transport.status(handle)).toEqual({ outcome: "completed" });
    expect(await fixture.transport.result(handle)).toEqual({
      image: { url: "https://v3.fal.media/files/fixture.png" },
    });
    expect(await fixture.transport.cancel(handle)).toBe("accepted");
  });

  test("uses fal-specific duration and resolution schema", async () => {
    const fixture = await setup();
    const accepted = await fixture.generate.start(
      request({
        mode: "text",
        values: {
          prompt: "A camera tracks a fox",
          durationSeconds: 5,
          resolution: "4K",
          aspectRatio: "16:9",
          enablePromptExpansion: true,
          promptExpansionMode: "balanced",
        },
        assets: [],
      }),
    );
    expect(decodeFalHandle(accepted.providerHandle)).toEqual({
      v: 1,
      endpoint: "minimax/h3/text-to-video",
      requestId: "fal-request-1",
    });
    expect(fixture.submissions).toEqual([
      {
        endpoint: "minimax/h3/text-to-video",
        input: {
          prompt: "A camera tracks a fox",
          duration: 5,
          resolution: "4K",
          sync_mode: false,
          enable_prompt_expansion: true,
          prompt_expansion_mode: "balanced",
          aspect_ratio: "16:9",
        },
      },
    ]);

    await expect(
      fixture.generate.start(
        request({
          mode: "text",
          values: {
            prompt: "four seconds",
            durationSeconds: 4,
            resolution: "768P",
            aspectRatio: "16:9",
          },
          assets: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ProviderExecutionError);
    expect(fixture.submissions).toHaveLength(1);
  });

  test("maps keyframes to the image endpoint and uploads local blobs server-side", async () => {
    const fixture = await setup();
    await fixture.generate.start(
      request({
        mode: "keyframes",
        values: {
          prompt: "Move from morning to night",
          durationSeconds: 8,
          resolution: "2K",
          aspectRatio: "adaptive",
        },
        assets: [
          { assetId: "blob-image", kind: "image", role: "first_frame" },
          { assetId: "last", kind: "image", role: "last_frame" },
        ],
      }),
    );
    expect(fixture.uploads).toHaveLength(1);
    expect(fixture.submissions[0]).toEqual({
      endpoint: "minimax/h3/image-to-video",
      input: {
        prompt: "Move from morning to night",
        duration: 8,
        resolution: "2K",
        sync_mode: false,
        image_url: "https://v3.fal.media/files/uploaded.png",
        end_image_url: "https://assets.example/last",
      },
    });
  });

  test("rejects audio-only fal references and normalizes queue result/cancel", async () => {
    const fixture = await setup();
    await expect(
      fixture.generate.start(
        request({
          mode: "reference",
          values: { prompt: "Follow Audio 1", durationSeconds: 5, resolution: "768P" },
          assets: [
            {
              assetId: "audio",
              kind: "audio",
              role: "reference_audio",
              durationSeconds: 5,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ProviderExecutionError);
    expect(fixture.submissions).toHaveLength(0);

    const handle = await fixture.generate.start(
      request({
        mode: "text",
        values: {
          prompt: "A fox",
          durationSeconds: 5,
          resolution: "768P",
          aspectRatio: "16:9",
        },
        assets: [],
      }),
    );
    fixture.setStatus({
      status: "COMPLETED",
      request_id: "fal-request-1",
      response_url: "https://queue.fal.run/response",
      status_url: "https://queue.fal.run/status",
      cancel_url: "https://queue.fal.run/cancel",
      logs: [],
    });
    expect(await fixture.videoStatus.status(handle.providerHandle)).toEqual({
      outcome: "succeeded",
      outputs: [{ kind: "video", url: "https://v3.fal.media/files/h3.mp4", mimeType: "video/mp4" }],
    });
    expect(await fixture.cancel.cancel(handle.providerHandle)).toEqual({ outcome: "accepted" });
  });
});
