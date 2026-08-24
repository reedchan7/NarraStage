import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { signExecution, verifyReviewAttestation } from "@/release/attestation";
import type {
  EvidenceTrustDocument,
  LiveAcceptanceReport,
  ReviewDecisionDocument,
} from "@/release/evidence";
import { evidenceTrustDocumentSchema } from "@/release/evidence";
import { liveReviewerManifestDigest, loadLiveReports } from "@/release/manifestDigests";
import { reviewLiveReport } from "./review-live-report";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "narrastage-live-review-"));
  directories.push(root);
  const artifactDirectory = path.join(root, "artifacts");
  const reviewPath = "instruction/response.txt";
  const bytes = Buffer.from("11, 13, 17");
  await mkdir(path.join(artifactDirectory, "instruction"), { recursive: true });
  await writeFile(path.join(artifactDirectory, reviewPath), bytes);
  const executor = generateKeyPairSync("ed25519");
  const reviewerA = generateKeyPairSync("ed25519");
  const reviewerB = generateKeyPairSync("ed25519");
  const publicKeyPem = (keys: typeof executor) =>
    keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = (keys: typeof executor) =>
    keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const trust: EvidenceTrustDocument = {
    schemaVersion: 1,
    executors: [
      {
        id: "executor",
        publicKeyPem: publicKeyPem(executor),
        repository: "reedchan7/NarraStage",
        workflow: "provider-live-acceptance",
        environments: ["provider-acceptance"],
      },
    ],
    reviewers: [
      { id: "reviewer-a", publicKeyPem: publicKeyPem(reviewerA) },
      { id: "reviewer-b", publicKeyPem: publicKeyPem(reviewerB) },
    ],
  };
  const report: LiveAcceptanceReport = {
    schemaVersion: 1,
    runId: "review-run-1",
    offeringId: "deepseek:v4-pro:official",
    providerId: "deepseek",
    requestedProviderModelId: "deepseek-v4-pro",
    resolvedProviderModelId: "deepseek-v4-pro@2026-08-23",
    deploymentRegion: "global",
    adapterManifestId: "deepseek-v4",
    adapterManifestSha256: "a".repeat(64),
    acceptanceSuiteId: "provider-product-acceptance-v1",
    acceptanceSuiteSha256: "b".repeat(64),
    sdkPackage: "@ai-sdk/deepseek",
    sdkVersion: "3.0.31",
    providerApiRevision: "v1",
    startedAt: "2026-08-23T12:00:00.000Z",
    completedAt: "2026-08-23T12:01:00.000Z",
    estimatedMaximumUsd: "0.01",
    accountedCostUsd: "0.01",
    costBasis: "conservative_case_cap",
    samples: [
      {
        caseId: "instruction",
        caseSha256: "c".repeat(64),
        group: "language",
        operations: ["language.generate"],
        deterministicPassed: true,
        factsRatio: 1,
        hardFailures: [],
        artifacts: [
          {
            kind: "text",
            purpose: "output",
            mediaType: "text/plain",
            byteLength: bytes.byteLength,
            sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
            reviewPath,
          },
        ],
        attempts: [{ attempt: 1, outcome: "succeeded", providerRequestId: "provider-request" }],
        reviews: [],
      },
    ],
    executionAttestation: {
      executorId: "executor",
      repository: "reedchan7/NarraStage",
      workflow: "provider-live-acceptance",
      environment: "provider-acceptance",
      commitSha: "1".repeat(40),
      workflowRunId: "12345",
      executorManifestSha256: "d".repeat(64),
      signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
    },
  };
  report.executionAttestation.signature.valueBase64 = signExecution(report, executor.privateKey);
  const decisions = (reviewerId: string): ReviewDecisionDocument => ({
    schemaVersion: 1,
    runId: report.runId,
    reviewerId,
    role: "blind",
    cases: [
      {
        caseId: "instruction",
        promptAdherence: 4,
        referenceControlAdherence: 4,
        artifactCorrectness: 4,
        usability: 4,
        hardFailures: [],
      },
    ],
  });
  return {
    root,
    artifactDirectory,
    report,
    trust,
    reviewerA,
    reviewerB,
    executor,
    privateKeyPem,
    decisions,
    reviewPath,
    bytes,
  };
}

