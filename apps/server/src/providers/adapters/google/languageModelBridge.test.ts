import { describe, expect, test } from "bun:test";
import { GoogleLanguageModelBridge } from "@/providers/adapters/google/languageModelBridge";
import type { GoogleTransport } from "@/providers/adapters/google/transport";

describe("Google Agent compatibility bridge", () => {
  test("injects the native Google Search provider tool only when requested", async () => {
    const model = { specificationVersion: "v4" };
    const googleSearch = { type: "provider-defined", id: "google.google_search" } as any;
    const provider = Object.assign(() => model, {
      tools: { googleSearch: () => googleSearch },
    });
    const bridge = new GoogleLanguageModelBridge({
      provider: async () => provider,
    } as unknown as GoogleTransport);

    const grounded = await bridge.resolve({
      offeringId: "google:gemini-3.7-flash:official",
      imageDetails: [],
      grounding: true,
    });
    expect(grounded.model).toBe(model as any);
    expect(grounded.providerTools).toEqual({ google_search: googleSearch });

    const plain = await bridge.resolve({
      offeringId: "google:gemini-3.7-flash:official",
      imageDetails: [],
    });
    expect(plain.providerTools).toBeUndefined();
  });
});
