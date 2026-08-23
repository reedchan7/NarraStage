import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv, { type AnySchema } from "ajv";
import {
  acceptanceAssetFixtures,
  acceptanceCaseSha256,
  acceptanceFixtureBytes,
  acceptanceProfiles,
  type AcceptanceCase,
} from "@/release/acceptanceSuite";
import type { LiveCaseExecution, LiveCaseExecutor } from "./run-live-tests";
import type { CapabilityAssetInput, CapabilityInput } from "@/providers/domain/capabilities";
import type { OfferingId, ProviderId } from "@/providers/domain/ids";
import type {
  FilesUploadPort,
  ImageEditPort,
  ImageGeneratePort,
  LanguageGeneratePort,
  LanguageInput,
  LanguageResult,
  LanguageStreamPort,
  OperationContext,
  OperationPort,
  ProviderAssetResolver,
  ProviderOutputArtifact,
  VideoCancelPort,
  VideoGeneratePort,
  VideoStatusPort,
} from "@/providers/ports";
import type { ProviderRegistry } from "@/providers/registry/providerRegistry";
import type { CredentialVault } from "@/security/credentials/types";
import { redactSecrets } from "@/security/credentials/redact";
import { detectMediaType, inspectMediaMetadata } from "@/assets/metadata";

type ArtifactEvidence = LiveCaseExecution["artifacts"][number];

interface PortInvocation {
  operation: OperationPort["operation"];
  request?: unknown;
  context?: OperationContext;
  providerHandle?: string;
}

const frozenSchemaValidator = new Ajv({ allErrors: true, strict: true });

function validatesFrozenJsonSchema(schema: Record<string, unknown>, value: unknown): boolean {
  try {
    return frozenSchemaValidator.validate(schema as AnySchema, value) as boolean;
  } catch (cause) {
    throw new Error("live.frozen_json_schema_invalid", { cause });
  }
}

function port<T extends OperationPort["operation"]>(
  registry: ProviderRegistry,
  providerId: ProviderId,
  operation: T,
): Extract<OperationPort, { operation: T }> {
  const resolved = registry.getPort(providerId, operation);
  if (!resolved) throw new Error(`live.provider_port_missing:${providerId}:${operation}`);
  return resolved as Extract<OperationPort, { operation: T }>;
}

function fixtureKind(
  kind: (typeof acceptanceAssetFixtures)[keyof typeof acceptanceAssetFixtures]["kind"],
) {
  if (kind === "document") throw new Error("live.document_is_not_media_asset");
  return kind;
}

export class FrozenAcceptanceAssetResolver implements ProviderAssetResolver {
  readonly #repositoryRoot: string;

  constructor(repositoryRoot: string) {
    this.#repositoryRoot = repositoryRoot;
  }

  async resolve(asset: CapabilityAssetInput) {
    const fixture = acceptanceAssetFixtures[asset.assetId as keyof typeof acceptanceAssetFixtures];
    if (!fixture) throw new Error(`live.fixture_missing:${asset.assetId}`);
    const kind = fixtureKind(fixture.kind);
    if (kind !== asset.kind) throw new Error(`live.fixture_kind_mismatch:${asset.assetId}`);
    const bytes = await acceptanceFixtureBytes(
      this.#repositoryRoot,
      asset.assetId as keyof typeof acceptanceAssetFixtures,
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== fixture.sha256) throw new Error(`live.fixture_digest_mismatch:${asset.assetId}`);
    return {
      assetId: `sha256:${sha256}`,
      kind,
      mimeType: fixture.mediaType,
      byteLength: bytes.byteLength,
      sha256,
      source: { kind: "blob" as const, blob: new Blob([bytes], { type: fixture.mediaType }) },
    };
  }
}

interface ProviderLiveCaseExecutorOptions {
  repositoryRoot: string;
  artifactDirectory: string;
  runId: string;
  offeringId: OfferingId;
  providerId: ProviderId;
  requestedProviderModelId: string;
  observedResolvedProviderModelId?: string;
  registry: ProviderRegistry;
  credentialVault: CredentialVault;
  accountedCostUsdByCase: Readonly<Record<string, string>>;
  fetch?: typeof fetch;
  now?: () => number;
  pollIntervalMs?: number;
  caseTimeoutMs?: number;
}

