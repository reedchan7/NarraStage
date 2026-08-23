import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { ProviderCatalog } from "@/providers/domain/models";
import type { Operation } from "@/providers/domain/operations";
import type {
  LiveAcceptanceReport,
  LiveAcceptanceSample,
  ProductEvidenceDocument,
} from "@/release/evidence";
import {
  assertReleaseEvidence,
  releaseEvidenceIssues,
  type ReleaseEvidenceContext,
} from "@/release/releaseGate";
import { acceptanceCaseSha256, acceptanceProfiles } from "@/release/acceptanceSuite";
import { signExecution, signReview, verifyExecutionAttestation } from "@/release/attestation";
import { releaseTargets } from "@/release/supportMatrix";

const now = Date.parse("2026-08-24T00:00:00.000Z");
const manifestDigests = {
  "deepseek-v4": "a".repeat(64),
  "fal-h3": "b".repeat(64),
  "google-generative-ai": "c".repeat(64),
};
const executorKeys = generateKeyPairSync("ed25519");
const reviewerManifestSha256 = "6".repeat(64);
const reviewerKeys = {
  "blind-a": generateKeyPairSync("ed25519"),
  "blind-b": generateKeyPairSync("ed25519"),
  a: generateKeyPairSync("ed25519"),
  b: generateKeyPairSync("ed25519"),
  judge: generateKeyPairSync("ed25519"),
};
const publicPem = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const evidenceTrust = {
  schemaVersion: 1 as const,
  executors: [
    {
      id: "ci-executor",
      publicKeyPem: publicPem(executorKeys.publicKey),
      repository: "reedchan7/Toonflow-app",
      workflow: "provider-live-acceptance",
      environments: ["acceptance"],
    },
  ],
  reviewers: Object.entries(reviewerKeys).map(([id, keys]) => ({
    id,
    publicKeyPem: publicPem(keys.publicKey),
  })),
};

function sample(
  caseId: string,
  group: string,
  operations: readonly Operation[],
  factsRatio?: number,
  expectedOutcome: "succeeded" | "cancelled" = "succeeded",
  requiresReview = true,
  caseSha256 = "a".repeat(64),
): LiveAcceptanceSample {
  return {
    caseId,
    caseSha256,
    group,
    operations: [...operations],
    deterministicPassed: true,
    ...(factsRatio === undefined ? {} : { factsRatio }),
    hardFailures: [],
    artifacts: [
      {
        kind: "text",
        purpose: expectedOutcome === "cancelled" ? "protocol" : "output",
        mediaType: "text/plain",
        byteLength: 8,
        sha256: "9".repeat(64),
        reviewPath: `${caseId}/response.txt`,
      },
      {
        kind: "file",
        purpose: "normalized_request",
        mediaType: "application/json",
        byteLength: 8,
        sha256: "8".repeat(64),
        reviewPath: `${caseId}/normalized-request.json`,
      },
    ],
    attempts: [{ attempt: 1, outcome: expectedOutcome, providerRequestId: `request-${caseId}` }],
    reviews:
      factsRatio === undefined && requiresReview
        ? [
            {
              reviewerId: "blind-a",
              role: "blind",
              reviewerManifestSha256,
              promptAdherence: 4,
              referenceControlAdherence: 3,
              artifactCorrectness: 4,
              usability: 4,
              hardFailures: [],
              signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
            },
            {
              reviewerId: "blind-b",
              role: "blind",
              reviewerManifestSha256,
              promptAdherence: 3,
              referenceControlAdherence: 4,
              artifactCorrectness: 4,
              usability: 3,
              hardFailures: [],
              signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
            },
          ]
        : [],
  };
}

