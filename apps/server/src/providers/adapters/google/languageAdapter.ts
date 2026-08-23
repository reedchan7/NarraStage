import type { LanguageModelV4StreamPart, SharedV4ProviderOptions } from "@ai-sdk/provider";
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
import { resolveGoogleOffering } from "@/providers/adapters/google/manifest";
import { normalizeGoogleError } from "@/providers/adapters/google/errors";
import { GoogleTransport } from "@/providers/adapters/google/transport";
import {
  buildAiSdkLanguageCallOptions,
  normalizeAiSdkLanguageResult,
  normalizeAiSdkLanguageStreamPart,
} from "@/providers/adapters/aiSdk/languageCodec";

function thinkingOptions(input: LanguageInput): SharedV4ProviderOptions | undefined {
  if (!input.thinking || input.thinking.mode === "adaptive") return undefined;
  if (input.thinking.mode === "disabled") {
    throw new Error("google.gemini_3_thinking_cannot_be_disabled");
  }
  return {
    google: {
      thinkingConfig: {
        thinkingLevel: input.thinking.effort === "low" ? "low" : "high",
      },
    },
  };
}

function parsedInput(request: OperationRequest<LanguageInput>) {
  const input = languageInputSchema.parse(request.input);
  const offering = resolveGoogleOffering(request.offeringId);
  if (offering.kind !== "language") throw new Error("google.language_offering_required");
  for (const message of input.messages) {
    if (message.role !== "user") continue;
    for (const part of message.content) {
      if (part.type === "text") continue;
      if (part.source.type === "provider_file" && part.source.providerId !== "google") {
        throw new Error("google.foreign_file_reference");
      }
    }
  }
  return { input, offering };
}

function callOptions(input: LanguageInput, context: OperationContext) {
  return buildAiSdkLanguageCallOptions({
    language: input,
    context,
    providerReferenceNamespace: "google",
    ...(thinkingOptions(input) ? { providerOptions: thinkingOptions(input) } : {}),
    ...(input.grounding
      ? {
          additionalTools: [
            {
              type: "provider" as const,
              id: "google.google_search" as const,
              name: "google_search",
              args: {},
            },
          ],
        }
      : {}),
  });
}

export class GoogleLanguageAdapter implements LanguageGeneratePort {
  readonly operation = "language.generate" as const;
  readonly #transport: GoogleTransport;

  constructor(transport = new GoogleTransport()) {
    this.#transport = transport;
  }

  async generate(request: OperationRequest<LanguageInput>, context: OperationContext = {}) {
    try {
      const { input, offering } = parsedInput(request);
      const model = (await this.#transport.provider())(offering.providerModelId);
      return normalizeAiSdkLanguageResult(
        await model.doGenerate(callOptions(input, context)),
        offering.providerModelId,
      );
    } catch (cause) {
      throw normalizeGoogleError(cause);
    }
  }

  async stream(
    request: OperationRequest<LanguageInput>,
    context: OperationContext = {},
  ): Promise<AsyncIterable<LanguageStreamEvent>> {
    try {
      const { input, offering } = parsedInput(request);
      const model = (await this.#transport.provider())(offering.providerModelId);
      const result = await model.doStream(callOptions(input, context));
      return this.#normalizedStream(result.stream, offering.providerModelId);
    } catch (cause) {
      throw normalizeGoogleError(cause);
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
      throw normalizeGoogleError(cause);
    }
  }
}

export class GoogleLanguageStreamAdapter implements LanguageStreamPort {
  readonly operation = "language.stream" as const;
  readonly #delegate: GoogleLanguageAdapter;

  constructor(delegate = new GoogleLanguageAdapter()) {
    this.#delegate = delegate;
  }

  stream(request: OperationRequest<LanguageInput>, context?: OperationContext) {
    return this.#delegate.stream(request, context);
  }
}
