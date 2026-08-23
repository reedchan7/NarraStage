import { flushPromises, shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AgentAttachmentComposer from "./AgentAttachmentComposer.vue";
import type { AgentModelDetails } from "./attachments";

const target: AgentModelDetails = {
  canonicalModelId: "deepseek:v4-flash-vision-exp",
  offeringId: "deepseek:v4-flash-vision-exp:official",
  providerId: "deepseek",
  acceptsAttachments: true,
  acceptsImages: true,
  supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  supportsGrounding: false,
  filesUpload: true,
  maximumAttachments: 20,
  maximumAttachmentBytes: 64 * 1024 * 1024,
  lifecycle: "experimental",
};

const global = {
  stubs: {
    "t-button": {
      props: ["disabled", "ariaLabel"],
      emits: ["click"],
      template: '<button :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /><slot name="icon" /></button>',
    },
    "t-tag": { template: "<span><slot /></span>" },
    "t-select": {
      props: ["modelValue", "ariaLabel"],
      emits: ["change"],
      template: '<select :aria-label="ariaLabel" @change="$emit(\'change\', $event.target.value)"><slot /></select>',
    },
    "t-option": { props: ["value", "label"], template: '<option :value="value">{{ label }}</option>' },
    "i-pic": { template: "<span />" },
    "i-close": { template: "<span />" },
  },
};

describe("AgentAttachmentComposer", () => {
  it("disables attachment entry for a non-vision agent", () => {
    const wrapper = shallowMount(AgentAttachmentComposer, {
      props: { modelValue: [], target: null },
      global,
    });
    expect(wrapper.get("button").attributes()).toHaveProperty("disabled");
  });

  it("emits a canonical attachment and allows changing inline detail", async () => {
    const wrapper = shallowMount(AgentAttachmentComposer, {
      props: { modelValue: [], target },
      global,
    });
    await (wrapper.vm as unknown as { addFiles(files: File[]): Promise<void> }).addFiles([
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "pixel.png", {
        type: "image/png",
      }),
    ]);
    await flushPromises();
    const attachment = wrapper.emitted("update:modelValue")?.[0]?.[0]?.[0];
    expect(attachment).toMatchObject({
      schemaVersion: "1.0.0",
      filename: "pixel.png",
      detail: "auto",
      source: { type: "inline", dataBase64: "iVBORw==" },
    });

    await wrapper.setProps({ modelValue: [attachment] });
    wrapper.get("select").element.value = "high";
    await wrapper.get("select").trigger("change");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]?.[0]).toMatchObject({
      detail: "high",
    });
  });
});
