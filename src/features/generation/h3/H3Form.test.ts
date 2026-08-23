import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import H3Form from "./H3Form.vue";
import type { CatalogCapability, CatalogOffering } from "@/features/models/catalog";

const capability: CatalogCapability = {
  id: "minimax:h3:official:v1",
  schemaVersion: "1.0.0",
  operation: "video.generate",
  fields: [
    { path: "prompt", kind: "text", label: "Prompt", required: true, maximumLength: 7_000 },
    { path: "durationSeconds", kind: "integer", label: "Duration", required: true, minimum: 4, maximum: 15 },
    { path: "resolution", kind: "enum", label: "Resolution", required: true, enumValues: ["768P", "2K"] },
    {
      path: "aspectRatio",
      kind: "enum",
      label: "Aspect ratio",
      required: false,
      enumValues: ["adaptive", "16:9", "9:16"],
    },
  ],
  assetModes: [
    {
      id: "text",
      label: "Text",
      roles: [],
      maximumTotalAssets: 0,
      fieldRules: [{ path: "aspectRatio", required: true, enumValues: ["16:9", "9:16"] }],
    },
    {
      id: "keyframes",
      label: "Keyframes",
      roles: [{ role: "first_frame", kinds: ["image"], minimum: 1, maximum: 1 }],
      maximumTotalAssets: 2,
      fieldRules: [{ path: "aspectRatio", enumValues: ["adaptive"] }],
    },
  ],
};

const offering: CatalogOffering = {
  id: "minimax:h3:official",
  canonicalModelId: "minimax:h3",
  providerId: "minimax",
  providerModelId: "MiniMax-H3",
  accessChannel: "official",
  lifecycle: "stable",
  operations: [
    {
      operation: "video.generate",
      capabilitySchemaId: capability.id,
      enabled: true,
      outputProfiles: [
        { resolution: "768P", delivery: "native" },
        { resolution: "2K", delivery: "native" },
      ],
    },
  ],
  support: { implementation: "implemented", evidence: ["contract_verified"] },
};

const global = {
  mocks: {
    $t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  },
};

describe("H3Form", () => {
  test("derives mode fields and discloses official native 2K output", async () => {
    const wrapper = mount(H3Form, {
      props: {
        capability,
        offering,
        modelValue: {
          mode: "text",
          values: { prompt: "A paper boat", durationSeconds: 8, resolution: "2K", aspectRatio: "16:9" },
          assets: [],
        },
      },
      global,
    });

    expect(wrapper.get(".qualityNote").attributes("data-delivery")).toBe("native");
    expect(wrapper.get(".qualityNote").text()).toContain("providerPlatform.h3.quality.native");
    await wrapper.get('button[data-mode="keyframes"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toMatchObject({
      mode: "keyframes",
      values: { aspectRatio: "adaptive" },
      assets: [],
    });
  });

  test("renders canonical role counts and violations", () => {
    const wrapper = mount(H3Form, {
      props: {
        capability,
        offering,
        modelValue: {
          mode: "keyframes",
          values: { prompt: "A paper boat", durationSeconds: 8, resolution: "768P", aspectRatio: "adaptive" },
          assets: [],
        },
        assets: [{ assetId: "pending", kind: "image", role: "first_frame" }],
        violations: [
          {
            code: "capability.asset_role_minimum",
            path: "assets.first_frame",
            message: "first_frame requires at least 1 asset",
          },
        ],
      },
      global,
    });
    expect(wrapper.text()).toContain("providerPlatform.h3.role.first_frame");
    expect(wrapper.text()).toContain("1 / 1");
    expect(wrapper.get('[role="alert"]').text()).toContain("first_frame requires at least 1 asset");
  });
});
