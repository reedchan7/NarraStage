import type { ProviderCatalog } from "@/providers/domain/models";
import type {
  BlindReview,
  LiveAcceptanceReport,
  LiveAcceptanceSample,
  ProductEvidenceDocument,
  EvidenceTrustDocument,
} from "@/release/evidence";
import { reviewerPublicKeyFingerprint } from "@/release/evidence";
import { verifyExecutionAttestation, verifyReviewAttestation } from "@/release/attestation";
import {
  acceptanceCaseSha256,
  acceptanceProfiles,
  type AcceptanceProfile,
} from "@/release/acceptanceSuite";
import { releaseTargets } from "@/release/supportMatrix";

const maximumEvidenceAgeMs = 30 * 24 * 60 * 60 * 1_000;
const maximumClockSkewMs = 5 * 60 * 1_000;

export interface ReleaseEvidenceContext {
  now: number;
  deploymentRegion: string;
  adapterManifestDigests: Readonly<Record<string, string>>;
  acceptanceSuiteDigests: Readonly<Record<string, string>>;
  liveReportDigests: Readonly<Record<string, string>>;
  liveReports: Readonly<Record<string, LiveAcceptanceReport>>;
  evidenceTrust: EvidenceTrustDocument;
  executorManifestSha256: string;
  reviewerManifestSha256: string;
}

function reviewScore(review: BlindReview): number {
  return (
    (review.promptAdherence +
      review.referenceControlAdherence +
      review.artifactCorrectness +
      review.usability) /
    4
  );
}

function requiresAdjudication(first: BlindReview, second: BlindReview): boolean {
  return (
    Math.abs(first.promptAdherence - second.promptAdherence) > 1 ||
    Math.abs(first.referenceControlAdherence - second.referenceControlAdherence) > 1 ||
    Math.abs(first.artifactCorrectness - second.artifactCorrectness) > 1 ||
    Math.abs(first.usability - second.usability) > 1
  );
}

function sampleQualityScore(
  report: LiveAcceptanceReport,
  sample: LiveAcceptanceSample,
  trust: EvidenceTrustDocument,
  reviewerManifestSha256: string,
): number | undefined {
  const blind = sample.reviews.filter((review) => review.role === "blind");
  const blindKeyFingerprints = blind.map((review) =>
    reviewerPublicKeyFingerprint(trust, review.reviewerId),
  );
  if (
    blind.length !== 2 ||
    blind[0]!.reviewerId === blind[1]!.reviewerId ||
    blindKeyFingerprints.some((fingerprint) => !fingerprint) ||
    new Set(blindKeyFingerprints).size !== 2 ||
    blind.some((review) => review.hardFailures.length > 0) ||
    blind.some((review) => review.reviewerManifestSha256 !== reviewerManifestSha256) ||
    blind.some((review) => !verifyReviewAttestation(report, sample.caseId, review, trust))
  ) {
    return undefined;
  }
  const adjudicators = sample.reviews.filter((review) => review.role === "adjudicator");
  const disagreement = requiresAdjudication(blind[0]!, blind[1]!);
  if (disagreement) {
    const adjudicatorKeyFingerprint = reviewerPublicKeyFingerprint(
      trust,
      adjudicators[0]?.reviewerId ?? "",
    );
    if (
      adjudicators.length !== 1 ||
      blind.some((review) => review.reviewerId === adjudicators[0]!.reviewerId) ||
      !adjudicatorKeyFingerprint ||
      blindKeyFingerprints.includes(adjudicatorKeyFingerprint) ||
      adjudicators[0]!.hardFailures.length > 0 ||
      adjudicators[0]!.reviewerManifestSha256 !== reviewerManifestSha256 ||
      !verifyReviewAttestation(report, sample.caseId, adjudicators[0]!, trust)
    ) {
      return undefined;
    }
    return reviewScore(adjudicators[0]!);
  }
  if (adjudicators.length !== 0) return undefined;
  return (reviewScore(blind[0]!) + reviewScore(blind[1]!)) / 2;
}

