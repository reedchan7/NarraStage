import { describe, expect, test } from "bun:test";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { OfferingAvailabilityService } from "@/providers/availability/offeringAvailability";
import { defineProviderAdapter } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";

describe("offering runtime availability", () => {
  const healthSnapshot = (
    health: "unknown" | "healthy" | "degraded" | "unhealthy",
    supportedOperations: Array<"video.generate"> = [],
    resolvedProviderModelId?: string,
  ) => ({
    providerId: "fal",
    offeringId: "minimax:h3:fal",
    providerModelId: "minimax/h3",
    deploymentRegion: "global",
    health,
    capabilitiesObserved: supportedOperations.length > 0,
    supportedOperations,
    revisionObserved: Boolean(resolvedProviderModelId),
    ...(resolvedProviderModelId ? { resolvedProviderModelId } : {}),
  });
  const acceptedProductEvidence = (offeringId: string) => ({
    offeringId,
    providerId: "fal",
    requestedProviderModelId: "minimax/h3",
    resolvedProviderModelId: "minimax/h3@accepted-revision",
    deploymentRegion: "global",
    adapterManifestId: "fal-h3",
    adapterManifestSha256: "a".repeat(64),
    acceptanceSuiteId: "provider-product-acceptance-v1",
    acceptanceSuiteSha256: "c".repeat(64),
    sdkPackage: "@fal-ai/client",
    sdkVersion: "1.10.1",
    providerApiRevision: "queue-v1",
    verifiedAt: "2026-08-23T12:00:00Z",
    runId: "live-fal-h3",
    reportSha256: "b".repeat(64),
    executionCommitSha: "1".repeat(40),
    executionWorkflowRunId: "workflow-live-fal-h3",
    executorManifestSha256: "e".repeat(64),
  });
  test("requires both an implemented port and every declared provider credential", async () => {
    const vault = new MemoryCredentialVault();
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "fal",
        ports: [
          {
            operation: "video.generate" as const,
            async start() {
              return { providerHandle: "task", providerOutcome: "queued" as const };
            },
          },
        ],
      }),
    );
    const service = new OfferingAvailabilityService(builtinCatalog, registry, vault);

    expect(await service.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: false,
      reasonCodes: ["credential.missing"],
      requiredEvidence: "contract_verified",
    });
    await vault.set({ providerId: "fal", slot: "apiKey" }, "test-key");
    expect(await service.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: true,
      reasonCodes: [],
    });
    expect(await service.resolve("minimax:h3:official", "video.generate")).toMatchObject({
      available: false,
      reasonCodes: expect.arrayContaining(["provider.operation_unavailable", "credential.missing"]),
    });
  });

  test("production policy requires independent fresh evidence and recent healthy connectivity", async () => {
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "fal", slot: "apiKey" }, "test-key");
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "fal",
        ports: [
          {
            operation: "video.generate" as const,
            async start() {
              return { providerHandle: "task", providerOutcome: "queued" as const };
            },
          },
        ],
      }),
    );
    const service = new OfferingAvailabilityService(builtinCatalog, registry, vault, {
      requiredEvidence: "product_accepted",
      deploymentRegion: "global",
      now: () => Date.parse("2026-08-24T00:00:00Z"),
      providerHealth: () => healthSnapshot("unknown"),
      requireHealthy: true,
      productEvidence: () => undefined,
    });

    expect(await service.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: false,
      health: "unknown",
      requiredEvidence: "product_accepted",
      reasonCodes: expect.arrayContaining([
        "provider.required_evidence_missing",
        "provider.health_unknown",
      ]),
    });

    const accepted = new OfferingAvailabilityService(builtinCatalog, registry, vault, {
      requiredEvidence: "product_accepted",
      deploymentRegion: "global",
      now: () => Date.parse("2026-08-24T00:00:00Z"),
      providerHealth: () => healthSnapshot("healthy", ["video.generate"]),
      requireHealthy: true,
      productEvidence: acceptedProductEvidence,
    });
    expect(await accepted.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: true,
      health: "healthy",
      reasonCodes: [],
    });
  });

  test("treats expiring advisory health as non-blocking but rejects observed capability and revision drift", async () => {
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "fal", slot: "apiKey" }, "test-key");
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "fal",
        ports: [
          {
            operation: "video.generate" as const,
            async start() {
              return { providerHandle: "task", providerOutcome: "queued" as const };
            },
          },
        ],
      }),
    );
    const policy = {
      requiredEvidence: "product_accepted" as const,
      deploymentRegion: "global",
      now: () => Date.parse("2026-08-24T00:00:00Z"),
      productEvidence: acceptedProductEvidence,
    };
    const expiredAdvisory = new OfferingAvailabilityService(builtinCatalog, registry, vault, {
      ...policy,
      providerHealth: () => healthSnapshot("unknown"),
    });
    expect(await expiredAdvisory.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: true,
      health: "unknown",
    });

    const freshlyDegraded = new OfferingAvailabilityService(builtinCatalog, registry, vault, {
      ...policy,
      providerHealth: () => healthSnapshot("degraded"),
    });
    expect(await freshlyDegraded.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: false,
      health: "degraded",
      reasonCodes: ["provider.health_unavailable"],
    });

    const drifted = new OfferingAvailabilityService(builtinCatalog, registry, vault, {
      ...policy,
      providerHealth: () =>
        healthSnapshot("healthy", ["video.generate"], "minimax/h3@changed-revision"),
    });
    expect(await drifted.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: false,
      reasonCodes: ["provider.model_revision_unverified"],
    });

    const capabilityRemoved = new OfferingAvailabilityService(builtinCatalog, registry, vault, {
      ...policy,
      providerHealth: () => ({
        ...healthSnapshot("healthy"),
        capabilitiesObserved: true,
      }),
    });
    expect(await capabilityRemoved.resolve("minimax:h3:fal", "video.generate")).toMatchObject({
      available: false,
      reasonCodes: ["provider.operation_health_unavailable"],
    });
  });
});
