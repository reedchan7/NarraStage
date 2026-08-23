import { createPinia, setActivePinia } from "pinia";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, test } from "vitest";
import GenerateImage from "./generateImage.vue";

describe("asset image catalog entry", () => {
  beforeEach(() => setActivePinia(createPinia()));

  test("switches the catalog picker from generation to editing when a reference is selected", async () => {
    const wrapper = shallowMount(GenerateImage, {
      props: {
        modelValue: false,
        formData: { id: 9, type: "scene", prompt: "A paper boat", src: "" },
      },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          JobRecovery: true,
          CapabilityForm: true,
          ModelSelect: {
            name: "ModelSelect",
            props: ["catalogMode", "operation"],
            template: "<div data-model-select />",
          },
          TDialog: { template: "<div><slot /></div>" },
          TCard: { template: "<section><slot name='actions' /><slot /></section>" },
          TUpload: {
            name: "TUpload",
            emits: ["update:modelValue"],
            template: "<div data-upload />",
          },
          TDivider: true,
          TTag: true,
          TTextarea: true,
          TLoading: { template: "<div><slot /></div>" },
          TButton: { template: "<button><slot /></button>" },
          TSelect: true,
          TOption: true,
          TImage: true,
          TImageViewer: true,
          IMagic: true,
          ICloseOne: true,
          IPreviewOpen: true,
          ICheckOne: true,
          IDelete: true,
          IPlus: true,
        },
      },
    });

    const sourceButtons = wrapper.findAll(".modelSourceSwitch button");
    await sourceButtons[1]!.trigger("click");
    expect(wrapper.getComponent({ name: "ModelSelect" }).props()).toMatchObject({
      catalogMode: true,
      operation: "image.generate",
    });

    wrapper
      .getComponent({ name: "TUpload" })
      .vm.$emit("update:modelValue", [{ raw: new File([new Uint8Array([1])], "reference.png", { type: "image/png" }) }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.getComponent({ name: "ModelSelect" }).props("operation")).toBe("image.edit");
  });
});
