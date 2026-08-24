import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  assertLiveTestAuthorization,
  createLiveTestPreview,
  executeLiveAcceptanceSuite,
} from "./run-live-tests";
import { verifyExecutionAttestation } from "@/release/attestation";

const cases = [
  {
    id: "fal-h3-text",
    credentialEnv: "FAL_KEY",
    estimatedMaxUsd: "0.60",
  },
];

describe("live test authorization", () => {
  test("fails closed unless live tests are explicitly enabled", () => {
    const preview = createLiveTestPreview(cases);

    expect(() =>
      assertLiveTestAuthorization(preview, {
        FAL_KEY: "configured",
        NARRASTAGE_LIVE_TEST_MAX_USD: "1.00",
      }),
    ).toThrow(/NARRASTAGE_LIVE_TESTS=1/);
  });

  test("rejects a suite whose estimated maximum exceeds the approved budget", () => {
    const preview = createLiveTestPreview(cases);

    expect(() =>
      assertLiveTestAuthorization(preview, {
        FAL_KEY: "configured",
        NARRASTAGE_LIVE_TESTS: "1",
        NARRASTAGE_LIVE_TEST_MAX_USD: "0.50",
      }),
    ).toThrow(/exceeds approved budget/);
  });

  test("returns a secret-free preview for an authorized suite", () => {
    const preview = createLiveTestPreview(cases);

    assertLiveTestAuthorization(preview, {
      FAL_KEY: "configured",
      NARRASTAGE_LIVE_TESTS: "1",
      NARRASTAGE_LIVE_TEST_MAX_USD: "0.60",
    });

    expect(preview).toEqual({
      schemaVersion: 1,
      caseCount: 1,
      estimatedMaxUsd: "0.60",
      cases,
    });
    expect(JSON.stringify(preview)).not.toContain("configured");
  });

  test("executes every frozen case sequentially and signs the redacted report", async () => {
    const keys = generateKeyPairSync("ed25519");
    const executed: string[] = [];
    const report = await executeLiveAcceptanceSuite({
      repositoryRoot: process.cwd(),
      offeringId: "deepseek:v4-pro:official",
      providerId: "deepseek",
      requestedProviderModelId: "deepseek-v4-pro",
      deploymentRegion: "global",
      adapterManifestId: "deepseek-v4",
      adapterManifestSha256: "a".repeat(64),
      acceptanceSuiteId: "provider-product-acceptance-v1",
      acceptanceSuiteSha256: "b".repeat(64),
      sdkPackage: "@ai-sdk/deepseek",
      sdkVersion: "3.0.31",
      providerApiRevision: "v1",
      runId: "workflow-run-1",
      credentialEnv: "DEEPSEEK_API_KEY",
      estimatedMaximumUsdByCase: {
        instruction: "0.01",
        "structured-output": "0.01",
        "tool-call": "0.01",
        "reasoning-high": "0.01",
        "reasoning-max": "0.01",
      },
      executor: {
        async execute(acceptanceCase) {
          executed.push(acceptanceCase.id);
          return {
            resolvedProviderModelId: "deepseek-v4-pro@2026-08-23",
            deterministicPassed: true,
            factsRatio: 1,
            hardFailures: [],
            artifacts: [
              {
                kind: "text",
                purpose: "output",
                mediaType: "text/plain",
                byteLength: 8,
                sha256: "c".repeat(64),
                reviewPath: `${acceptanceCase.id}/response.txt`,
              },
            ],
            attempts: [
              {
                attempt: 1,
                outcome: "succeeded",
                providerRequestId: `provider-${acceptanceCase.id}`,
              },
            ],
            accountedCostUsd: "0.01",
          };
        },
      },
      executorId: "ci-executor",
      executorPrivateKey: keys.privateKey,
      repository: "reedchan7/NarraStage",
      workflow: "provider-live-acceptance",
      environment: "acceptance",
      commitSha: "1".repeat(40),
      workflowRunId: "12345",
      executorManifestSha256: "d".repeat(64),
      env: {
        DEEPSEEK_API_KEY: "configured",
        NARRASTAGE_LIVE_TESTS: "1",
        NARRASTAGE_LIVE_TEST_MAX_USD: "0.05",
      },
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    });
    expect(executed).toEqual([
      "instruction",
      "structured-output",
      "tool-call",
      "reasoning-high",
      "reasoning-max",
    ]);
    expect(report).toMatchObject({
      accountedCostUsd: "0.05",
      costBasis: "conservative_case_cap",
    });
    expect(
      verifyExecutionAttestation(report, {
        schemaVersion: 1,
        executors: [
          {
            id: "ci-executor",
            publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
            repository: "reedchan7/NarraStage",
            workflow: "provider-live-acceptance",
            environments: ["acceptance"],
          },
        ],
        reviewers: [],
      }),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain("configured");
  });
});