function capabilityAssets(acceptanceCase: AcceptanceCase): CapabilityAssetInput[] {
  return acceptanceCase.input.assets.map(({ fixtureId, role }) => {
    const kind = fixtureKind(acceptanceAssetFixtures[fixtureId].kind);
    return { assetId: fixtureId, kind, role };
  });
}

function languageTools(options: AcceptanceCase["input"]["options"]): LanguageInput["tools"] {
  const value = options.tools;
  if (!Array.isArray(value)) return undefined;
  return value as NonNullable<LanguageInput["tools"]>;
}

function responseFormat(
  options: AcceptanceCase["input"]["options"],
): LanguageInput["responseFormat"] {
  const value = options.responseFormat;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { name?: unknown; schema?: unknown };
  return {
    type: "json",
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(record.schema && typeof record.schema === "object"
      ? { schema: record.schema as Record<string, unknown> }
      : {}),
  };
}

function errorCode(cause: unknown): string {
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
    return cause.code;
  }
  if (cause instanceof Error && /^[a-z0-9_.:-]+$/i.test(cause.message)) return cause.message;
  return "live.provider_execution_failed";
}

function resolvedLanguageModel(
  observed: string | undefined,
  requested: string,
  results: readonly LanguageResult[],
): string {
  const providerModels = [...new Set(results.map((result) => result.resolvedModelId))];
  if (providerModels.length > 1) throw new Error("live.resolved_model_changed_within_case");
  return observed ?? providerModels[0] ?? requested;
}

function textFactsRatio(caseId: string, results: readonly LanguageResult[]): number {
  const text = results
    .map((result) => result.text)
    .join("\n")
    .trim();
  const toolCalls = results.flatMap((result) => result.toolCalls);
  switch (caseId) {
    case "instruction":
      return results.every(
        (result) => JSON.stringify(result.text.match(/\d+/g)?.map(Number)) === "[11,13,17]",
      )
        ? 1
        : 0;
    case "structured-output": {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        return parsed.name === "Ada Lovelace" &&
          parsed.occupation === "mathematician" &&
          parsed.birthYear === 1815
          ? 1
          : 0;
      } catch {
        return 0;
      }
    }
    case "tool-call": {
      const call = toolCalls.length === 1 ? toolCalls[0] : undefined;
      const input = call?.input as Record<string, unknown> | undefined;
      return call?.toolName === "add" && input?.a === 137 && input?.b === 905 ? 1 : 0;
    }
    case "reasoning-high":
      return /\b3\s*\/\s*5\b/.test(text) ? 1 : 0;
    case "reasoning-max":
      return text === "6" ? 1 : 0;
    default:
      throw new Error(`live.facts_evaluator_missing:${caseId}`);
  }
}

function languageDeterministicPassed(
  acceptanceCase: AcceptanceCase,
  results: readonly LanguageResult[],
  inputs: readonly LanguageInput[],
  providerId: ProviderId,
): boolean {
  if (
    results.length !==
      acceptanceCase.operations.filter((operation) => operation.startsWith("language.")).length ||
    inputs.length !== results.length ||
    results.some(
      (result) =>
        !result.resolvedModelId ||
        !result.providerRequestId ||
        (!result.text.trim() && result.toolCalls.length === 0),
    )
  ) {
    return false;
  }
  if (!inputs.every((input) => languageInputMatchesCase(acceptanceCase, input, providerId))) {
    return false;
  }

  const tools = languageTools(acceptanceCase.input.options);
  if (tools) {
    return results.every((result) => {
      if (result.toolCalls.length !== 1) return false;
      const call = result.toolCalls[0]!;
      const expected = tools.find((tool) => tool.name === call.toolName);
      if (!expected || !call.input || typeof call.input !== "object") return false;
      return validatesFrozenJsonSchema(expected.inputSchema, call.input);
    });
  }

  const format = responseFormat(acceptanceCase.input.options);
  if (format?.type === "json") {
    return results.every((result) => {
      try {
        const value = JSON.parse(result.text) as unknown;
        return format.schema ? validatesFrozenJsonSchema(format.schema, value) : false;
      } catch {
        return false;
      }
    });
  }

  const grounding = acceptanceCase.input.options.grounding;
  if (grounding && typeof grounding === "object" && !Array.isArray(grounding)) {
    const groundingRecord = grounding as Readonly<Record<string, unknown>>;
    const requiredSourceHost =
      typeof groundingRecord.requiredSourceHost === "string"
        ? groundingRecord.requiredSourceHost
        : undefined;
    return results.every(
      (result) =>
        Boolean(result.sources?.length) &&
        (!requiredSourceHost ||
          result.sources!.some((source) => {
            if (source.sourceType !== "url") return false;
            try {
              return new URL(source.url).hostname === requiredSourceHost;
            } catch {
              return false;
            }
          })),
    );
  }

  return true;
}

