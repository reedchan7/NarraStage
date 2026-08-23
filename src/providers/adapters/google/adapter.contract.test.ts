import { describe, expect, test } from "bun:test";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { createGoogleAdapter } from "@/providers/adapters/google";
import type {
  GoogleNativeClient,
  GoogleNativeInteraction,
  GoogleNativeVideoOperation,
} from "@/providers/adapters/google/nativeClient";
import { decodeGoogleHandle } from "@/providers/adapters/google/handle";
import type {
  ImageEditPort,
  ImageGeneratePort,
  FilesUploadPort,
  LanguageGeneratePort,
  OperationPort,
  ProviderAssetResolver,
  VideoGeneratePort,
  VideoStatusPort,
} from "@/providers/ports";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXsAAAAASUVORK5CYII=";

function port<T extends OperationPort["operation"]>(
  ports: readonly OperationPort[],
  operation: T,
): Extract<OperationPort, { operation: T }> {
  const found = ports.find((candidate) => candidate.operation === operation);
  if (!found) throw new Error(`missing ${operation}`);
  return found as Extract<OperationPort, { operation: T }>;
}

function fetchFunction(
  implementation: (
    input: Parameters<FetchFunction>[0],
    init?: Parameters<FetchFunction>[1],
  ) => Promise<Response>,
): FetchFunction {
  return Object.assign(implementation, { preconnect() {} });
}

async function vault() {
  const value = new MemoryCredentialVault();
  await value.set({ providerId: "google", slot: "apiKey" }, "google-contract-key");
  return value;
}

function nativeClient(input: {
  create?: (params: Record<string, unknown>) => Promise<GoogleNativeInteraction>;
  get?: (id: string) => Promise<GoogleNativeInteraction>;
  cancel?: (id: string) => Promise<GoogleNativeInteraction>;
  generateVideos?: (params: Record<string, unknown>) => Promise<GoogleNativeVideoOperation>;
  getVideosOperation?: (params: {
    operation: GoogleNativeVideoOperation;
  }) => Promise<GoogleNativeVideoOperation>;
  uploadFile?: GoogleNativeClient["files"]["upload"];
  getFile?: GoogleNativeClient["files"]["get"];
}): GoogleNativeClient {
  return {
    interactions: {
      create: input.create ?? (async () => ({ id: "unused", status: "completed" })),
      get: input.get ?? (async () => ({ id: "unused", status: "completed" })),
      cancel: input.cancel ?? (async () => ({ id: "unused", status: "cancelled" })),
    },
    models: {
      generateVideos:
        input.generateVideos ?? (async () => ({ name: "operations/unused", done: false })),
    },
    operations: {
      getVideosOperation:
        input.getVideosOperation ?? (async () => ({ name: "operations/unused", done: false })),
    },
    files: {
      upload:
        input.uploadFile ??
        (async () => ({
          name: "files/unused",
          uri: "https://unused",
          state: "ACTIVE",
        })),
      get:
        input.getFile ??
        (async () => ({
          name: "files/unused",
          uri: "https://unused",
          state: "ACTIVE",
        })),
    },
  };
}

const assetResolver: ProviderAssetResolver = {
  async resolve(asset) {
    const bytes =
      asset.kind === "image"
        ? Buffer.from(onePixelPng, "base64")
        : Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    return {
      assetId: asset.assetId,
      kind: asset.kind,
      mimeType: asset.kind === "image" ? "image/png" : "video/mp4",
      byteLength: bytes.byteLength,
      sha256: "a".repeat(64),
      source: { kind: "blob", blob: new Blob([bytes]) },
    };
  },
};

