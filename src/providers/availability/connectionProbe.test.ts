import { describe, expect, test } from "bun:test";
import { ProviderConnectionProbe } from "@/providers/availability/connectionProbe";
import { ProviderHealthMonitor } from "@/providers/availability/providerHealth";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";

describe("provider connection probe", () => {
  test("records and expires health independently for each exact DeepSeek offering", async () => {
    let now = Date.parse("2026-08-23T00:00:00Z");
    const monitor = new ProviderHealthMonitor(() => now, 1_000);
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "deepseek", slot: "apiKey" }, "test-key");
    const probe = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      fetch: async (_url, init) => {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
        return Response.json({ data: [{ id: "deepseek-v4-pro" }] });
      },
    });

    expect(await probe.check("deepseek")).toMatchObject({ health: "degraded" });
    expect(monitor.get("deepseek:v4-pro:official")).toMatchObject({
      health: "healthy",
      capabilitiesObserved: false,
      revisionObserved: false,
    });
    expect(monitor.get("deepseek:v4-flash:official")).toMatchObject({
      health: "unhealthy",
      reasonCode: "provider.model_unavailable",
    });
    now += 1_001;
    expect(monitor.get("deepseek:v4-pro:official").health).toBe("unknown");
  });

  test("requires Google to return the exact requested model identity", async () => {
    const monitor = new ProviderHealthMonitor();
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "google", slot: "apiKey" }, "test-key");
    const requestedUrls: string[] = [];
    const probe = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      fetch: async (url, init) => {
        requestedUrls.push(String(url));
        expect(String(url)).not.toContain("test-key");
        expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-key");
        return Response.json({ name: "models/unrelated-model" });
      },
    });

    expect(await probe.check("google")).toMatchObject({ health: "unhealthy" });
    expect(requestedUrls).toContain(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash",
    );
    expect(monitor.get("google:gemini-3.7-flash:official")).toMatchObject({
      health: "unhealthy",
      reasonCode: "provider.model_identity_mismatch",
    });
  });

  test("does not promote an exact Google model without the required generation methods", async () => {
    const monitor = new ProviderHealthMonitor();
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "google", slot: "apiKey" }, "test-key");
    const probe = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      fetch: async (url) => {
        if (String(url).includes("/files?")) return Response.json({ files: [] });
        const model = decodeURIComponent(String(url).split("/models/")[1]!);
        return Response.json({
          name: `models/${model}`,
          version: "001",
          supportedGenerationMethods: [],
        });
      },
    });
    await probe.check("google");
    expect(monitor.get("google:gemini-3.7-flash:official")).toMatchObject({
      health: "healthy",
      capabilitiesObserved: true,
      supportedOperations: ["files.upload"],
      revisionObserved: true,
      resolvedProviderModelId: "gemini-3.7-flash@001",
    });
  });

  test("keeps a model-specific Google 403 isolated to that offering", async () => {
    const monitor = new ProviderHealthMonitor();
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "google", slot: "apiKey" }, "test-key");
    let modelCalls = 0;
    const probe = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      fetch: async (url) => {
        if (String(url).includes("/files?")) return Response.json({ files: [] });
        modelCalls += 1;
        const model = decodeURIComponent(String(url).split("/models/")[1]!);
        if (model === "gemini-3.7-flash") return new Response("", { status: 403 });
        return Response.json({
          name: `models/${model}`,
          supportedGenerationMethods: [
            model.startsWith("veo-") || model.includes("omni")
              ? "predictLongRunning"
              : "generateContent",
          ],
        });
      },
    });
    expect(await probe.check("google")).toMatchObject({ health: "degraded" });
    expect(modelCalls).toBeGreaterThan(1);
    expect(monitor.get("google:gemini-3.7-flash:official")).toMatchObject({
      health: "unhealthy",
      reasonCode: "provider.model_access_denied",
    });
    expect(monitor.get("google:veo-3.1:official")).toMatchObject({
      health: "healthy",
      supportedOperations: ["video.generate", "video.status"],
    });
  });

  test("distinguishes invalid credentials from transient failures", async () => {
    const monitor = new ProviderHealthMonitor();
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "google", slot: "apiKey" }, "test-key");
    const invalid = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      fetch: async () => new Response("", { status: 401 }),
    });
    expect(await invalid.check("google")).toMatchObject({
      health: "unhealthy",
      reasonCode: "credential.invalid",
    });

    const transient = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    expect(await transient.check("google")).toMatchObject({ health: "degraded" });
  });

  test("requires fal credential connectivity and every H3 endpoint to be active", async () => {
    const monitor = new ProviderHealthMonitor();
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "fal", slot: "apiKey" }, "test-key");
    let credentialCalls = 0;
    const probe = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      falProbe: async () => {
        credentialCalls += 1;
      },
      fetch: async (url) => {
        const endpoint = new URL(String(url)).searchParams.get("endpoint_id")!;
        if (String(url).includes("openapi.json")) {
          return Response.json({
            paths: {
              [`/${endpoint}`]: { post: {} },
              [`/${endpoint}/requests/{request_id}/status`]: { get: {} },
              [`/${endpoint}/requests/{request_id}`]: { get: {} },
              [`/${endpoint}/requests/{request_id}/cancel`]: { put: {} },
            },
          });
        }
        return Response.json({
          models: [
            {
              endpoint_id: endpoint,
              metadata: { status: "active", updated_at: "2026-08-19T20:14:50.287Z" },
            },
          ],
        });
      },
    });
    expect(await probe.check("fal")).toMatchObject({ health: "healthy" });
    expect(credentialCalls).toBe(1);
    expect(monitor.get("minimax:h3:fal")).toMatchObject({
      health: "healthy",
      capabilitiesObserved: true,
      supportedOperations: ["video.generate", "video.status", "video.cancel"],
      revisionObserved: true,
    });
    const firstRevision = monitor.get("minimax:h3:fal").resolvedProviderModelId;
    const changedReferenceProbe = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      falProbe: async () => {},
      fetch: async (url) => {
        const endpoint = new URL(String(url)).searchParams.get("endpoint_id")!;
        if (String(url).includes("openapi.json")) {
          return Response.json({
            paths: {
              [`/${endpoint}`]: { post: {} },
              [`/${endpoint}/requests/{request_id}/status`]: { get: {} },
              [`/${endpoint}/requests/{request_id}`]: { get: {} },
              [`/${endpoint}/requests/{request_id}/cancel`]: { put: {} },
            },
          });
        }
        return Response.json({
          models: [
            {
              endpoint_id: endpoint,
              metadata: {
                status: "active",
                updated_at: endpoint.endsWith("reference-to-video")
                  ? "2026-08-20T00:00:00.000Z"
                  : "2026-08-19T20:14:50.287Z",
              },
            },
          ],
        });
      },
    });
    await changedReferenceProbe.check("fal");
    expect(monitor.get("minimax:h3:fal").resolvedProviderModelId).not.toBe(firstRevision);

    const revisionUnavailable = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      falProbe: async () => {},
      fetch: async (url) => {
        const endpoint = new URL(String(url)).searchParams.get("endpoint_id")!;
        if (String(url).includes("openapi.json")) {
          return Response.json({
            paths: {
              [`/${endpoint}`]: { post: {} },
              [`/${endpoint}/requests/{request_id}/status`]: { get: {} },
              [`/${endpoint}/requests/{request_id}`]: { get: {} },
              [`/${endpoint}/requests/{request_id}/cancel`]: { put: {} },
            },
          });
        }
        return Response.json({
          models: [{ endpoint_id: endpoint, metadata: { status: "active" } }],
        });
      },
    });
    expect(await revisionUnavailable.check("fal")).toMatchObject({
      health: "degraded",
    });
    expect(monitor.get("minimax:h3:fal")).toMatchObject({
      health: "degraded",
      reasonCode: "provider.endpoint_revision_unavailable",
      capabilitiesObserved: true,
      revisionObserved: false,
    });

    const unavailable = new ProviderConnectionProbe({
      credentialVault: vault,
      healthMonitor: monitor,
      falProbe: async () => {},
      fetch: async () => Response.json({ models: [] }),
    });
    expect(await unavailable.check("fal")).toMatchObject({
      health: "unhealthy",
      reasonCode: "provider.endpoint_unavailable",
    });
  });
});
