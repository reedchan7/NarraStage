import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  defineProviderAdapter,
  type LanguageInput,
  type OperationRequest,
} from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { acceptanceFixtureBytes, acceptanceProfiles } from "@/release/acceptanceSuite";
import { ProviderLiveCaseExecutor } from "./live-provider-executor";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("real live provider executor wiring", () => {
  test("drives registered generate and stream ports and writes digest-bound review artifacts", async () => {
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-artifacts-"));
    directories.push(artifactDirectory);
    const calls: string[] = [];
    const submittedRequests: unknown[] = [];
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "deepseek",
        ports: [
          {
            operation: "language.generate" as const,
            async generate(request: OperationRequest<LanguageInput>) {
              calls.push("generate");
              submittedRequests.push(structuredClone(request));
              return {
                schemaVersion: "1.0.0" as const,
                text: "11, 13, 17",
                reasoning: "",
                toolCalls: [],
                finishReason: "stop" as const,
                usage: {},
                providerRequestId: "generate-request",
                resolvedModelId: "deepseek-v4-pro-20260823",
              };
            },
          },
          {
            operation: "language.stream" as const,
            async stream(request: OperationRequest<LanguageInput>) {
              calls.push("stream");
              submittedRequests.push(structuredClone(request));
              return (async function* () {
                yield { type: "text_delta" as const, delta: "11, 13, 17" };
                yield {
                  type: "finish" as const,
                  finishReason: "stop" as const,
                  usage: {},
                  providerRequestId: "stream-request",
                  resolvedModelId: "deepseek-v4-pro-20260823",
                };
              })();
            },
          },
        ],
      }),
    );
    const acceptanceCase = acceptanceProfiles["deepseek:v4-pro:official"].cases[0]!;
    const executor = new ProviderLiveCaseExecutor({
      repositoryRoot: process.cwd(),
      artifactDirectory,
      runId: "executor-wiring",
      offeringId: "deepseek:v4-pro:official",
      providerId: "deepseek",
      requestedProviderModelId: "deepseek-v4-pro",
      registry,
      credentialVault: new MemoryCredentialVault(),
      accountedCostUsdByCase: { instruction: "0.01" },
    });

    const result = await executor.execute(acceptanceCase);

    expect(calls).toEqual(["generate", "stream"]);
    expect(result).toMatchObject({
      resolvedProviderModelId: "deepseek-v4-pro-20260823",
      deterministicPassed: true,
      factsRatio: 1,
      attempts: [
        {
          outcome: "succeeded",
          providerRequestId: "generate-request,stream-request",
        },
      ],
    });
    const artifact = result.artifacts[0]!;
    const bytes = await readFile(
      path.join(artifactDirectory, "executor-wiring", artifact.reviewPath),
    );
    expect(bytes.byteLength).toBe(artifact.byteLength);
    expect(JSON.parse(bytes.toString())).toHaveProperty("results.0.text", "11, 13, 17");
    const requestArtifact = result.artifacts.find(
      (candidate) => candidate.purpose === "normalized_request",
    )!;
    const requestBytes = await readFile(
      path.join(artifactDirectory, "executor-wiring", requestArtifact.reviewPath),
    );
    const normalizedRequests = JSON.parse(requestBytes.toString()) as {
      invocations: Array<{ operation: string; request: unknown }>;
    };
    expect(normalizedRequests.invocations.map((invocation) => invocation.operation)).toEqual([
      "language.generate",
      "language.stream",
    ]);
    expect(normalizedRequests.invocations.map((invocation) => invocation.request)).toEqual(
      submittedRequests,
    );
  });

  test("CLI previews the exact frozen suite without credentials and fails closed before live calls", async () => {
    const preview = Bun.spawn(
      [
        process.execPath,
        "scripts/run-live-tests.ts",
        "--dry-run",
        "--offering",
        "deepseek:v4-pro:official",
        "--case-max-usd",
        "0.01",
      ],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    expect(await preview.exited).toBe(0);
    expect(JSON.parse(await new Response(preview.stdout).text())).toMatchObject({
      schemaVersion: 1,
      caseCount: 5,
      estimatedMaxUsd: "0.05",
    });

    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-cli-"));
    directories.push(artifactDirectory);
    const output = path.join(artifactDirectory, "missing-credential.json");
    const live = Bun.spawn(
      [
        process.execPath,
        "scripts/run-live-tests.ts",
        "--offering",
        "deepseek:v4-pro:official",
        "--case-max-usd",
        "0.01",
        "--run-id",
        "missing-credential",
        "--artifact-dir",
        artifactDirectory,
        "--output",
        output,
      ],
      {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: "",
          DEEPSEEK_KEY: "",
          TOONFLOW_LIVE_TESTS: "1",
          TOONFLOW_LIVE_TEST_MAX_USD: "0.05",
        },
      },
    );
    expect(await live.exited).not.toBe(0);
    expect(await new Response(live.stderr).text()).toContain("missing live-test credentials");
    expect(await Bun.file(output).exists()).toBe(false);
  });

  test("polls real video ports, validates media bytes, and targets cancellation at the accepted handle", async () => {
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-video-"));
    directories.push(artifactDirectory);
    const video = await acceptanceFixtureBytes(process.cwd(), "endingVideo");
    const calls: string[] = [];
    let statusCalls = 0;
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "fal",
        ports: [
          {
            operation: "video.generate" as const,
            async start(request) {
              calls.push(
                `start:${String(request.input && (request.input as { mode?: string }).mode)}`,
              );
              return {
                providerHandle: request.idempotencyKey.includes("protocol-cancel")
                  ? "handle-cancel"
                  : "handle-video",
                providerOutcome: "queued" as const,
              };
            },
          },
          {
            operation: "video.status" as const,
            async status(handle) {
              calls.push(`status:${handle}`);
              statusCalls += 1;
              return statusCalls === 1
                ? { outcome: "running" as const, retryAfterMs: 0 }
                : {
                    outcome: "succeeded" as const,
                    providerRequestId: "fal-request-1",
                    outputs: [{ kind: "video" as const, bytes: video, mimeType: "video/mp4" }],
                  };
            },
          },
          {
            operation: "video.cancel" as const,
            async cancel(handle) {
              calls.push(`cancel:${handle}`);
              return { outcome: "accepted" as const };
            },
          },
        ],
      }),
    );
    const executor = new ProviderLiveCaseExecutor({
      repositoryRoot: process.cwd(),
      artifactDirectory,
      runId: "video-wiring",
      offeringId: "minimax:h3:fal",
      providerId: "fal",
      requestedProviderModelId: "minimax/h3",
      observedResolvedProviderModelId: "minimax/h3@endpoints-sha256:abc",
      registry,
      credentialVault: new MemoryCredentialVault(),
      pollIntervalMs: 0,
      accountedCostUsdByCase: {
        "text-landscape": "0.30",
        "protocol-cancel": "0.01",
        "wrong-resolution": "0.01",
      },
    });
    const profile = acceptanceProfiles["minimax:h3:fal"];
    const generated = await executor.execute(
      profile.cases.find((candidate) => candidate.id === "text-landscape")!,
    );
    const cancelled = await executor.execute(
      profile.cases.find((candidate) => candidate.id === "protocol-cancel")!,
    );
    const wrongResolution = structuredClone(
      profile.cases.find((candidate) => candidate.id === "text-landscape")!,
    );
    wrongResolution.id = "wrong-resolution";
    wrongResolution.input.options = { ...wrongResolution.input.options, resolution: "2K" };
    const invalid = await executor.execute(wrongResolution);

    expect(generated).toMatchObject({
      deterministicPassed: true,
      attempts: [{ outcome: "succeeded", providerRequestId: "fal-request-1" }],
    });
    expect(generated.artifacts.find((artifact) => artifact.kind === "video")).toMatchObject({
      mediaType: "video/mp4",
      width: 1280,
      height: 720,
    });
    expect(cancelled).toMatchObject({
      deterministicPassed: true,
      attempts: [{ outcome: "cancelled", providerRequestId: "handle-cancel" }],
    });
    expect(invalid).toMatchObject({
      deterministicPassed: false,
      hardFailures: ["artifact is corrupt, truncated, or outside the declared output contract"],
    });
    expect(calls).toEqual([
      "start:text",
      "status:handle-video",
      "status:handle-video",
      "start:text",
      "cancel:handle-cancel",
      "start:text",
      "status:handle-video",
    ]);
  });

  test("rejects JSON that parses but violates frozen types and additionalProperties", async () => {
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-structure-"));
    directories.push(artifactDirectory);
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "deepseek",
        ports: [
          {
            operation: "language.generate" as const,
            async generate() {
              return {
                schemaVersion: "1.0.0" as const,
                text: JSON.stringify({
                  name: "Ada Lovelace",
                  occupation: "mathematician",
                  birthYear: "1815",
                  unregistered: true,
                }),
                reasoning: "",
                toolCalls: [],
                finishReason: "stop" as const,
                usage: {},
                providerRequestId: "malformed-request",
                resolvedModelId: "deepseek-v4-pro-20260823",
              };
            },
          },
        ],
      }),
    );
    const acceptanceCase = acceptanceProfiles["deepseek:v4-pro:official"].cases.find(
      (candidate) => candidate.id === "structured-output",
    )!;
    const executor = new ProviderLiveCaseExecutor({
      repositoryRoot: process.cwd(),
      artifactDirectory,
      runId: "structured-failure",
      offeringId: "deepseek:v4-pro:official",
      providerId: "deepseek",
      requestedProviderModelId: "deepseek-v4-pro",
      registry,
      credentialVault: new MemoryCredentialVault(),
      accountedCostUsdByCase: { "structured-output": "0.01" },
    });

    expect(await executor.execute(acceptanceCase)).toMatchObject({
      deterministicPassed: false,
      factsRatio: 0,
      attempts: [{ outcome: "succeeded", providerRequestId: "malformed-request" }],
    });
  });

  test("rejects tool arguments that only satisfy required-key presence", async () => {
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-tool-schema-"));
    directories.push(artifactDirectory);
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "deepseek",
        ports: [
          {
            operation: "language.generate" as const,
            async generate() {
              return {
                schemaVersion: "1.0.0" as const,
                text: "",
                reasoning: "",
                toolCalls: [
                  {
                    toolCallId: "call-invalid",
                    toolName: "add",
                    input: { a: "137", b: 905, unregistered: true },
                  },
                ],
                finishReason: "tool_calls" as const,
                usage: {},
                providerRequestId: "tool-schema-request",
                resolvedModelId: "deepseek-v4-pro-20260823",
              };
            },
          },
        ],
      }),
    );
    const acceptanceCase = acceptanceProfiles["deepseek:v4-pro:official"].cases.find(
      (candidate) => candidate.id === "tool-call",
    )!;
    const executor = new ProviderLiveCaseExecutor({
      repositoryRoot: process.cwd(),
      artifactDirectory,
      runId: "tool-schema-failure",
      offeringId: "deepseek:v4-pro:official",
      providerId: "deepseek",
      requestedProviderModelId: "deepseek-v4-pro",
      registry,
      credentialVault: new MemoryCredentialVault(),
      accountedCostUsdByCase: { "tool-call": "0.01" },
    });

    expect(await executor.execute(acceptanceCase)).toMatchObject({
      deterministicPassed: false,
      factsRatio: 0,
      hardFailures: ["missing required structured field or tool argument"],
    });
  });

  test("rejects a grounding response whose stream omits source metadata", async () => {
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-grounding-"));
    directories.push(artifactDirectory);
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "google",
        ports: [
          {
            operation: "language.stream" as const,
            async stream() {
              return (async function* () {
                yield { type: "text_delta" as const, delta: "Google Search grounding" };
                yield {
                  type: "finish" as const,
                  finishReason: "stop" as const,
                  usage: {},
                  providerRequestId: "grounding-request",
                  resolvedModelId: "gemini-3.7-flash-001",
                };
              })();
            },
          },
        ],
      }),
    );
    const acceptanceCase = acceptanceProfiles["google:gemini-3.7-flash:official"].cases.find(
      (candidate) => candidate.id === "search-grounding",
    )!;
    const executor = new ProviderLiveCaseExecutor({
      repositoryRoot: process.cwd(),
      artifactDirectory,
      runId: "grounding-failure",
      offeringId: "google:gemini-3.7-flash:official",
      providerId: "google",
      requestedProviderModelId: "gemini-3.7-flash",
      registry,
      credentialVault: new MemoryCredentialVault(),
      accountedCostUsdByCase: { "search-grounding": "0.01" },
    });

    expect(await executor.execute(acceptanceCase)).toMatchObject({
      deterministicPassed: false,
      hardFailures: ["stream loses content, tool state, or terminal event"],
    });
  });

  test("binds Omni continuation to the frozen source case instead of the last completed job", async () => {
    const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toonflow-live-omni-"));
    directories.push(artifactDirectory);
    const video = await acceptanceFixtureBytes(process.cwd(), "endingVideo");
    const continuations: Array<string | undefined> = [];
    const handles = new Map<string, string>();
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "google",
        ports: [
          {
            operation: "video.generate" as const,
            async start(request, context) {
              const caseId = request.idempotencyKey.split("omni-lineage-")[1]!;
              const handle = `handle-${caseId}`;
              handles.set(handle, caseId);
              continuations.push(context?.continuation?.providerRequestId);
              return { providerHandle: handle, providerOutcome: "queued" as const };
            },
          },
          {
            operation: "video.status" as const,
            async status(handle) {
              const caseId = handles.get(handle)!;
              return {
                outcome: "succeeded" as const,
                providerRequestId: `request-${caseId}`,
                outputs: [{ kind: "video" as const, bytes: video, mimeType: "video/mp4" }],
              };
            },
          },
        ],
      }),
    );
    const executor = new ProviderLiveCaseExecutor({
      repositoryRoot: process.cwd(),
      artifactDirectory,
      runId: "omni-lineage",
      offeringId: "google:gemini-omni-flash:official",
      providerId: "google",
      requestedProviderModelId: "gemini-omni-flash-preview",
      registry,
      credentialVault: new MemoryCredentialVault(),
      pollIntervalMs: 0,
      accountedCostUsdByCase: {
        "omni-text": "0.01",
        "omni-multimodal-images": "0.01",
        "omni-conversational-edit": "0.01",
      },
    });
    const profile = acceptanceProfiles["google:gemini-omni-flash:official"];
    for (const caseId of ["omni-text", "omni-multimodal-images", "omni-conversational-edit"]) {
      await executor.execute(profile.cases.find((candidate) => candidate.id === caseId)!);
    }

    expect(continuations).toEqual([undefined, undefined, "request-omni-text"]);
  });
});
