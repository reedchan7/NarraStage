import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type {
  LanguageGeneratePort,
  LanguageStreamPort,
  OperationContext,
  OperationRequest,
} from "@/providers/ports";
import {
  languageInputSchema,
  type LanguageInput,
  type LanguageStreamEvent,
} from "@/providers/ports/language";
import { resolveDeepSeekOffering } from "@/providers/adapters/deepseek/manifest";
import { normalizeDeepSeekError } from "@/providers/adapters/deepseek/errors";
import { DeepSeekTransport } from "@/providers/adapters/deepseek/transport";
import { validateDeepSeekVisionInput } from "@/providers/adapters/deepseek/visionAdapter";
import {
  buildAiSdkLanguageCallOptions,
  normalizeAiSdkLanguageResult,
  normalizeAiSdkLanguageStreamPart,
} from "@/providers/adapters/aiSdk/languageCodec";

function callOptions(input: LanguageInput, context: OperationContext = {}) {
  return buildAiSdkLanguageCallOptions({
    language: input,
    context,
    providerReferenceNamespace: "deepseek",
    ...(input.thinking
      ? {
          providerOptions: {
            deepseek: {
              thinking: { type: input.thinking.mode },
              ...(input.thinking.effort ? { reasoningEffort: input.thinking.effort } : {}),
            },
          },
        }
      : {}),
  });
}

function parsedInput(request: OperationRequest<LanguageInput>) {
  const input = languageInputSchema.parse(request.input);
  const offering = resolveDeepSeekOffering(request.offeringId);
  if (input.thinking?.mode === "adaptive") {
    throw new Error("deepseek.adaptive_thinking_not_officially_supported");
  }
  if (input.grounding) throw new Error("deepseek.grounding_not_supported");
  if (
    input.messages.some(
      (message) => message.role === "user" && message.content.some((part) => part.type === "file"),
    )
  ) {
    throw new Error("deepseek.generic_file_input_not_supported");
  }
  validateDeepSeekVisionInput(input, offering.vision);
  return { input, offering };
}

export class DeepSeekLanguageAdapter implements LanguageGeneratePort {
  readonly operation = "language.generate" as const;
  readonly #transport: DeepSeekTransport;

  constructor(transport = new DeepSeekTransport()) {
    this.#transport = transport;
  }

  async generate(request: OperationRequest<LanguageInput>, context: OperationContext = {}) {
    try {
      const { input, offering } = parsedInput(request);
      const model = await this.#transport.languageModel(offering.providerModelId, input);
      return normalizeAiSdkLanguageResult(
        await model.doGenerate(callOptions(input, context)),
        offering.providerModelId,
      );
    } catch (cause) {
      throw normalizeDeepSeekError(cause);
    }
  }

  async stream(
    request: OperationRequest<LanguageInput>,
    context: OperationContext = {},
  ): Promise<AsyncIterable<LanguageStreamEvent>> {
    try {
      const { input, offering } = parsedInput(request);
      const model = await this.#transport.languageModel(offering.providerModelId, input);
      const result = await model.doStream(callOptions(input, context));
      return this.#normalizedStream(result.stream, offering.providerModelId);
    } catch (cause) {
      throw normalizeDeepSeekError(cause);
    }
  }

  async *#normalizedStream(
    stream: ReadableStream<LanguageModelV4StreamPart>,
    modelId: string,
  ): AsyncGenerator<LanguageStreamEvent> {
    const state: { providerRequestId?: string; resolvedModelId: string } = {
      resolvedModelId: modelId,
    };
    try {
      for await (const part of stream as AsyncIterable<LanguageModelV4StreamPart>) {
        if (part.type === "error") throw part.error;
        const event = normalizeAiSdkLanguageStreamPart(part, state);
        if (event) yield event;
      }
    } catch (cause) {
      throw normalizeDeepSeekError(cause);
    }
  }
}

export class DeepSeekLanguageStreamAdapter implements LanguageStreamPort {
  readonly operation = "language.stream" as const;
  readonly #delegate: DeepSeekLanguageAdapter;

  constructor(delegate = new DeepSeekLanguageAdapter()) {
    this.#delegate = delegate;
  }

  stream(request: OperationRequest<LanguageInput>, context?: OperationContext) {
    return this.#delegate.stream(request, context);
  }
}