function signReport(report: LiveAcceptanceReport): void {
  report.executionAttestation.signature.valueBase64 = signExecution(
    report,
    executorKeys.privateKey,
  );
  for (const current of report.samples) {
    for (const review of current.reviews) {
      const key = reviewerKeys[review.reviewerId as keyof typeof reviewerKeys];
      if (!key) throw new Error(`missing test reviewer key: ${review.reviewerId}`);
      review.signature.valueBase64 = signReview(report, current.caseId, review, key.privateKey);
    }
  }
}

function acceptedMatrix(catalog: ProviderCatalog = builtinCatalog): {
  evidence: ProductEvidenceDocument;
  context: ReleaseEvidenceContext;
} {
  const reports: Record<string, LiveAcceptanceReport> = {};
  const digests: Record<string, string> = {};
  const records = releaseTargets.map((target) => {
    const offering = catalog.offerings.find((candidate) => candidate.id === target.offeringId)!;
    const profile = acceptanceProfiles[target.offeringId];
    const qualityGroups = new Set<string>(profile.groups.map((group) => group.id));
    const samples = profile.cases.map((acceptanceCase) =>
      sample(
        acceptanceCase.id,
        acceptanceCase.group,
        acceptanceCase.operations,
        profile.kind === "facts" && qualityGroups.has(acceptanceCase.group) ? 1 : undefined,
        acceptanceCase.expectedTerminalOutcome,
        qualityGroups.has(acceptanceCase.group),
        acceptanceCaseSha256(acceptanceCase),
      ),
    );
    const runId = `live-${target.offeringId.replaceAll(":", "-")}`;
    const reportSha256 = runId
      .padEnd(64, "d")
      .slice(0, 64)
      .replace(/[^a-f0-9]/g, "d");
    const resolvedProviderModelId = `${offering.providerModelId}@2026-08-23`;
    const report: LiveAcceptanceReport = {
      schemaVersion: 1,
      runId,
      offeringId: target.offeringId,
      providerId: offering.providerId,
      requestedProviderModelId: offering.providerModelId,
      resolvedProviderModelId,
      deploymentRegion: "global",
      adapterManifestId: target.adapterManifestId,
      adapterManifestSha256: manifestDigests[target.adapterManifestId],
      acceptanceSuiteId: target.acceptanceSuiteId,
      acceptanceSuiteSha256: "e".repeat(64),
      sdkPackage: target.sdkPackage,
      sdkVersion: target.sdkVersion,
      providerApiRevision: target.providerApiRevision,
      startedAt: "2026-08-23T12:00:00.000Z",
      completedAt: "2026-08-23T13:00:00.000Z",
      estimatedMaximumUsd: "10.00",
      accountedCostUsd: "8.00",
      costBasis: "billing_export",
      samples,
      executionAttestation: {
        executorId: "ci-executor",
        repository: "reedchan7/Toonflow-app",
        workflow: "provider-live-acceptance",
        environment: "acceptance",
        commitSha: "1".repeat(40),
        workflowRunId: `workflow-${runId}`,
        executorManifestSha256: "7".repeat(64),
        signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
      },
    };
    signReport(report);
    reports[runId] = report;
    digests[runId] = reportSha256;
    return {
      offeringId: target.offeringId,
      providerId: offering.providerId,
      requestedProviderModelId: offering.providerModelId,
      resolvedProviderModelId,
      deploymentRegion: "global",
      adapterManifestId: target.adapterManifestId,
      adapterManifestSha256: manifestDigests[target.adapterManifestId],
      acceptanceSuiteId: target.acceptanceSuiteId,
      acceptanceSuiteSha256: "e".repeat(64),
      sdkPackage: target.sdkPackage,
      sdkVersion: target.sdkVersion,
      providerApiRevision: target.providerApiRevision,
      verifiedAt: "2026-08-23T14:00:00.000Z",
      runId,
      reportSha256,
      executionCommitSha: report.executionAttestation.commitSha,
      executionWorkflowRunId: report.executionAttestation.workflowRunId,
      executorManifestSha256: report.executionAttestation.executorManifestSha256,
    };
  });
  return {
    evidence: { schemaVersion: 1, records },
    context: {
      now,
      deploymentRegion: "global",
      adapterManifestDigests: manifestDigests,
      acceptanceSuiteDigests: { "provider-product-acceptance-v1": "e".repeat(64) },
      liveReportDigests: digests,
      liveReports: reports,
      evidenceTrust,
      executorManifestSha256: "7".repeat(64),
      reviewerManifestSha256,
    },
  };
}

