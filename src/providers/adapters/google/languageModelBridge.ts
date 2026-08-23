import type {
  LanguageModelCompatibilityBridge,
  LanguageModelCompatibilityRequest,
} from "@/providers/ports";
import { resolveGoogleOffering } from "@/providers/adapters/google/manifest";
import { GoogleTransport } from "@/providers/adapters/google/transport";

export class GoogleLanguageModelBridge implements LanguageModelCompatibilityBridge {
  readonly #transport: GoogleTransport;

  constructor(transport = new GoogleTransport()) {
    this.#transport = transport;
  }

  async resolve(request: LanguageModelCompatibilityRequest) {
    const offering = resolveGoogleOffering(request.offeringId);
    if (offering.kind !== "language") throw new Error("google.language_offering_required");
    if (request.grounding && !offering.grounding) {
      throw new Error("google.grounding_not_supported");
    }
    if (request.thinking?.mode === "disabled") {
      throw new Error("google.gemini_3_thinking_cannot_be_disabled");
    }
    const imageDetail = request.imageDetails.find((detail) => detail && detail !== "auto");
    const provider = await this.#transport.provider();
    return {
      model: provider(offering.providerModelId),
      ...(request.grounding
        ? { providerTools: { google_search: provider.tools.googleSearch({}) } }
        : {}),
      providerOptions: {
        google: {
          ...(request.thinking
            ? {
                thinkingConfig: {
                  thinkingLevel: request.thinking.effort === "low" ? "low" : "high",
                },
              }
            : {}),
          ...(imageDetail
            ? {
                mediaResolution:
                  imageDetail === "low"
                    ? "low"
                    : imageDetail === "original"
                      ? "ultra_high"
                      : "high",
              }
            : {}),
        },
      },
    };
  }
}