describe("Google official adapter contract", () => {
  test("maps Gemini 3.7 thinking and Search grounding through the language port", async () => {
    let wire: Record<string, unknown> | undefined;
    const adapter = createGoogleAdapter({
      credentialVault: await vault(),
      fetch: fetchFunction(async (_input, init) => {
        expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("google-contract-key");
        wire = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Grounded answer" }],
                },
                finishReason: "STOP",
                groundingMetadata: {
                  groundingChunks: [
                    {
                      web: {
                        uri: "https://ai.google.dev/gemini-api/docs/google-search",
                        title: "Grounding with Google Search",
                      },
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 3,
              totalTokenCount: 8,
              thoughtsTokenCount: 2,
            },
            modelVersion: "gemini-3.7-flash-001",
            responseId: "gemini-response-1",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    });
    const generate = port(adapter.ports, "language.generate") as LanguageGeneratePort;
    const result = await generate.generate({
      schemaVersion: "1.0.0",
      offeringId: "google:gemini-3.7-flash:official",
      idempotencyKey: "google-language-contract",
      input: {
        messages: [{ role: "user", content: [{ type: "text", text: "Latest weather" }] }],
        thinking: { mode: "enabled", effort: "low" },
        grounding: { mode: "web_search" },
      },
    });

    expect(wire).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
      tools: [{ googleSearch: {} }],
    });
    expect(result).toMatchObject({
      text: "Grounded answer",
      resolvedModelId: "gemini-3.7-flash",
      providerRequestId: "gemini-response-1",
      usage: { inputTokens: 5, outputTokens: 5, reasoningTokens: 2 },
      sources: [
        {
          sourceType: "url",
          url: "https://ai.google.dev/gemini-api/docs/google-search",
          title: "Grounding with Google Search",
        },
      ],
    });
  });

  test("uses the native Interactions API contract for Nano Banana generation and editing", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = nativeClient({
      async create(params) {
        calls.push(params);
        return {
          id: `interaction-${calls.length}`,
          status: "completed",
          output_text: "caption",
          output_image: {
            type: "image",
            data: onePixelPng,
            mime_type: "image/png",
          },
          usage: { total_tokens: 12 },
        };
      },
    });
    const adapter = createGoogleAdapter({
      credentialVault: await vault(),
      nativeClientFactory({ apiKey }) {
        expect(apiKey).toBe("google-contract-key");
        return client;
      },
      assetResolver,
    });
    const generate = port(adapter.ports, "image.generate") as ImageGeneratePort;
    const edit = port(adapter.ports, "image.edit") as ImageEditPort;
    expect(
      await generate.generate({
        schemaVersion: "1.0.0",
        offeringId: "google:nano-banana-2:official",
        idempotencyKey: "nano-generate-contract",
        input: {
          mode: "text",
          values: {
            prompt: "A weather infographic",
            aspectRatio: "16:9",
            imageSize: "4K",
            grounding: true,
            includeText: true,
          },
          assets: [],
        },
      }),
    ).toMatchObject({
      providerRequestId: "interaction-1",
      text: "caption",
      outputs: [{ kind: "image", mimeType: "image/png" }],
    });
    await edit.edit({
      schemaVersion: "1.0.0",
      offeringId: "google:nano-banana-2-lite:official",
      idempotencyKey: "nano-edit-contract",
      input: {
        mode: "reference",
        values: { prompt: "Change the background", imageSize: "1K" },
        assets: [{ assetId: "owned-image", kind: "image", role: "reference_image" }],
      },
    });

    expect(calls[0]).toMatchObject({
      model: "gemini-3.1-flash-image",
      input: "A weather infographic",
      tools: [{ type: "google_search" }],
      response_format: [
        { type: "text" },
        {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: "16:9",
          image_size: "4K",
        },
      ],
    });
    expect(calls[1]).toMatchObject({
      model: "gemini-3.1-flash-lite-image",
      input: [
        { type: "text", text: "Change the background" },
        { type: "image", mime_type: "image/png" },
      ],
    });
  });

  test("uploads owned large-file assets through the native resumable Files boundary", async () => {
    let uploadCall: Parameters<GoogleNativeClient["files"]["upload"]>[0] | undefined;
    const client = nativeClient({
      async uploadFile(params) {
        uploadCall = params;
        return {
          name: "files/document-1",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/document-1",
          mimeType: "application/pdf",
          sizeBytes: "12",
          state: "ACTIVE",
          expirationTime: "2026-08-25T00:00:00Z",
        };
      },
    });
    const adapter = createGoogleAdapter({
      credentialVault: await vault(),
      nativeClientFactory: () => client,
      fileAssetResolver: {
        async resolveFile(assetId, context) {
          expect(assetId).toBe(`sha256:${"b".repeat(64)}`);
          expect(context?.principalId).toBe("owner-1");
          return {
            assetId,
            mimeType: "application/pdf",
            byteLength: 12,
            sha256: "b".repeat(64),
            filename: "source.pdf",
            source: {
              kind: "blob",
              blob: new Blob(["%PDF-1.7\n%%EOF"], { type: "application/pdf" }),
            },
          };
        },
      },
    });
    const files = port(adapter.ports, "files.upload") as FilesUploadPort;
    expect(
      await files.upload(
        {
          schemaVersion: "1.0.0",
          offeringId: "google:gemini-3.7-flash:official",
          idempotencyKey: "google-owned-file-contract",
          input: { source: "owned_asset", assetId: `sha256:${"b".repeat(64)}` },
        },
        { principalId: "owner-1" },
      ),
    ).toMatchObject({
      providerId: "google",
      fileId: "https://generativelanguage.googleapis.com/v1beta/files/document-1",
      mediaType: "application/pdf",
      filename: "source.pdf",
      byteLength: 12,
    });
    expect(uploadCall).toMatchObject({
      config: { mimeType: "application/pdf", displayName: "source.pdf" },
    });
  });

  test("routes Veo reference generation to a durable operation and normalizes inline output", async () => {
    let startCall: Record<string, unknown> | undefined;
    const client = nativeClient({
      async generateVideos(params) {
        startCall = params;
        return { name: "operations/veo-1", done: false };
      },
      async getVideosOperation() {
        return {
          name: "operations/veo-1",
          done: true,
          response: {
            generatedVideos: [
              {
                video: {
                  uri: "https://generativelanguage.googleapis.com/v1beta/files/veo-1:download",
                  mimeType: "video/mp4",
                },
              },
            ],
          },
        };
      },
    });
    const adapter = createGoogleAdapter({
      credentialVault: await vault(),
      nativeClientFactory: () => client,
      assetResolver,
    });
    const generate = port(adapter.ports, "video.generate") as VideoGeneratePort;
    const status = port(adapter.ports, "video.status") as VideoStatusPort;
    const accepted = await generate.start({
      schemaVersion: "1.0.0",
      offeringId: "google:veo-3.1-fast:official",
      idempotencyKey: "veo-reference-contract",
      input: {
        mode: "reference",
        values: {
          prompt: "Keep this character",
          durationSeconds: 8,
          resolution: "4K",
          aspectRatio: "9:16",
        },
        assets: [{ assetId: "character", kind: "image", role: "reference_image" }],
      },
    });
    expect(decodeGoogleHandle(accepted.providerHandle)).toEqual({
      v: 1,
      kind: "veo",
      modelId: "veo-3.1-fast-generate-preview",
      operationName: "operations/veo-1",
    });
    expect(startCall).toMatchObject({
      model: "veo-3.1-fast-generate-preview",
      config: {
        durationSeconds: 8,
        resolution: "4k",
        aspectRatio: "9:16",
        referenceImages: [{ referenceType: "ASSET" }],
      },
    });
    expect(await status.status(accepted.providerHandle)).toMatchObject({
      outcome: "succeeded",
      outputs: [
        {
          kind: "video",
          mimeType: "video/mp4",
          url: "https://generativelanguage.googleapis.com/v1beta/files/veo-1:download",
          authorization: {
            kind: "credential_header",
            credentialSlot: "apiKey",
            headerName: "x-goog-api-key",
            allowedOrigins: ["https://generativelanguage.googleapis.com"],
          },
        },
      ],
      providerRequestId: "operations/veo-1",
    });
  });

  test("keeps Omni on its own Interactions lifecycle and rejects current unsupported media", async () => {
    const created: Record<string, unknown>[] = [];
    const client = nativeClient({
      async create(params) {
        created.push(params);
        return { id: `omni-interaction-${created.length}`, status: "queued" };
      },
      async get(id) {
        return {
          id,
          status: "completed",
          output_video: {
            type: "video",
            data: "AAAAFGZ0eXBpc29t",
            mime_type: "video/mp4",
          },
        };
      },
    });
    const adapter = createGoogleAdapter({
      credentialVault: await vault(),
      nativeClientFactory: () => client,
      assetResolver,
    });
    const generate = port(adapter.ports, "video.generate") as VideoGeneratePort;
    const status = port(adapter.ports, "video.status") as VideoStatusPort;
    const accepted = await generate.start({
      schemaVersion: "1.0.0",
      offeringId: "google:gemini-omni-flash:official",
      idempotencyKey: "omni-contract",
      input: {
        mode: "images",
        values: {
          prompt: "Animate this product",
          durationSeconds: 6,
          aspectRatio: "16:9",
        },
        assets: [{ assetId: "product", kind: "image", role: "reference_image" }],
      },
    });
    expect(decodeGoogleHandle(accepted.providerHandle)).toMatchObject({
      kind: "omni",
      interactionId: "omni-interaction-1",
    });
    expect(created[0]).toMatchObject({
      model: "gemini-omni-flash-preview",
      background: true,
      store: true,
      response_format: {
        type: "video",
        delivery: "uri",
        duration: "6s",
        resolution: "720p",
      },
      generation_config: { video_config: { task: "reference_to_video" } },
    });
    expect(await status.status(accepted.providerHandle)).toMatchObject({
      outcome: "succeeded",
      outputs: [{ kind: "video", mimeType: "video/mp4" }],
    });

    await generate.start(
      {
        schemaVersion: "1.0.0",
        offeringId: "google:gemini-omni-flash:official",
        idempotencyKey: "omni-edit-contract",
        input: {
          mode: "edit",
          values: { prompt: "Make the product blue", durationSeconds: 6 },
          assets: [],
        },
      },
      {
        principalId: "owner-1",
        continuation: {
          parentJobId: "00000000-0000-4000-8000-000000000001",
          providerId: "google",
          offeringId: "google:gemini-omni-flash:official",
          providerModelId: "gemini-omni-flash-preview",
          providerRequestId: "omni-interaction-1",
        },
      },
    );
    expect(created[1]).toMatchObject({
      previous_interaction_id: "omni-interaction-1",
      input: "Make the product blue",
      generation_config: { video_config: { task: "edit" } },
    });

    await expect(
      generate.start({
        schemaVersion: "1.0.0",
        offeringId: "google:gemini-omni-flash:official",
        idempotencyKey: "omni-edit-without-parent-contract",
        input: { mode: "edit", values: { prompt: "Make it blue" }, assets: [] },
      }),
    ).rejects.toMatchObject({
      providerError: { code: "google.omni_edit_continuation_required" },
    });

    await expect(
      generate.start({
        schemaVersion: "1.0.0",
        offeringId: "google:gemini-omni-flash:official",
        idempotencyKey: "omni-audio-contract",
        input: {
          mode: "images",
          values: { prompt: "Use the sound" },
          assets: [{ assetId: "audio", kind: "audio", role: "reference_audio" }],
        },
      }),
    ).rejects.toMatchObject({
      providerError: { code: "google.omni_only_image_references_supported" },
    });
  });
});