describe("release evidence gate", () => {
  test("does not accept product claims self-declared by the catalog", () => {
    const catalog = structuredClone(builtinCatalog) as ProviderCatalog;
    for (const offering of catalog.offerings) {
      offering.support.evidence.push("live_verified", "product_accepted");
      offering.support.verifiedProviderModelId = offering.providerModelId;
    }
    const { context } = acceptedMatrix();
    expect(() =>
      assertReleaseEvidence(catalog, { schemaVersion: 1, records: [] }, context),
    ).toThrow("release.evidence_incomplete");
  });

  test("requires every declared operation independently", () => {
    const catalog = structuredClone(builtinCatalog) as ProviderCatalog;
    catalog.offerings
      .find((offering) => offering.id === "deepseek:v4-pro:official")!
      .operations.find((operation) => operation.operation === "language.stream")!.enabled = false;
    const { evidence, context } = acceptedMatrix(catalog);
    expect(releaseEvidenceIssues(catalog, evidence, context)).toContain(
      "deepseek:v4-pro:official:language.stream:disabled",
    );
  });

  test("pins execution identity while allowing a resolved revision behind a request alias", () => {
    const { evidence, context } = acceptedMatrix();
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toEqual([]);
    const record = evidence.records[0]!;
    context.liveReports[record.runId]!.resolvedProviderModelId = "different-revision";
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:resolved_model_mismatch`,
    );
  });

  test("rejects stale or mismatched artifact, SDK, API, report, region, and cost identity", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records[0]!;
    record.adapterManifestSha256 = "f".repeat(64);
    record.acceptanceSuiteSha256 = "f".repeat(64);
    record.sdkVersion = "0.0.0";
    record.providerApiRevision = "old";
    record.reportSha256 = "e".repeat(64);
    record.deploymentRegion = "CN";
    record.verifiedAt = "2026-01-01T00:00:00.000Z";
    context.liveReports[record.runId]!.accountedCostUsd = "11.00";
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toEqual(
      expect.arrayContaining([
        `${record.offeringId}:manifest_mismatch`,
        `${record.offeringId}:acceptance_suite_mismatch`,
        `${record.offeringId}:sdk_mismatch`,
        `${record.offeringId}:api_revision_mismatch`,
        `${record.offeringId}:live_report_mismatch`,
        `${record.offeringId}:evidence_region_mismatch`,
        `${record.offeringId}:live_report_identity_mismatch`,
        `${record.offeringId}:evidence_stale`,
        `${record.offeringId}:cost_budget_exceeded`,
      ]),
    );
  });

  test("requires every scenario group, operation, deterministic result, and fact threshold", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find(
      (candidate) => candidate.offeringId === "deepseek:v4-flash-vision-exp:official",
    )!;
    const report = context.liveReports[record.runId]!;
    report.samples = report.samples.filter(
      (sample) => !["file-reference", "stream-multimodal"].includes(sample.caseId),
    );
    report.samples[0]!.operations = ["language.generate"];
    for (const current of report.samples) current.factsRatio = 0.8;
    report.samples[0]!.deterministicPassed = false;
    report.samples[0]!.hardFailures = ["visual corruption"];
    const issues = releaseEvidenceIssues(builtinCatalog, evidence, context);
    expect(issues).toEqual(
      expect.arrayContaining([
        `${record.offeringId}:vision:group_samples_missing`,
        `${record.offeringId}:language.stream:operation_coverage_missing`,
        `${record.offeringId}:files.upload:operation_coverage_missing`,
        `${record.offeringId}:deterministic_failed`,
        `${record.offeringId}:hard_failure`,
      ]),
    );
  });

  test("requires two independent blind reviews and adjudicates material disagreement", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find((candidate) => candidate.offeringId === "minimax:h3:fal")!;
    const report = context.liveReports[record.runId]!;
    report.samples[0]!.reviews = report.samples[0]!.reviews.slice(0, 1);
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:text:blind_review_invalid`,
    );

    report.samples[0]!.reviews = [
      {
        reviewerId: "a",
        role: "blind",
        reviewerManifestSha256,
        promptAdherence: 4,
        referenceControlAdherence: 4,
        artifactCorrectness: 4,
        usability: 4,
        hardFailures: [],
        signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
      },
      {
        reviewerId: "b",
        role: "blind",
        reviewerManifestSha256,
        promptAdherence: 1,
        referenceControlAdherence: 4,
        artifactCorrectness: 4,
        usability: 4,
        hardFailures: [],
        signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
      },
    ];
    signReport(report);
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:text:blind_review_invalid`,
    );
    report.samples[0]!.reviews.push({
      reviewerId: "judge",
      role: "adjudicator",
      reviewerManifestSha256,
      promptAdherence: 4,
      referenceControlAdherence: 4,
      artifactCorrectness: 4,
      usability: 4,
      hardFailures: [],
      signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
    });
    signReport(report);
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).not.toContain(
      `${record.offeringId}:text:blind_review_invalid`,
    );
  });

  test("requires distinct public key identities for blind reviewers and the adjudicator", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find((candidate) => candidate.offeringId === "minimax:h3:fal")!;
    const report = context.liveReports[record.runId]!;
    const blindB = context.evidenceTrust.reviewers.find((reviewer) => reviewer.id === "blind-b")!;
    blindB.publicKeyPem = publicPem(reviewerKeys["blind-a"].publicKey).replaceAll("\n", "\r\n");
    for (const current of report.samples) {
      const review = current.reviews.find((candidate) => candidate.reviewerId === "blind-b");
      if (review) {
        review.signature.valueBase64 = signReview(
          report,
          current.caseId,
          review,
          reviewerKeys["blind-a"].privateKey,
        );
      }
    }
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:text:blind_review_invalid`,
    );

    const adjudicationMatrix = acceptedMatrix();
    const adjudicationRecord = adjudicationMatrix.evidence.records.find(
      (candidate) => candidate.offeringId === "minimax:h3:fal",
    )!;
    const adjudicationReport = adjudicationMatrix.context.liveReports[adjudicationRecord.runId]!;
    const disputed = adjudicationReport.samples[0]!;
    disputed.reviews = [
      {
        reviewerId: "a",
        role: "blind",
        reviewerManifestSha256,
        promptAdherence: 4,
        referenceControlAdherence: 4,
        artifactCorrectness: 4,
        usability: 4,
        hardFailures: [],
        signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
      },
      {
        reviewerId: "b",
        role: "blind",
        reviewerManifestSha256,
        promptAdherence: 1,
        referenceControlAdherence: 4,
        artifactCorrectness: 4,
        usability: 4,
        hardFailures: [],
        signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
      },
      {
        reviewerId: "judge",
        role: "adjudicator",
        reviewerManifestSha256,
        promptAdherence: 4,
        referenceControlAdherence: 4,
        artifactCorrectness: 4,
        usability: 4,
        hardFailures: [],
        signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
      },
    ];
    adjudicationMatrix.context.evidenceTrust.reviewers.find(
      (reviewer) => reviewer.id === "judge",
    )!.publicKeyPem = publicPem(reviewerKeys.a.publicKey).replaceAll("\n", "\r\n");
    disputed.reviews[0]!.signature.valueBase64 = signReview(
      adjudicationReport,
      disputed.caseId,
      disputed.reviews[0]!,
      reviewerKeys.a.privateKey,
    );
    disputed.reviews[1]!.signature.valueBase64 = signReview(
      adjudicationReport,
      disputed.caseId,
      disputed.reviews[1]!,
      reviewerKeys.b.privateKey,
    );
    disputed.reviews[2]!.signature.valueBase64 = signReview(
      adjudicationReport,
      disputed.caseId,
      disputed.reviews[2]!,
      reviewerKeys.a.privateKey,
    );
    expect(
      releaseEvidenceIssues(
        builtinCatalog,
        adjudicationMatrix.evidence,
        adjudicationMatrix.context,
      ),
    ).toContain(`${adjudicationRecord.offeringId}:text:blind_review_invalid`);
  });

  test("rejects a signed reviewer-observed hard failure even when scores pass", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find((candidate) => candidate.offeringId === "minimax:h3:fal")!;
    const report = context.liveReports[record.runId]!;
    report.samples[0]!.reviews[0]!.hardFailures.push("required reference identity replaced");
    signReport(report);
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toEqual(
      expect.arrayContaining([
        `${record.offeringId}:hard_failure`,
        `${record.offeringId}:text:blind_review_invalid`,
      ]),
    );
  });

  test("requires an auditable contiguous retry trace", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find((candidate) => candidate.offeringId === "minimax:h3:fal")!;
    context.liveReports[record.runId]!.samples[0]!.attempts = [
      { attempt: 1, outcome: "failed", providerRequestId: "failed-without-error" },
      { attempt: 3, outcome: "succeeded", providerRequestId: "retry-without-reason" },
    ];
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:attempt_trace_incomplete`,
    );
  });

  test("rejects untrusted execution and reviewer identities", () => {
    const { evidence, context } = acceptedMatrix();
    context.evidenceTrust = { schemaVersion: 1, executors: [], reviewers: [] };
    const issues = releaseEvidenceIssues(builtinCatalog, evidence, context);
    expect(issues).toContain("deepseek:v4-pro:official:execution_attestation_invalid");
    expect(issues).toContain("minimax:h3:fal:text:blind_review_invalid");
  });

  test("binds every execution provenance field into the executor signature", () => {
    const { evidence, context } = acceptedMatrix();
    const report = context.liveReports[evidence.records[0]!.runId]!;
    for (const field of [
      "executorId",
      "repository",
      "workflow",
      "environment",
      "commitSha",
      "workflowRunId",
      "executorManifestSha256",
    ] as const) {
      const forged = structuredClone(report);
      if (field === "commitSha") forged.executionAttestation[field] = "2".repeat(40);
      else if (field === "executorManifestSha256") {
        forged.executionAttestation[field] = "2".repeat(64);
      } else forged.executionAttestation[field] = `${forged.executionAttestation[field]}-forged`;
      expect(verifyExecutionAttestation(forged, context.evidenceTrust)).toBe(false);
    }
  });

  test("rejects evidence produced by a different live executor source manifest", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records[0]!;
    record.executorManifestSha256 = "8".repeat(64);
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:executor_manifest_mismatch`,
    );
  });

  test("rejects reviews produced by a different reviewer source manifest", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find((candidate) => candidate.offeringId === "minimax:h3:fal")!;
    context.liveReports[record.runId]!.samples[0]!.reviews[0]!.reviewerManifestSha256 = "8".repeat(
      64,
    );
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:text:blind_review_invalid`,
    );
  });

  test("binds every report sample to the frozen input and assertion case digest", () => {
    const { evidence, context } = acceptedMatrix();
    const record = evidence.records.find(
      (candidate) => candidate.offeringId === "google:gemini-3.7-flash:official",
    )!;
    context.liveReports[record.runId]!.samples[0]!.caseSha256 = "f".repeat(64);
    expect(releaseEvidenceIssues(builtinCatalog, evidence, context)).toContain(
      `${record.offeringId}:tool-call-weather:case_contract_mismatch`,
    );
  });
});
