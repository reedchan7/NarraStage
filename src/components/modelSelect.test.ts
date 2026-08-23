import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import modelSelect from "./modelSelect.vue";

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/utils/axios", () => ({
  default: { post },
}));

vi.mock("@/stores/setting", () => ({
  default: () => ({
    activeMenu: "",
    showSetting: false,
  }),
}));

describe("legacy model select", () => {
  beforeEach(() => {
    post.mockResolvedValue({
      data: [
        {
          id: "minimax",
          label: "Hailuo 2.3",
          value: "hailuo-2.3",
          type: "video",
          name: "MiniMax",
        },
      ],
    });
  });

  test("loads the legacy route and preserves vendor:model option values", async () => {
    const wrapper = shallowMount(modelSelect, {
      props: { type: "video" },
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          "t-select": {
            template: "<div><slot /></div>",
          },
          "t-option-group": {
            template: "<section><slot /></section>",
          },
          "t-option": {
            props: ["value", "label"],
            template: '<button :data-value="value"><slot /></button>',
          },
          "t-avatar": true,
          "t-button": true,
        },
      },
    });
    await flushPromises();

    expect(post).toHaveBeenCalledWith("/modelSelect/getModelList", { type: "video" });
    expect(wrapper.get("button").attributes("data-value")).toBe("minimax:hailuo-2.3");
  });

  test("offers an opt-in structured catalog path without changing legacy defaults", async () => {
    const wrapper = shallowMount(modelSelect, {
      props: {
        type: "video",
        catalogMode: true,
      },
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          ModelOfferingPicker: {
            name: "ModelOfferingPicker",
            emits: ["update:modelValue"],
            template: "<div />",
          },
        },
      },
    });

    wrapper.getComponent({ name: "ModelOfferingPicker" }).vm.$emit("update:modelValue", {
      canonicalModelId: "minimax:h3",
      offeringId: "minimax:h3:fal",
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["minimax:h3:fal"]);
    expect(wrapper.emitted("update:offering")?.[0]).toEqual([
      {
        canonicalModelId: "minimax:h3",
        offeringId: "minimax:h3:fal",
      },
    ]);
    expect(wrapper.emitted("change")?.[0]).toEqual([
      "minimax:h3:fal",
      {
        canonicalModelId: "minimax:h3",
        offeringId: "minimax:h3:fal",
      },
    ]);
    expect(post).not.toHaveBeenCalled();
  });
});