function reportAcceptanceIssues(
  offeringId: string,
  report: LiveAcceptanceReport,
  requiredOperations: readonly string[],
  profile: AcceptanceProfile,
  trust: EvidenceTrustDocument,
  reviewerManifestSha256: string,
): string[] {
  const issues: string[] = [];
  const expectedCases = new Map(profile.cases.map((candidate) => [candidate.id, candidate]));
  const caseIds = new Set<string>();
  for (const sample of report.samples) {
    if (caseIds.has(sample.caseId)) issues.push(`${offeringId}:case_id_duplicate`);
    caseIds.add(sample.caseId);
    const expectedCase = expectedCases.get(sample.caseId);
    if (!expectedCase) {
      issues.push(`${offeringId}:case_unregistered`);
      continue;
    }
    if (
      sample.caseSha256 !== acceptanceCaseSha256(expectedCase) ||
      sample.group !== expectedCase.group ||
      [...sample.operations].sort().join("\0") !== [...expectedCase.operations].sort().join("\0")
    ) {
      issues.push(`${offeringId}:${sample.caseId}:case_contract_mismatch`);
    }
    if (!sample.deterministicPassed) issues.push(`${offeringId}:deterministic_failed`);
    if (
      sample.artifacts.filter((artifact) => artifact.purpose === "normalized_request").length !== 1
    ) {
      issues.push(`${offeringId}:${sample.caseId}:request_evidence_missing`);
    }
    const terminalPurpose =
      expectedCase.expectedTerminalOutcome === "cancelled" ? "protocol" : "output";
    if (!sample.artifacts.some((artifact) => artifact.purpose === terminalPurpose)) {
      issues.push(`${offeringId}:${sample.caseId}:terminal_artifact_missing`);
    }
    if (sample.hardFailures.length > 0) issues.push(`${offeringId}:hard_failure`);
    if (
      sample.hardFailures.some(
        (hardFailure) => !expectedCase.hardFailureDefinitions.includes(hardFailure),
      ) ||
      sample.reviews.some((review) =>
        review.hardFailures.some(
          (hardFailure) => !expectedCase.hardFailureDefinitions.includes(hardFailure),
        ),
      )
    ) {
      issues.push(`${offeringId}:${sample.caseId}:hard_failure_unregistered`);
    }
    if (sample.reviews.some((review) => review.hardFailures.length > 0)) {
      issues.push(`${offeringId}:hard_failure`);
    }
    if (
      sample.attempts.some(
        (attempt, index) =>
          attempt.attempt !== index + 1 ||
          !attempt.providerRequestId ||
          (attempt.outcome === "failed" && !attempt.errorCode) ||
          (index > 0 && !attempt.rerunReason),
      )
    ) {
      issues.push(`${offeringId}:attempt_trace_incomplete`);
    }
    const lastAttempt = sample.attempts.at(-1);
    if (
      !lastAttempt ||
      lastAttempt.outcome !== expectedCase.expectedTerminalOutcome ||
      !lastAttempt.providerRequestId
    ) {
      issues.push(`${offeringId}:attempt_trace_incomplete`);
    }
  }
  for (const expectedCase of profile.cases) {
    if (!caseIds.has(expectedCase.id)) issues.push(`${offeringId}:${expectedCase.id}:case_missing`);
  }

  const coveredOperations = new Set(report.samples.flatMap((sample) => sample.operations));
  for (const operation of requiredOperations) {
    if (!coveredOperations.has(operation as never)) {
      issues.push(`${offeringId}:${operation}:operation_coverage_missing`);
    }
  }

  if (profile.kind === "facts") {
    for (const group of profile.groups) {
      const samples = report.samples.filter((sample) => sample.group === group.id);
      if (
        samples.length !== group.caseIds.length ||
        group.caseIds.some((caseId) => !samples.some((sample) => sample.caseId === caseId))
      ) {
        issues.push(`${offeringId}:${group.id}:group_samples_missing`);
        continue;
      }
      const ratios = samples.map((sample) => sample.factsRatio);
      if (
        ratios.some((ratio) => ratio === undefined) ||
        ratios.reduce<number>((sum, ratio) => sum + (ratio ?? 0), 0) / ratios.length <
          profile.minimumFactsRatio
      ) {
        issues.push(`${offeringId}:${group.id}:facts_ratio_failed`);
      }
    }
  } else {
    for (const group of profile.groups) {
      const samples = report.samples.filter((sample) => sample.group === group.id);
      if (
        samples.length !== group.caseIds.length ||
        group.caseIds.some((caseId) => !samples.some((sample) => sample.caseId === caseId))
      ) {
        issues.push(`${offeringId}:${group.id}:group_samples_missing`);
        continue;
      }
      const scores = samples.map((sample) =>
        sampleQualityScore(report, sample, trust, reviewerManifestSha256),
      );
      if (scores.some((score) => score === undefined)) {
        issues.push(`${offeringId}:${group.id}:blind_review_invalid`);
        continue;
      }
      if (scores.filter((score) => score! >= profile.minimumScore).length < group.minimumAccepted) {
        issues.push(`${offeringId}:${group.id}:quality_threshold_failed`);
      }
    }
  }
  return issues;
}

