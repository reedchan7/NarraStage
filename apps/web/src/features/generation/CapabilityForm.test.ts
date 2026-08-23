import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import CapabilityForm from "./CapabilityForm.vue";

describe("CapabilityForm", () => {
  test("renders H3 semantic fields, asset roles, and server violation codes", async () => {
    const wrapper = mount(CapabilityForm, {
      props: {
        capability: {
          id: "minimax:h3:official:v1",
          schemaVersion: "1.0.0",
          operation: "video.generate",
          fields: [
            {
              path: "prompt",
              kind: "text",
              label: "Prompt",
              required: true,
            },
            {
              path: "durationSeconds",
              kind: "integer",
              label: "Duration",
              required: true,
              minimum: 4,
              maximum: 15,
              unit: "seconds",
            },
            {
              path: "resolution",
              kind: "enum",
              label: "Resolution",
              required: true,
              enumValues: ["768P", "2K"],
            },
          ],
          assetModes: [
            {
              id: "keyframes",
              label: "Keyframes to video",
              roles: [
                {
                  role: "first_frame",
                  kinds: ["image"],
                  minimum: 1,
                  maximum: 1,
                },
              ],
            },
          ],
        },
        modelValue: {
          mode: "keyframes",
          values: {
            prompt: "A paper boat crosses a pond",
            durationSeconds: 8,
            resolution: "768P",
          },
          assets: [],
        },
        violations: [
          {
            code: "capability.asset_role_minimum",
            path: "assets.first_frame",
            message: "first_frame requires at least 1 asset",
          },
        ],
      },
    });

    expect(wrapper.text()).toContain("Duration");
    expect(wrapper.text()).toContain("first_frame");
    expect(wrapper.text()).toContain("image · 1–1");
    expect(wrapper.get('[role="alert"]').text()).toContain("capability.asset_role_minimum");

    await wrapper.get('button[data-mode="keyframes"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toMatchObject({
      mode: "keyframes",
    });
  });

  test("renders sparse integer values and applies mode-specific choices", async () => {
    const wrapper = mount(CapabilityForm, {
      props: {
        capability: {
          id: "google:veo-3.1:v1",
          schemaVersion: "1.0.0",
          operation: "video.generate",
          fields: [
            {
              path: "durationSeconds",
              kind: "integer",
              label: "Duration",
              required: true,
              allowedValues: [4, 6, 8],
            },
          ],
          assetModes: [
            { id: "text", label: "Text", roles: [], maximumTotalAssets: 0 },
            {
              id: "reference",
              label: "Reference",
              roles: [],
              maximumTotalAssets: 0,
              fieldRules: [{ path: "durationSeconds", allowedValues: [8] }],
            },
          ],
        },
        modelValue: {
          mode: "reference",
          values: { durationSeconds: 8 },
          assets: [],
        },
      },
    });

    const options = wrapper.findAll("option");
    expect(options.map((option) => option.text())).toEqual(["8"]);
    expect(wrapper.find('input[type="number"]').exists()).toBe(false);
  });
});