describe("signed live report review", () => {
  test("revalidates artifact bytes and appends two independent manifest-bound reviews", async () => {
    const value = await fixture();
    const first = await reviewLiveReport({
      repositoryRoot: process.cwd(),
      report: value.report,
      decisions: value.decisions("reviewer-a"),
      trust: value.trust,
      artifactDirectory: value.artifactDirectory,
      reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
    });
    const second = await reviewLiveReport({
      repositoryRoot: process.cwd(),
      report: first,
      decisions: value.decisions("reviewer-b"),
      trust: value.trust,
      artifactDirectory: value.artifactDirectory,
      reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerB),
    });

    const reviews = second.samples[0]!.reviews;
    expect(reviews.map((review) => review.reviewerId)).toEqual(["reviewer-a", "reviewer-b"]);
    expect(
      reviews.every(
        (review) => review.reviewerManifestSha256 === reviews[0]!.reviewerManifestSha256,
      ),
    ).toBe(true);
    expect(reviews[0]!.reviewerManifestSha256).toBe(
      await liveReviewerManifestDigest(process.cwd()),
    );
    expect(
      reviews.every((review) =>
        verifyReviewAttestation(second, "instruction", review, value.trust),
      ),
    ).toBe(true);
  });

  test("rejects missing, modified, escaped, and duplicate review artifacts", async () => {
    const value = await fixture();
    await writeFile(path.join(value.artifactDirectory, value.reviewPath), "tampered");
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: value.report,
        decisions: value.decisions("reviewer-a"),
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow(/artifact_(length|digest)_mismatch/);
    await writeFile(path.join(value.artifactDirectory, value.reviewPath), value.bytes);

    const escaped = structuredClone(value.report);
    escaped.samples[0]!.artifacts[0]!.reviewPath = "../outside.txt";
    escaped.executionAttestation.signature.valueBase64 = signExecution(
      escaped,
      value.executor.privateKey,
    );
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: escaped,
        decisions: value.decisions("reviewer-a"),
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow();

    const duplicate = structuredClone(value.report);
    duplicate.samples[0]!.artifacts.push(duplicate.samples[0]!.artifacts[0]!);
    duplicate.executionAttestation.signature.valueBase64 = signExecution(
      duplicate,
      value.executor.privateKey,
    );
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: duplicate,
        decisions: value.decisions("reviewer-a"),
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow(/artifact_path_duplicate/);
  });

  test("fails closed for wrong run, incomplete decisions, duplicate signer, and wrong key", async () => {
    const value = await fixture();
    const wrongRun = value.decisions("reviewer-a");
    wrongRun.runId = "other-run";
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: value.report,
        decisions: wrongRun,
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow(/run_mismatch/);

    const incomplete = value.decisions("reviewer-a");
    incomplete.cases = [];
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: value.report,
        decisions: incomplete,
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow(/case_set_mismatch/);

    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: value.report,
        decisions: value.decisions("reviewer-a"),
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerB),
      }),
    ).rejects.toThrow(/private_key_mismatch/);

    const reviewed = await reviewLiveReport({
      repositoryRoot: process.cwd(),
      report: value.report,
      decisions: value.decisions("reviewer-a"),
      trust: value.trust,
      artifactDirectory: value.artifactDirectory,
      reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
    });
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: reviewed,
        decisions: value.decisions("reviewer-a"),
        trust: value.trust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow(/duplicate_signer/);

    const aliasedTrust = structuredClone(value.trust);
    aliasedTrust.reviewers[1]!.publicKeyPem = aliasedTrust.reviewers[0]!.publicKeyPem.replaceAll(
      "\n",
      "\r\n",
    );
    expect(evidenceTrustDocumentSchema.safeParse(aliasedTrust).success).toBe(false);
    await expect(
      reviewLiveReport({
        repositoryRoot: process.cwd(),
        report: reviewed,
        decisions: value.decisions("reviewer-b"),
        trust: aliasedTrust,
        artifactDirectory: value.artifactDirectory,
        reviewerPrivateKeyPem: value.privateKeyPem(value.reviewerA),
      }),
    ).rejects.toThrow();
  });

  test("CLI emits a schema-valid immutable report that the release loader round-trips", async () => {
    const value = await fixture();
    const inputPath = path.join(value.root, "input.json");
    const decisionsPath = path.join(value.root, "decisions.json");
    const trustPath = path.join(value.root, "trust.json");
    const reportDirectory = path.join(value.root, "data/contracts/live-reports");
    const outputPath = path.join(reportDirectory, `${value.report.runId}.json`);
    await Promise.all([
      writeFile(inputPath, JSON.stringify(value.report)),
      writeFile(decisionsPath, JSON.stringify(value.decisions("reviewer-a"))),
      writeFile(trustPath, JSON.stringify(value.trust)),
    ]);
    const packetPath = path.join(value.root, `${value.report.runId}.review-packet.json`);
    const prepare = Bun.spawn(
      [
        globalThis.process.execPath,
        "scripts/review-live-report.ts",
        "--prepare",
        "--report",
        inputPath,
        "--artifact-dir",
        value.artifactDirectory,
        "--trust",
        trustPath,
        "--output",
        packetPath,
      ],
      { cwd: globalThis.process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    expect(await prepare.exited).toBe(0);
    expect(JSON.parse(await readFile(packetPath, "utf8"))).toMatchObject({
      runId: value.report.runId,
      cases: [
        {
          caseId: "instruction",
          prompt: expect.any(String),
          expectedFacts: expect.any(Array),
          deterministicAssertions: expect.any(Array),
          artifacts: [{ reviewPath: value.reviewPath }],
        },
      ],
    });
    const process = Bun.spawn(
      [
        globalThis.process.execPath,
        "scripts/review-live-report.ts",
        "--report",
        inputPath,
        "--artifact-dir",
        value.artifactDirectory,
        "--decisions",
        decisionsPath,
        "--trust",
        trustPath,
        "--output",
        outputPath,
      ],
      {
        cwd: globalThis.process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...globalThis.process.env,
          NARRASTAGE_REVIEWER_PRIVATE_KEY_PEM: value.privateKeyPem(value.reviewerA),
        },
      },
    );
    expect(await process.exited).toBe(0);
    expect(JSON.parse(await new Response(process.stdout).text())).toMatchObject({
      runId: value.report.runId,
      reviewerId: "reviewer-a",
    });
    expect(await new Response(process.stderr).text()).toBe("");
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      samples: [{ reviews: [{ reviewerId: "reviewer-a" }] }],
    });
    expect(await loadLiveReports(value.root)).toHaveProperty(value.report.runId);
  });
});
