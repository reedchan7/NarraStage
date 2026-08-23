import type {
  JSONSchema7,
  JSONValue,
  LanguageModelV4CallOptions,
  LanguageModelV4FunctionTool,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ProviderTool,
  LanguageModelV4ToolChoice,
  LanguageModelV4Usage,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import type { OperationContext } from "@/providers/ports";
import type {
  LanguageInput,
  LanguageMessage,
  LanguageResult,
  LanguageSource,
  LanguageStreamEvent,
  LanguageUsage,
} from "@/providers/ports/language";

function jsonValue(value: unknown): JSONValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("provider.tool_output_not_json_serializable");
  return JSON.parse(serialized) as JSONValue;
}

function sourceData(
  source: Extract<LanguageMessage, { role: "user" }>["content"][number] extends infer Part
    ? Part extends { source: infer Source }
      ? Source
      : never
    : never,
  providerReferenceNamespace: string,
) {
  if (source.type === "inline") return { type: "data" as const, data: source.dataBase64 };
  if (source.type === "url") return { type: "url" as const, url: new URL(source.url) };
  return {
    type: "reference" as const,
    reference: { [providerReferenceNamespace]: source.fileId },
  };
}

function promptMessage(
  message: LanguageMessage,
  providerReferenceNamespace: string,
): LanguageModelV4Prompt[number] {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content };
    case "user":
      return {
        role: "user",
        content: message.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          return {
            type: "file" as const,
            data: sourceData(part.source, providerReferenceNamespace),
            mediaType:
              part.source.mediaType ??
              (part.type === "image" ? "image" : "application/octet-stream"),
          };
        }),
      };
    case "assistant":
      return {
        role: "assistant",
        content: message.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          if (part.type === "reasoning") return { type: "reasoning", text: part.text };
          return {
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          };
        }),
      };
    case "tool":
      return {
        role: "tool",
        content: message.content.map((part) => ({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output:
            typeof part.output === "string"
              ? {
                  type: part.isError ? ("error-text" as const) : ("text" as const),
                  value: part.output,
                }
              : {
                  type: part.isError ? ("error-json" as const) : ("json" as const),
                  value: jsonValue(part.output),
                },
        })),
      };
  }
}

function toolChoice(input: LanguageInput): LanguageModelV4ToolChoice | undefined {
  if (!input.toolChoice) return undefined;
  return typeof input.toolChoice === "string"
    ? { type: input.toolChoice }
    : { type: "tool", toolName: input.toolChoice.toolName };
}

export function buildAiSdkLanguageCallOptions(input: {
  language: LanguageInput;
  context?: OperationContext;
  providerReferenceNamespace: string;
  providerOptions?: SharedV4ProviderOptions;
  additionalTools?: LanguageModelV4ProviderTool[];
}): LanguageModelV4CallOptions {
  const selectedToolChoice = toolChoice(input.language);
  const functionTools: LanguageModelV4FunctionTool[] = (input.language.tools ?? []).map((tool) => ({
    type: "function" as const,
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    inputSchema: tool.inputSchema as JSONSchema7,
    ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
  }));
  const tools = [...functionTools, ...(input.additionalTools ?? [])];
  return {
    prompt: input.language.messages.map((message) =>
      promptMessage(message, input.providerReferenceNamespace),
    ),
    ...(input.language.maxOutputTokens ? { maxOutputTokens: input.language.maxOutputTokens } : {}),
    ...(tools.length ? { tools } : {}),
    ...(selectedToolChoice ? { toolChoice: selectedToolChoice } : {}),
    ...(input.language.responseFormat
      ? {
          responseFormat:
            input.language.responseFormat.type === "text"
              ? ({ type: "text" } as const)
              : {
                  type: "json" as const,
                  ...(input.language.responseFormat.schema
                    ? { schema: input.language.responseFormat.schema as JSONSchema7 }
                    : {}),
                  ...(input.language.responseFormat.name
                    ? { name: input.language.responseFormat.name }
                    : {}),
                  ...(input.language.responseFormat.description
                    ? { description: input.language.responseFormat.description }
                    : {}),
                },
        }
      : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.context?.abortSignal ? { abortSignal: input.context.abortSignal } : {}),
  };
}

function finishReason(value: string): LanguageResult["finishReason"] {
  if (value === "content-filter") return "content_filter";
  if (value === "tool-calls") return "tool_calls";
  if (["stop", "length", "error", "other"].includes(value)) {
    return value as LanguageResult["finishReason"];
  }
  return "other";
}