function languageInputMatchesCase(
  acceptanceCase: AcceptanceCase,
  input: LanguageInput,
  providerId: ProviderId,
): boolean {
  if (input.messages.length !== 1 || input.messages[0]?.role !== "user") return false;
  const content = input.messages[0].content;
  if (content[0]?.type !== "text" || content[0].text !== acceptanceCase.input.prompt) return false;
  const suppliedAssets = content.slice(1);
  if (suppliedAssets.length !== acceptanceCase.input.assets.length) return false;
  if (
    suppliedAssets.some((part, index) => {
      const expected = acceptanceCase.input.assets[index]!;
      const fixture = acceptanceAssetFixtures[expected.fixtureId];
      if (part.type !== "image" && part.type !== "file") return true;
      if (part.source.mediaType !== fixture.mediaType) return true;
      if (acceptanceCase.input.mode.startsWith("provider-file")) {
        return part.source.type !== "provider_file" || part.source.providerId !== providerId;
      }
      return (
        part.type !== "image" ||
        part.source.type !== "inline" ||
        part.source.byteLength !== Buffer.from(part.source.dataBase64, "base64").byteLength ||
        createHash("sha256").update(Buffer.from(part.source.dataBase64, "base64")).digest("hex") !==
          fixture.sha256 ||
        part.detail !== acceptanceCase.input.options.detail
      );
    })
  ) {
    return false;
  }
  const reasoningEffort = acceptanceCase.input.options.reasoningEffort;
  if (
    typeof reasoningEffort === "string" &&
    (input.thinking?.mode !== "enabled" || input.thinking.effort !== reasoningEffort)
  ) {
    return false;
  }
  if (JSON.stringify(languageTools(acceptanceCase.input.options)) !== JSON.stringify(input.tools)) {
    return false;
  }
  if (
    JSON.stringify(responseFormat(acceptanceCase.input.options)) !==
    JSON.stringify(input.responseFormat)
  ) {
    return false;
  }
  if (
    JSON.stringify(
      acceptanceCase.input.options.grounding ? { mode: "web_search" as const } : undefined,
    ) !== JSON.stringify(input.grounding)
  ) {
    return false;
  }
  return true;
}

function languageHardFailures(
  acceptanceCase: AcceptanceCase,
  deterministicPassed: boolean,
): string[] {
  if (deterministicPassed) return [];
  if (languageTools(acceptanceCase.input.options) || responseFormat(acceptanceCase.input.options)) {
    return ["missing required structured field or tool argument"];
  }
  return ["stream loses content, tool state, or terminal event"];
}

function expectedAspectRatio(value: unknown): number | undefined {
  if (typeof value !== "string" || value === "adaptive") return undefined;
  const match = /^(\d+):(\d+)$/.exec(value);
  if (!match) return undefined;
  return Number(match[1]) / Number(match[2]);
}

function resolutionMatches(resolution: unknown, width: number, height: number): boolean {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (resolution === "720P") return short >= 680 && short <= 820;
  if (resolution === "768P") return short >= 700 && short <= 850;
  if (resolution === "1080P") return short >= 1_000 && short <= 1_220;
  if (resolution === "2K") return short >= 1_000 && long >= 1_800;
  if (resolution === "4K") return short >= 1_900 && long >= 3_500;
  return false;
}

function capabilityInputMatchesCase(
  acceptanceCase: AcceptanceCase,
  input: CapabilityInput,
): boolean {
  const expectedValues: Record<string, unknown> = {
    prompt: acceptanceCase.input.prompt,
    ...acceptanceCase.input.options,
  };
  delete expectedValues.cancelImmediatelyAfterAccepted;
  delete expectedValues.continuation;
  return (
    input.mode === acceptanceCase.input.mode &&
    JSON.stringify(input.values) === JSON.stringify(expectedValues) &&
    JSON.stringify(input.assets) === JSON.stringify(capabilityAssets(acceptanceCase))
  );
}

