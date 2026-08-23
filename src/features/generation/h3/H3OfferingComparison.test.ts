import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import H3OfferingComparison from "./H3OfferingComparison.vue";
import type { PreflightResult, ProviderCatalog } from "@/features/models/catalog";

const catalog = {
  schemaVersion: "2.0.0",
  providers: [
    {
      id: "minimax",
      name: "MiniMax",
      credentialSlots: [{ slot: "apiKey", environmentVariables: [] }],
    },
    {
      id: "fal",
      name: "fal.ai",
      credentialSlots: [{ slot: "apiKey", environmentVariables: [] }],
    },
  ],
  models: [],
  capabilitySchemas: [],
  priceSnapshots: [],
  offerings: [
    {
      id: "minimax:h3:official",
      canonicalModelId: "minimax:h3",
      providerId: "minimax",
      providerModelId: "MiniMax-H3",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "video.generate",
          capabilitySchemaId: "official",
          enabled: true,
          outputProfiles: [{ resolution: "2K", delivery: "native" }],
        },
      ],
      support: { implementation: "implemented", evidence: ["contract_verified"] },
    },
    {
      id: "minimax:h3:fal",
      canonicalModelId: "minimax:h3",
      providerId: "fal",
      providerModelId: "minimax/h3",
      accessChannel: "aggregator",
      lifecycle: "stable",
      operations: [
        {
          operation: "video.generate",
          capabilitySchemaId: "fal",
          enabled: true,
          outputProfiles: [{ resolution: "2K", delivery: "upscaled", sourceResolution: "768P" }],
        },
      ],
      support: { implementation: "implemented", evidence: ["contract_verified"] },
    },
  ],
} as ProviderCatalog;

const preflight = {
  schemaVersion: "2.0.0",
  canonicalModelId: "minimax:h3",
  operation: "video.generate",
  offerings: catalog.offerings.map((offering) => ({
    offeringId: offering.id,
    providerId: offering.providerId,
    accessChannel: offering.accessChannel,
    eligible: true,
    violations: [],
    warnings: [],
    cost: {
      offeringId: offering.id,
      status: "complete",
      originalTotal: { currency: offering.providerId === "fal" ? "USD" : "CNY", amount: "8.00" },
      displayTotal: { currency: "CNY", amount: offering.providerId === "fal" ? "8.82" : "8.00" },
      components: [],
      issues: [],
      priceAsOf: "2026-08-23",
      priceSourceUrl: "https://example.com/pricing",
    },
  })),
  selection: { status: "unavailable", reasonCodes: ["policy.quality_profile_mismatch"] },
} as PreflightResult;

describe("H3OfferingComparison", () => {
  test("keeps official native and fal upscaled delivery visibly distinct", async () => {
    const wrapper = mount(H3OfferingComparison, {
      props: {
        catalog,
        preflight,
        selectedOfferingId: "minimax:h3:official",
        resolution: "2K",
      },
      global: { mocks: { $t: (key: string) => key } },
    });

    expect(wrapper.text()).toContain("providerPlatform.h3.delivery.native");
    expect(wrapper.text()).toContain("providerPlatform.h3.delivery.upscaled");
    expect(wrapper.get('[role="alert"]').text()).toContain("providerPlatform.h3.qualityMismatch");
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["minimax:h3:fal"]);
  });
});
