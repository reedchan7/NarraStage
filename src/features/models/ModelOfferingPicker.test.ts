import { flushPromises, shallowMount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import ModelOfferingPicker from "./ModelOfferingPicker.vue";

const { getProviderCatalog } = vi.hoisted(() => ({
  getProviderCatalog: vi.fn(),
}));

vi.mock("./catalog", () => ({
  getProviderCatalog,
}));

describe("ModelOfferingPicker", () => {
  test("groups one canonical H3 model with official and fal offerings", async () => {
    getProviderCatalog.mockResolvedValue({
      schemaVersion: "2.0.0",
      providers: [
        {
          id: "minimax",
          name: "MiniMax",
          credentialSlots: [{ slot: "apiKey", environmentVariables: ["MINIMAX_API_KEY"] }],
        },
        {
          id: "fal",
          name: "fal.ai",
          credentialSlots: [{ slot: "apiKey", environmentVariables: ["FAL_KEY", "FAL_API_KEY"] }],
        },
      ],
      models: [
        {
          id: "minimax:h3",
          owner: "minimax",
          family: "h3",
          name: "MiniMax H3",
          lifecycle: "stable",
        },
      ],
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
              capabilitySchemaId: "minimax:h3:official:v1",
              enabled: true,
            },
          ],
          support: { implementation: "declared", evidence: [] },
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
              capabilitySchemaId: "minimax:h3:fal:v1",
              enabled: true,
            },
          ],
          support: { implementation: "declared", evidence: [] },
        },
      ],
      capabilitySchemas: [],
      priceSnapshots: [],
      availability: [
        {
          offeringId: "minimax:h3:official",
          operation: "video.generate",
          available: true,
          reasonCodes: [],
        },
        {
          offeringId: "minimax:h3:fal",
          operation: "video.generate",
          available: true,
          reasonCodes: [],
        },
      ],
    });

    const wrapper = shallowMount(ModelOfferingPicker, {
      props: {
        operation: "video.generate",
        modelValue: null,
      },
      global: {
        stubs: {
          "t-select": {
            name: "TSelectStub",
            props: ["modelValue"],
            emits: ["change"],
            template: "<div><slot /></div>",
          },
          "t-option-group": {
            props: ["label"],
            template: '<section :aria-label="label"><slot /></section>',
          },
          "t-option": {
            props: ["value", "label", "disabled"],
            template: '<button :data-value="value" :disabled="disabled"><slot /></button>',
          },
          OfferingBadge: {
            template: "<span />",
          },
        },
      },
    });
    await flushPromises();

    expect(wrapper.get("section").attributes("aria-label")).toBe("MiniMax H3");
    expect(wrapper.findAll("button").map((item) => item.attributes("data-value"))).toEqual(["minimax:h3:official", "minimax:h3:fal"]);

    wrapper.getComponent({ name: "TSelectStub" }).vm.$emit("change", "minimax:h3:fal");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      {
        canonicalModelId: "minimax:h3",
        offeringId: "minimax:h3:fal",
        providerId: "fal",
        label: "MiniMax H3 · fal.ai",
      },
    ]);
  });
});
