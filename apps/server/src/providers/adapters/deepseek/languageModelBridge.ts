import type {
  LanguageModelCompatibilityBridge,
  LanguageModelCompatibilityRequest,
} from "@/providers/ports";
import { resolveDeepSeekOffering } from "@/providers/adapters/deepseek/manifest";
import { DeepSeekTransport } from "@/providers/adapters/deepseek/transport";

export class DeepSeekLanguageModelBridge implements LanguageModelCompatibilityBridge {
  readonly #transport: DeepSeekTransport;

  constructor(transport = new DeepSeekTransport()) {
    this.#transport = transport;
  }

  async resolve(request: LanguageModelCompatibilityRequest) {
    const offering = resolveDeepSeekOffering(request.offeringId);
    if (request.grounding) throw new Error("deepseek.grounding_not_supported");
    return {
      model: await this.#transport.languageModelWithImageDetails(
        offering.providerModelId,
        request.imageDetails,
      ),
      ...(request.thinking
        ? {
            providerOptions: {
              deepseek: {
                thinking: { type: request.thinking.mode },
                ...(request.thinking.effort ? { reasoningEffort: request.thinking.effort } : {}),
              },
            },
          }
        : {}),
    };
  }
}