function integer(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(0, value);
}

export function normalizeAiSdkLanguageUsage(usage: LanguageModelV4Usage): LanguageUsage {
  return {
    ...(integer(usage.inputTokens.total) !== undefined
      ? { inputTokens: integer(usage.inputTokens.total) }
      : {}),
    ...(integer(usage.outputTokens.total) !== undefined
      ? { outputTokens: integer(usage.outputTokens.total) }
      : {}),
    ...(integer(usage.outputTokens.reasoning) !== undefined
      ? { reasoningTokens: integer(usage.outputTokens.reasoning) }
      : {}),
    ...(integer(usage.inputTokens.cacheRead) !== undefined
      ? { cacheReadTokens: integer(usage.inputTokens.cacheRead) }
      : {}),
    ...(integer(usage.inputTokens.cacheWrite) !== undefined
      ? { cacheWriteTokens: integer(usage.inputTokens.cacheWrite) }
      : {}),
  };
}

function parsedToolInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function normalizedProviderMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (value === undefined) return [];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = normalizedProviderMetadata(value as Record<string, unknown>);
        return nested ? [[key, nested] as const] : [];
      }
      return [[key, value] as const];
    }),
  );
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function requestId(
  response: LanguageModelV4GenerateResult["response"] | undefined,
): string | undefined {
  return (
    response?.id ??
    response?.headers?.["x-request-id"] ??
    response?.headers?.["request-id"] ??
    response?.headers?.["x-trace-id"]
  );
}

function source(
  part: Extract<LanguageModelV4GenerateResult["content"][number], { type: "source" }>,
): LanguageSource {
  return part.sourceType === "url"
    ? {
        sourceType: "url",
        id: part.id,
        url: part.url,
        ...(part.title ? { title: part.title } : {}),
        ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
      }
    : {
        sourceType: "document",
        id: part.id,
        mediaType: part.mediaType,
        title: part.title,
        ...(part.filename ? { filename: part.filename } : {}),
        ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
      };
}

export function normalizeAiSdkLanguageResult(
  result: LanguageModelV4GenerateResult,
  requestedModelId: string,
): LanguageResult {
  return {
    schemaVersion: "1.0.0",
    text: result.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(""),
    reasoning: result.content
      .filter((part) => part.type === "reasoning")
      .map((part) => part.text)
      .join(""),
    toolCalls: result.content.flatMap((part) =>
      part.type === "tool-call"
        ? [
            {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: parsedToolInput(part.input),
            },
          ]
        : [],
    ),
    finishReason: finishReason(result.finishReason.unified),
    usage: normalizeAiSdkLanguageUsage(result.usage),
    ...(result.content.some((part) => part.type === "source")
      ? {
          sources: result.content.flatMap((part) => (part.type === "source" ? [source(part)] : [])),
        }
      : {}),
    ...(normalizedProviderMetadata(result.providerMetadata)
      ? { providerMetadata: normalizedProviderMetadata(result.providerMetadata) }
      : {}),
    ...(requestId(result.response) ? { providerRequestId: requestId(result.response) } : {}),
    resolvedModelId: result.response?.modelId ?? requestedModelId,
  };
}

export function normalizeAiSdkLanguageStreamPart(
  part: LanguageModelV4StreamPart,
  state: { providerRequestId?: string; resolvedModelId: string },
): LanguageStreamEvent | undefined {
  switch (part.type) {
    case "response-metadata":
      state.providerRequestId = part.id ?? state.providerRequestId;
      state.resolvedModelId = part.modelId ?? state.resolvedModelId;
      return undefined;
    case "text-delta":
      return { type: "text_delta", delta: part.delta };
    case "reasoning-delta":
      return { type: "reasoning_delta", delta: part.delta };
    case "tool-call":
      return {
        type: "tool_call",
        call: {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: parsedToolInput(part.input),
        },
      };
    case "source":
      return { type: "source", source: source(part) };
    case "finish":
      return {
        type: "finish",
        finishReason: finishReason(part.finishReason.unified),
        usage: normalizeAiSdkLanguageUsage(part.usage),
        ...(state.providerRequestId ? { providerRequestId: state.providerRequestId } : {}),
        resolvedModelId: state.resolvedModelId,
        ...(normalizedProviderMetadata(part.providerMetadata)
          ? { providerMetadata: normalizedProviderMetadata(part.providerMetadata) }
          : {}),
      };
    default:
      return undefined;
  }
}
