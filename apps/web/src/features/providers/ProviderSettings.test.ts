import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import ProviderSettings from "./ProviderSettings.vue";

const { store } = vi.hoisted(() => ({
  store: {
    loading: false,
    healthChecking: [] as string[],
    errorCode: "",
    providers: [
      {
        providerId: "fal",
        name: "fal.ai",
        health: "unknown",
        slots: [
          {
            slot: "apiKey",
            configured: false,
            source: "none",
            writable: true,
          },
        ],
      },
    ],
    refresh: vi.fn().mockResolvedValue(undefined),
    setCredential: vi.fn().mockResolvedValue(undefined),
    deleteCredential: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./providerStore", () => ({
  useProviderStore: () => store,
}));

describe("ProviderSettings", () => {
  test("sends password values only through the credential bridge and clears the draft", async () => {
    window.toonflowCredentials = {
      status: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const wrapper = mount(ProviderSettings);
    await flushPromises();

    const input = wrapper.get('input[type="password"]');
    await input.setValue("renderer-canary-secret");
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(store.setCredential).toHaveBeenCalledWith("fal", "apiKey", "renderer-canary-secret");
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(wrapper.text()).not.toContain("renderer-canary-secret");
  });

  test("runs an explicit provider connection check", async () => {
    store.providers[0]!.slots[0]!.configured = true;
    const wrapper = mount(ProviderSettings);
    await flushPromises();

    await wrapper.get(".healthCheck").trigger("click");
    await flushPromises();

    expect(store.checkHealth).toHaveBeenCalledWith("fal");
  });
});