function mediaDeterministicEvaluation(
  acceptanceCase: AcceptanceCase,
  artifacts: readonly ArtifactEvidence[],
  kind: "image" | "video",
  requestPassed: boolean,
): { passed: boolean; hardFailures: string[] } {
  const outputs = artifacts.filter((artifact) => artifact.kind === kind);
  let passed = requestPassed && outputs.length > 0;
  for (const artifact of outputs) {
    if (!artifact.width || !artifact.height) {
      passed = false;
      continue;
    }
    const ratio = expectedAspectRatio(acceptanceCase.input.options.aspectRatio);
    if (ratio && Math.abs(artifact.width / artifact.height - ratio) > 0.04) passed = false;
    if (kind === "video") {
      const expectedDuration = acceptanceCase.input.options.durationSeconds;
      if (
        typeof expectedDuration !== "number" ||
        artifact.durationSeconds === undefined ||
        Math.abs(artifact.durationSeconds - expectedDuration) >
          Math.max(0.75, expectedDuration * 0.1) ||
        !resolutionMatches(acceptanceCase.input.options.resolution, artifact.width, artifact.height)
      ) {
        passed = false;
      }
    }
  }
  return {
    passed,
    hardFailures: passed
      ? []
      : [
          requestPassed
            ? "artifact is corrupt, truncated, or outside the declared output contract"
            : "required reference or control is ignored",
        ],
  };
}

function extension(mediaType: string): string {
  if (mediaType === "image/png") return ".png";
  if (mediaType === "image/jpeg") return ".jpg";
  if (mediaType === "video/mp4") return ".mp4";
  if (mediaType === "audio/wav") return ".wav";
  if (mediaType === "application/json") return ".json";
  if (mediaType.startsWith("text/")) return ".txt";
  return ".bin";
}

export class ProviderLiveCaseExecutor implements LiveCaseExecutor {
  readonly #options: ProviderLiveCaseExecutorOptions;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #completedVideoRequestIds = new Map<string, string>();

  constructor(options: ProviderLiveCaseExecutorOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async execute(acceptanceCase: AcceptanceCase): Promise<LiveCaseExecution> {
    try {
      if (acceptanceCase.deterministicEvaluatorId === "language.v1")
        return await this.#language(acceptanceCase);
      if (acceptanceCase.deterministicEvaluatorId === "image.v1")
        return await this.#image(acceptanceCase);
      if (
        acceptanceCase.deterministicEvaluatorId === "video.v1" ||
        acceptanceCase.deterministicEvaluatorId === "video-cancel.v1"
      )
        return await this.#video(acceptanceCase);
      throw new Error(`live.deterministic_evaluator_missing:${acceptanceCase.id}`);
    } catch (cause) {
      throw new Error(`${errorCode(cause)}:${acceptanceCase.id}`, { cause });
    }
  }

  async #language(acceptanceCase: AcceptanceCase): Promise<LiveCaseExecution> {
    const invocations: PortInvocation[] = [];
    const submittedInputs: LanguageInput[] = [];
    const userContent: LanguageInput["messages"][number] extends infer Message
      ? Message extends { role: "user"; content: infer Content }
        ? Content
        : never
      : never = [{ type: "text", text: acceptanceCase.input.prompt }];
    for (const asset of acceptanceCase.input.assets) {
      const fixture = acceptanceAssetFixtures[asset.fixtureId];
      const bytes = await acceptanceFixtureBytes(this.#options.repositoryRoot, asset.fixtureId);
      if (acceptanceCase.input.mode.startsWith("provider-file")) {
        const upload = port(
          this.#options.registry,
          this.#options.providerId,
          "files.upload",
        ) as FilesUploadPort;
        const uploadRequest = {
          schemaVersion: "1.0.0",
          offeringId: this.#options.offeringId,
          idempotencyKey: `${this.#options.runId}-${acceptanceCase.id}-upload-${asset.fixtureId}`,
          input: {
            dataBase64: bytes.toString("base64"),
            byteLength: bytes.byteLength,
            mediaType: fixture.mediaType,
            filename: fixture.filename,
          },
        } as const;
        invocations.push({ operation: "files.upload", request: uploadRequest });
        const reference = await upload.upload(uploadRequest);
        if (fixture.kind === "image") {
          userContent.push({
            type: "image",
            source: {
              type: "provider_file",
              providerId: this.#options.providerId,
              fileId: reference.fileId,
              mediaType: fixture.mediaType as "image/png" | "image/jpeg",
              byteLength: bytes.byteLength,
            },
          });
        } else {
          userContent.push({
            type: "file",
            source: {
              type: "provider_file",
              providerId: this.#options.providerId,
              fileId: reference.fileId,
              mediaType: fixture.mediaType,
              byteLength: bytes.byteLength,
            },
          });
        }
      } else {
        if (fixture.kind !== "image") throw new Error("live.inline_non_image_unsupported");
        userContent.push({
          type: "image",
          source: {
            type: "inline",
            mediaType: fixture.mediaType as "image/png" | "image/jpeg",
            dataBase64: bytes.toString("base64"),
            byteLength: bytes.byteLength,
          },
          ...(typeof acceptanceCase.input.options.detail === "string"
            ? {
                detail: acceptanceCase.input.options.detail as "auto" | "low" | "high" | "original",
              }
            : {}),
        });
      }
    }
    const reasoningEffort = acceptanceCase.input.options.reasoningEffort;
    const input: LanguageInput = {
      messages: [{ role: "user", content: userContent }],
      ...(typeof reasoningEffort === "string"
        ? {
            thinking: {
              mode: "enabled" as const,
              effort: reasoningEffort as "high" | "max",
            },
          }
        : {}),
      ...(languageTools(acceptanceCase.input.options)
        ? { tools: languageTools(acceptanceCase.input.options), toolChoice: "required" as const }
        : {}),
      ...(responseFormat(acceptanceCase.input.options)
        ? { responseFormat: responseFormat(acceptanceCase.input.options) }
        : {}),
      ...(acceptanceCase.input.options.grounding
        ? { grounding: { mode: "web_search" as const } }
        : {}),
    };
    const results: LanguageResult[] = [];
    const requestIds: string[] = [];
    if (acceptanceCase.operations.includes("language.generate")) {
      const generate = port(
        this.#options.registry,
        this.#options.providerId,
        "language.generate",
      ) as LanguageGeneratePort;
      const generateRequest = {
        schemaVersion: "1.0.0",
        offeringId: this.#options.offeringId,
        idempotencyKey: `${this.#options.runId}-${acceptanceCase.id}-generate`,
        input,
      } as const;
      invocations.push({ operation: "language.generate", request: generateRequest });
      submittedInputs.push(input);
      const result = await generate.generate(generateRequest);
      results.push(result);
      if (result.providerRequestId) requestIds.push(result.providerRequestId);
    }
    if (acceptanceCase.operations.includes("language.stream")) {
      const stream = port(
        this.#options.registry,
        this.#options.providerId,
        "language.stream",
      ) as LanguageStreamPort;
      let text = "";
      let reasoning = "";
      const toolCalls: LanguageResult["toolCalls"] = [];
      const sources: NonNullable<LanguageResult["sources"]> = [];
      let finish:
        | Extract<
            Awaited<ReturnType<LanguageStreamPort["stream"]>> extends AsyncIterable<infer E>
              ? E
              : never,
            { type: "finish" }
          >
        | undefined;
      const streamRequest = {
        schemaVersion: "1.0.0",
        offeringId: this.#options.offeringId,
        idempotencyKey: `${this.#options.runId}-${acceptanceCase.id}-stream`,
        input,
      } as const;
      invocations.push({ operation: "language.stream", request: streamRequest });
      submittedInputs.push(input);
      for await (const event of await stream.stream(streamRequest)) {
        if (event.type === "text_delta") text += event.delta;
        if (event.type === "reasoning_delta") reasoning += event.delta;
        if (event.type === "tool_call") toolCalls.push(event.call);
        if (event.type === "source") sources.push(event.source);
        if (event.type === "finish") finish = event;
      }
      if (!finish) throw new Error("live.stream_terminal_missing");
      if (finish.providerRequestId) requestIds.push(finish.providerRequestId);
      results.push({
        schemaVersion: "1.0.0",
        text,
        reasoning,
        toolCalls,
        finishReason: finish.finishReason,
        usage: finish.usage,
        ...(finish.providerRequestId ? { providerRequestId: finish.providerRequestId } : {}),
        resolvedModelId: finish.resolvedModelId,
        ...(sources.length ? { sources } : {}),
        ...(finish.providerMetadata ? { providerMetadata: finish.providerMetadata } : {}),
      });
    }
    if (requestIds.length !== results.length) throw new Error("live.provider_request_id_missing");
    const artifact = await this.#writeArtifact(
      acceptanceCase,
      "response",
      "application/json",
      Buffer.from(JSON.stringify(redactSecrets({ results }), null, 2)),
      "text",
    );
    const requestArtifact = await this.#requestArtifact(acceptanceCase, invocations);
    const profile = acceptanceProfiles[this.#options.offeringId];
    const deterministicPassed = languageDeterministicPassed(
      acceptanceCase,
      results,
      submittedInputs,
      this.#options.providerId,
    );
    return {
      resolvedProviderModelId: resolvedLanguageModel(
        this.#options.observedResolvedProviderModelId,
        this.#options.requestedProviderModelId,
        results,
      ),
      deterministicPassed,
      ...(profile.kind === "facts"
        ? { factsRatio: textFactsRatio(acceptanceCase.id, results) }
        : {}),
      hardFailures: languageHardFailures(acceptanceCase, deterministicPassed),
      artifacts: [artifact, requestArtifact],
      attempts: [
        {
          attempt: 1,
          outcome: "succeeded",
          providerRequestId: requestIds.join(","),
        },
      ],
      accountedCostUsd: this.#cost(acceptanceCase.id),
    };
  }

  async #image(acceptanceCase: AcceptanceCase): Promise<LiveCaseExecution> {
    const input: CapabilityInput = {
      mode: acceptanceCase.input.mode,
      values: { prompt: acceptanceCase.input.prompt, ...acceptanceCase.input.options },
      assets: capabilityAssets(acceptanceCase),
    };
    const operation = acceptanceCase.operations.includes("image.edit")
      ? ("image.edit" as const)
      : ("image.generate" as const);
    const request = {
      schemaVersion: "1.0.0" as const,
      offeringId: this.#options.offeringId,
      idempotencyKey: `${this.#options.runId}-${acceptanceCase.id}`,
      input,
    };
    const result = acceptanceCase.operations.includes("image.edit")
      ? await (
          port(this.#options.registry, this.#options.providerId, "image.edit") as ImageEditPort
        ).edit(request)
      : await (
          port(
            this.#options.registry,
            this.#options.providerId,
            "image.generate",
          ) as ImageGeneratePort
        ).generate(request);
    if (!result.providerRequestId) throw new Error("live.provider_request_id_missing");
    const artifacts = await Promise.all(
      result.outputs.map((output, index) => {
        const bytes = Buffer.from(output.bytes);
        const mediaType = this.#validatedMediaType(bytes, output.mimeType, "image");
        return this.#writeArtifact(
          acceptanceCase,
          `output-${index + 1}`,
          mediaType,
          bytes,
          "image",
        );
      }),
    );
    artifacts.push(await this.#requestArtifact(acceptanceCase, [{ operation, request }]));
    const evaluation = mediaDeterministicEvaluation(
      acceptanceCase,
      artifacts,
      "image",
      capabilityInputMatchesCase(acceptanceCase, input),
    );
    return {
      resolvedProviderModelId:
        this.#options.observedResolvedProviderModelId ?? this.#options.requestedProviderModelId,
      deterministicPassed: evaluation.passed,
      hardFailures: evaluation.hardFailures,
      artifacts,
      attempts: [{ attempt: 1, outcome: "succeeded", providerRequestId: result.providerRequestId }],
      accountedCostUsd: this.#cost(acceptanceCase.id),
    };
  }

  async #video(acceptanceCase: AcceptanceCase): Promise<LiveCaseExecution> {
    const generate = port(
      this.#options.registry,
      this.#options.providerId,
      "video.generate",
    ) as VideoGeneratePort;
    const values = {
      prompt: acceptanceCase.input.prompt,
      ...acceptanceCase.input.options,
    } as Record<string, unknown>;
    delete values.cancelImmediatelyAfterAccepted;
    delete values.continuation;
    const continuationDefinition = acceptanceCase.input.options.continuation;
    const continuationRecord =
      continuationDefinition &&
      typeof continuationDefinition === "object" &&
      !Array.isArray(continuationDefinition)
        ? (continuationDefinition as Readonly<Record<string, unknown>>)
        : undefined;
    const sourceCaseId =
      typeof continuationRecord?.sourceCaseId === "string"
        ? continuationRecord.sourceCaseId
        : undefined;
    const parentProviderRequestId = sourceCaseId
      ? this.#completedVideoRequestIds.get(sourceCaseId)
      : undefined;
    const continuation: OperationContext["continuation"] =
      acceptanceCase.input.mode === "edit" && sourceCaseId && parentProviderRequestId
        ? {
            parentJobId: `${this.#options.runId}-${sourceCaseId}`,
            providerId: this.#options.providerId,
            offeringId: this.#options.offeringId,
            providerModelId: this.#options.requestedProviderModelId,
            providerRequestId: parentProviderRequestId,
          }
        : undefined;
    if (acceptanceCase.input.mode === "edit" && !continuation) {
      throw new Error("live.continuation_parent_missing");
    }
    const input = {
      mode: acceptanceCase.input.mode,
      values,
      assets: capabilityAssets(acceptanceCase),
    } satisfies CapabilityInput;
    const request = {
      schemaVersion: "1.0.0" as const,
      offeringId: this.#options.offeringId,
      idempotencyKey: `${this.#options.runId}-${acceptanceCase.id}`,
      input,
    };
    const context = continuation ? { continuation } : undefined;
    const invocations: PortInvocation[] = [
      { operation: "video.generate", request, ...(context ? { context } : {}) },
    ];
    const requestPassed =
      capabilityInputMatchesCase(acceptanceCase, input) &&
      (sourceCaseId
        ? continuation?.parentJobId === `${this.#options.runId}-${sourceCaseId}` &&
          continuation.providerRequestId === parentProviderRequestId
        : continuation === undefined);
    const started = await generate.start(request, context);
    if (acceptanceCase.expectedTerminalOutcome === "cancelled") {
      const cancel = port(
        this.#options.registry,
        this.#options.providerId,
        "video.cancel",
      ) as VideoCancelPort;
      invocations.push({ operation: "video.cancel", providerHandle: started.providerHandle });
      const cancelled = await cancel.cancel(started.providerHandle);
      if (!["accepted", "confirmed"].includes(cancelled.outcome)) {
        throw new Error(`live.cancel_not_confirmed:${cancelled.outcome}`);
      }
      const artifact = await this.#writeArtifact(
        acceptanceCase,
        "cancellation",
        "application/json",
        Buffer.from(
          JSON.stringify({ providerHandle: started.providerHandle, outcome: cancelled.outcome }),
        ),
        "file",
        "protocol",
      );
      const requestArtifact = await this.#requestArtifact(acceptanceCase, invocations);
      return {
        resolvedProviderModelId:
          this.#options.observedResolvedProviderModelId ?? this.#options.requestedProviderModelId,
        deterministicPassed: requestPassed,
        hardFailures: requestPassed ? [] : ["required reference or control is ignored"],
        artifacts: [artifact, requestArtifact],
        attempts: [{ attempt: 1, outcome: "cancelled", providerRequestId: started.providerHandle }],
        accountedCostUsd: this.#cost(acceptanceCase.id),
      };
    }
    const status = port(
      this.#options.registry,
      this.#options.providerId,
      "video.status",
    ) as VideoStatusPort;
    const deadline = this.#now() + (this.#options.caseTimeoutMs ?? 20 * 60 * 1_000);
    while (this.#now() < deadline) {
      invocations.push({ operation: "video.status", providerHandle: started.providerHandle });
      const observation = await status.status(started.providerHandle);
      if (observation.outcome === "queued" || observation.outcome === "running") {
        await Bun.sleep(
          Math.max(
            this.#options.pollIntervalMs ?? 1_000,
            Math.min(observation.retryAfterMs ?? 1_000, 10_000),
          ),
        );
        continue;
      }
      if (observation.outcome === "failed") throw new Error(observation.error.code);
      if (observation.outcome === "cancelled") throw new Error("live.unexpected_cancellation");
      const providerRequestId = observation.providerRequestId ?? started.providerHandle;
      this.#completedVideoRequestIds.set(acceptanceCase.id, providerRequestId);
      const artifacts = await Promise.all(
        observation.outputs.map((output, index) =>
          this.#providerArtifact(acceptanceCase, output, index),
        ),
      );
      artifacts.push(await this.#requestArtifact(acceptanceCase, invocations));
      const evaluation = mediaDeterministicEvaluation(
        acceptanceCase,
        artifacts,
        "video",
        requestPassed,
      );
      return {
        resolvedProviderModelId:
          this.#options.observedResolvedProviderModelId ?? this.#options.requestedProviderModelId,
        deterministicPassed: evaluation.passed,
        hardFailures: evaluation.hardFailures,
        artifacts,
        attempts: [{ attempt: 1, outcome: "succeeded", providerRequestId }],
        accountedCostUsd: this.#cost(acceptanceCase.id),
      };
    }
    throw new Error("live.video_timeout");
  }