export function releaseEvidenceIssues(
  catalog: ProviderCatalog,
  evidence: ProductEvidenceDocument,
  context: ReleaseEvidenceContext,
): string[] {
  const issues: string[] = [];
  for (const target of releaseTargets) {
    const offering = catalog.offerings.find((candidate) => candidate.id === target.offeringId);
    if (!offering) {
      issues.push(`${target.offeringId}:missing`);
      continue;
    }
    if (offering.support.implementation !== "implemented") {
      issues.push(`${target.offeringId}:disabled`);
    }
    if (!target.deploymentRegions.some((region) => region === context.deploymentRegion)) {
      issues.push(`${target.offeringId}:region_unsupported`);
    }
    for (const operation of target.requiredOperations) {
      if (
        !offering.operations.some(
          (candidate) => candidate.operation === operation && candidate.enabled,
        )
      ) {
        issues.push(`${target.offeringId}:${operation}:disabled`);
      }
    }

    const matching = evidence.records.filter((record) => record.offeringId === target.offeringId);
    if (matching.length !== 1) {
      issues.push(
        `${target.offeringId}:${matching.length === 0 ? "evidence_missing" : "evidence_ambiguous"}`,
      );
      continue;
    }
    const record = matching[0]!;
    if (record.providerId !== offering.providerId)
      issues.push(`${target.offeringId}:provider_mismatch`);
    if (record.requestedProviderModelId !== offering.providerModelId) {
      issues.push(`${target.offeringId}:request_model_mismatch`);
    }
    if (record.deploymentRegion !== context.deploymentRegion) {
      issues.push(`${target.offeringId}:evidence_region_mismatch`);
    }
    if (
      record.adapterManifestId !== target.adapterManifestId ||
      record.adapterManifestSha256 !== context.adapterManifestDigests[target.adapterManifestId]
    ) {
      issues.push(`${target.offeringId}:manifest_mismatch`);
    }
    if (
      record.acceptanceSuiteId !== target.acceptanceSuiteId ||
      record.acceptanceSuiteSha256 !== context.acceptanceSuiteDigests[target.acceptanceSuiteId]
    ) {
      issues.push(`${target.offeringId}:acceptance_suite_mismatch`);
    }
    if (record.sdkPackage !== target.sdkPackage || record.sdkVersion !== target.sdkVersion) {
      issues.push(`${target.offeringId}:sdk_mismatch`);
    }
    if (record.providerApiRevision !== target.providerApiRevision) {
      issues.push(`${target.offeringId}:api_revision_mismatch`);
    }
    if (context.liveReportDigests[record.runId] !== record.reportSha256) {
      issues.push(`${target.offeringId}:live_report_mismatch`);
    }
    const report = context.liveReports[record.runId];
    if (!report) {
      issues.push(`${target.offeringId}:live_report_missing`);
      continue;
    }
    if (!verifyExecutionAttestation(report, context.evidenceTrust)) {
      issues.push(`${target.offeringId}:execution_attestation_invalid`);
    }
    if (
      report.executionAttestation.executorManifestSha256 !== context.executorManifestSha256 ||
      record.executorManifestSha256 !== context.executorManifestSha256
    ) {
      issues.push(`${target.offeringId}:executor_manifest_mismatch`);
    }
    if (
      report.runId !== record.runId ||
      report.offeringId !== record.offeringId ||
      report.providerId !== record.providerId ||
      report.requestedProviderModelId !== record.requestedProviderModelId ||
      report.deploymentRegion !== record.deploymentRegion ||
      report.adapterManifestId !== record.adapterManifestId ||
      report.adapterManifestSha256 !== record.adapterManifestSha256 ||
      report.acceptanceSuiteId !== record.acceptanceSuiteId ||
      report.acceptanceSuiteSha256 !== record.acceptanceSuiteSha256 ||
      report.sdkPackage !== record.sdkPackage ||
      report.sdkVersion !== record.sdkVersion ||
      report.providerApiRevision !== record.providerApiRevision ||
      report.executionAttestation.commitSha !== record.executionCommitSha ||
      report.executionAttestation.workflowRunId !== record.executionWorkflowRunId ||
      report.executionAttestation.executorManifestSha256 !== record.executorManifestSha256
    ) {
      issues.push(`${target.offeringId}:live_report_identity_mismatch`);
    }
    if (record.resolvedProviderModelId !== report.resolvedProviderModelId) {
      issues.push(`${target.offeringId}:resolved_model_mismatch`);
    }

    const verifiedAt = Date.parse(record.verifiedAt);
    const startedAt = Date.parse(report.startedAt);
    const completedAt = Date.parse(report.completedAt);
    if (
      !Number.isFinite(verifiedAt) ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(completedAt) ||
      startedAt > completedAt ||
      completedAt > verifiedAt ||
      verifiedAt > context.now + maximumClockSkewMs ||
      context.now - verifiedAt > maximumEvidenceAgeMs ||
      context.now - completedAt > maximumEvidenceAgeMs
    ) {
      issues.push(`${target.offeringId}:evidence_stale`);
    }
    if (Number(report.accountedCostUsd) > Number(report.estimatedMaximumUsd)) {
      issues.push(`${target.offeringId}:cost_budget_exceeded`);
    }
    issues.push(
      ...reportAcceptanceIssues(
        target.offeringId,
        report,
        target.requiredOperations,
        acceptanceProfiles[target.offeringId],
        context.evidenceTrust,
        context.reviewerManifestSha256,
      ),
    );
  }
  return [...new Set(issues)];
}

export function assertReleaseEvidence(
  catalog: ProviderCatalog,
  evidence: ProductEvidenceDocument,
  context: ReleaseEvidenceContext,
): void {
  const issues = releaseEvidenceIssues(catalog, evidence, context);
  if (issues.length > 0) {
    throw new Error(`release.evidence_incomplete\n${issues.join("\n")}`);
  }
}