  async #providerArtifact(
    acceptanceCase: AcceptanceCase,
    artifact: ProviderOutputArtifact,
    index: number,
  ): Promise<ArtifactEvidence> {
    let bytes: Buffer;
    if ("bytes" in artifact) bytes = Buffer.from(artifact.bytes);
    else {
      const headers = new Headers();
      if (artifact.authorization) {
        const url = new URL(artifact.url);
        if (!artifact.authorization.allowedOrigins.includes(url.origin)) {
          throw new Error("live.output_authorization_origin_denied");
        }
        const credential = await this.#options.credentialVault.get({
          providerId: this.#options.providerId,
          slot: artifact.authorization.credentialSlot,
        });
        if (!credential) throw new Error("live.output_credential_missing");
        headers.set(artifact.authorization.headerName, credential);
      }
      const response = await this.#fetch(artifact.url, { headers });
      if (!response.ok) throw new Error(`live.output_download_failed:${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (!bytes.byteLength) throw new Error("live.output_empty");
    const mediaType = this.#validatedMediaType(
      bytes,
      artifact.mimeType,
      artifact.kind as "image" | "video" | "audio",
    );
    return this.#writeArtifact(
      acceptanceCase,
      `output-${index + 1}`,
      mediaType,
      bytes,
      artifact.kind,
    );
  }

  #validatedMediaType(
    bytes: Buffer,
    declaredMediaType: string | undefined,
    expectedKind: "image" | "video" | "audio",
  ): string {
    const detected = detectMediaType(bytes);
    if (!detected || detected.kind !== expectedKind) throw new Error("live.output_media_invalid");
    if (
      declaredMediaType &&
      declaredMediaType !== "application/octet-stream" &&
      declaredMediaType.toLowerCase() !== detected.mimeType
    ) {
      throw new Error("live.output_media_type_mismatch");
    }
    return detected.mimeType;
  }

  async #writeArtifact(
    acceptanceCase: AcceptanceCase,
    name: string,
    mediaType: string,
    bytes: Buffer,
    kind: ArtifactEvidence["kind"],
    purpose: ArtifactEvidence["purpose"] = "output",
  ): Promise<ArtifactEvidence> {
    if (!bytes.byteLength) throw new Error("live.output_empty");
    const relativePath = `${acceptanceCase.id}/${name}${extension(mediaType)}`;
    const destination = path.join(
      this.#options.artifactDirectory,
      this.#options.runId,
      relativePath,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    const metadata = inspectMediaMetadata(bytes);
    if (
      (kind === "image" || kind === "video" || kind === "audio") &&
      (!metadata || metadata.kind !== kind || metadata.mimeType !== mediaType)
    ) {
      throw new Error("live.output_media_metadata_invalid");
    }
    if (
      (kind === "image" || kind === "video") &&
      (!metadata?.width || !metadata.height || (kind === "video" && !metadata.durationSeconds))
    ) {
      throw new Error("live.output_media_metadata_incomplete");
    }
    return {
      kind,
      purpose,
      mediaType,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      reviewPath: relativePath,
      ...(metadata?.width ? { width: metadata.width } : {}),
      ...(metadata?.height ? { height: metadata.height } : {}),
      ...(metadata?.durationSeconds ? { durationSeconds: metadata.durationSeconds } : {}),
    };
  }

  #requestArtifact(
    acceptanceCase: AcceptanceCase,
    invocations: readonly PortInvocation[],
  ): Promise<ArtifactEvidence> {
    return this.#writeArtifact(
      acceptanceCase,
      "normalized-request",
      "application/json",
      Buffer.from(
        JSON.stringify(
          {
            offeringId: this.#options.offeringId,
            requestedProviderModelId: this.#options.requestedProviderModelId,
            caseSha256: acceptanceCaseSha256(acceptanceCase),
            invocations: redactSecrets(invocations),
          },
          null,
          2,
        ),
      ),
      "file",
      "normalized_request",
    );
  }

  #cost(caseId: string): string {
    const value = this.#options.accountedCostUsdByCase[caseId];
    if (!value) throw new Error(`live.cost_missing:${caseId}`);
    return value;
  }
}
