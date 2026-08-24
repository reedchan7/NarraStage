import { createHash, createPrivateKey } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evidenceTrustDocumentSchema,
  liveAcceptanceReportSchema,
  reviewDecisionDocumentSchema,
  reviewerPublicKeyFingerprint,
  type BlindReview,
  type EvidenceTrustDocument,
  type LiveAcceptanceReport,
  type ReviewDecisionDocument,
} from "@/release/evidence";
import {
  attachSignedReview,
  executionDigest,
  verifyExecutionAttestation,
  verifyReviewAttestation,
} from "@/release/attestation";
import { liveReviewerManifestDigest } from "@/release/manifestDigests";
import { inspectMediaMetadata } from "@/assets/metadata";
import { acceptanceProfiles } from "@/release/acceptanceSuite";

function requiresAdjudication(first: BlindReview, second: BlindReview): boolean {
  return (
    Math.abs(first.promptAdherence - second.promptAdherence) > 1 ||
    Math.abs(first.referenceControlAdherence - second.referenceControlAdherence) > 1 ||
    Math.abs(first.artifactCorrectness - second.artifactCorrectness) > 1 ||
    Math.abs(first.usability - second.usability) > 1
  );
}

function assertUnique(values: readonly string[], errorCode: string): void {
  if (new Set(values).size !== values.length) throw new Error(errorCode);
}

function assertExactCaseIds(actual: readonly string[], expected: readonly string[]): void {
  assertUnique(actual, "live.review_case_duplicate");
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (actualSorted.join("\0") !== expectedSorted.join("\0")) {
    throw new Error("live.review_case_set_mismatch");
  }
}

function assertExistingReviews(
  report: LiveAcceptanceReport,
  trust: EvidenceTrustDocument,
  reviewerManifestSha256: string,
): void {
  const blindCoverage = new Map<string, Set<string>>();
  for (const sample of report.samples) {
    assertUnique(
      sample.reviews.map((review) => `${review.reviewerId}\0${review.role}`),
      "live.review_duplicate_signer",
    );
    assertUnique(
      sample.reviews.map(
        (review) =>
          reviewerPublicKeyFingerprint(trust, review.reviewerId) ?? `invalid:${review.reviewerId}`,
      ),
      "live.review_duplicate_signing_key",
    );
    for (const review of sample.reviews) {
      if (review.reviewerManifestSha256 !== reviewerManifestSha256) {
        throw new Error("live.review_manifest_mismatch");
      }
      if (!verifyReviewAttestation(report, sample.caseId, review, trust)) {
        throw new Error("live.review_attestation_invalid");
      }
      if (review.role === "blind") {
        const cases = blindCoverage.get(review.reviewerId) ?? new Set<string>();
        cases.add(sample.caseId);
        blindCoverage.set(review.reviewerId, cases);
      }
    }
  }
  for (const cases of blindCoverage.values()) {
    assertExactCaseIds(
      [...cases],
      report.samples.map((sample) => sample.caseId),
    );
  }
}

function expectedReviewCaseIds(
  report: LiveAcceptanceReport,
  decisions: ReviewDecisionDocument,
  trust: EvidenceTrustDocument,
): string[] {
  const decisionKeyFingerprint = reviewerPublicKeyFingerprint(trust, decisions.reviewerId);
  if (!decisionKeyFingerprint) throw new Error("live.review_reviewer_untrusted");
  if (decisions.role === "blind") {
    if (
      report.samples.some(
        (sample) =>
          sample.reviews.filter((review) => review.role === "blind").length >= 2 ||
          sample.reviews.some(
            (review) =>
              review.reviewerId === decisions.reviewerId ||
              reviewerPublicKeyFingerprint(trust, review.reviewerId) === decisionKeyFingerprint,
          ),
      )
    ) {
      throw new Error("live.review_duplicate_signer");
    }
    return report.samples.map((sample) => sample.caseId);
  }

  const disputed = report.samples
    .filter((sample) => {
      const blind = sample.reviews.filter((review) => review.role === "blind");
      if (blind.length !== 2 || blind[0]!.reviewerId === blind[1]!.reviewerId) {
        throw new Error("live.review_adjudication_not_ready");
      }
      if (
        sample.reviews.some(
          (review) =>
            review.role === "adjudicator" ||
            review.reviewerId === decisions.reviewerId ||
            reviewerPublicKeyFingerprint(trust, review.reviewerId) === decisionKeyFingerprint,
        )
      ) {
        throw new Error("live.review_duplicate_signer");
      }
      return requiresAdjudication(blind[0]!, blind[1]!);
    })
    .map((sample) => sample.caseId);
  if (disputed.length === 0) throw new Error("live.review_adjudication_not_required");
  return disputed;
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

async function verifyReviewArtifacts(
  artifactDirectory: string,
  report: LiveAcceptanceReport,
  caseIds: readonly string[],
): Promise<void> {
  const artifactRoot = await realpath(artifactDirectory);
  const seenPaths = new Set<string>();
  for (const sample of report.samples.filter((candidate) => caseIds.includes(candidate.caseId))) {
    for (const artifact of sample.artifacts) {
      const segments = artifact.reviewPath.split("/");
      if (
        path.posix.isAbsolute(artifact.reviewPath) ||
        segments.some((segment) => segment === "" || segment === "." || segment === "..")
      ) {
        throw new Error(`live.review_artifact_path_invalid:${artifact.reviewPath}`);
      }
      const unresolved = path.resolve(artifactRoot, ...segments);
      if (!isContained(artifactRoot, unresolved)) {
        throw new Error(`live.review_artifact_path_escape:${artifact.reviewPath}`);
      }
      const resolved = await realpath(unresolved).catch(() => {
        throw new Error(`live.review_artifact_missing:${artifact.reviewPath}`);
      });
      if (!isContained(artifactRoot, resolved)) {
        throw new Error(`live.review_artifact_path_escape:${artifact.reviewPath}`);
      }
      const stat = await lstat(resolved);
      if (!stat.isFile()) throw new Error(`live.review_artifact_not_file:${artifact.reviewPath}`);
      if (seenPaths.has(resolved)) {
        throw new Error(`live.review_artifact_path_duplicate:${artifact.reviewPath}`);
      }
      seenPaths.add(resolved);
      const bytes = await readFile(resolved);
      if (bytes.byteLength !== artifact.byteLength) {
        throw new Error(`live.review_artifact_length_mismatch:${artifact.reviewPath}`);
      }
      if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
        throw new Error(`live.review_artifact_digest_mismatch:${artifact.reviewPath}`);
      }
      if (["image", "video", "audio"].includes(artifact.kind)) {
        const inspected = inspectMediaMetadata(bytes);
        if (
          !inspected ||
          inspected.kind !== artifact.kind ||
          inspected.mimeType !== artifact.mediaType
        ) {
          throw new Error(`live.review_artifact_media_mismatch:${artifact.reviewPath}`);
        }
        if (
          inspected.width !== artifact.width ||
          inspected.height !== artifact.height ||
          inspected.durationSeconds !== artifact.durationSeconds
        ) {
          throw new Error(`live.review_artifact_metadata_mismatch:${artifact.reviewPath}`);
        }
      }
    }
  }
}

export interface ReviewLiveReportOptions {
  repositoryRoot: string;
  report: LiveAcceptanceReport;
  decisions: ReviewDecisionDocument;
  trust: EvidenceTrustDocument;
  artifactDirectory: string;
  reviewerPrivateKeyPem: string;
}

export async function prepareLiveReviewPacket(options: {
  repositoryRoot: string;
  report: LiveAcceptanceReport;
  trust: EvidenceTrustDocument;
  artifactDirectory: string;
}) {
  const report = liveAcceptanceReportSchema.parse(structuredClone(options.report));
  const trust = evidenceTrustDocumentSchema.parse(options.trust);
  if (!verifyExecutionAttestation(report, trust)) {
    throw new Error("live.review_execution_attestation_invalid");
  }
  const reviewerManifestSha256 = await liveReviewerManifestDigest(options.repositoryRoot);
  assertExistingReviews(report, trust, reviewerManifestSha256);
  const caseIds = report.samples.map((sample) => sample.caseId);
  await verifyReviewArtifacts(options.artifactDirectory, report, caseIds);
  const profile = acceptanceProfiles[report.offeringId];
  if (!profile) throw new Error("live.review_acceptance_profile_missing");
  return {
    schemaVersion: 1 as const,
    runId: report.runId,
    offeringId: report.offeringId,
    resolvedProviderModelId: report.resolvedProviderModelId,
    executionDigest: executionDigest(report),
    reviewerManifestSha256,
    cases: report.samples.map((sample) => {
      const acceptanceCase = profile.cases.find((candidate) => candidate.id === sample.caseId);
      if (!acceptanceCase) throw new Error(`live.review_case_unregistered:${sample.caseId}`);
      return {
        caseId: sample.caseId,
        group: sample.group,
        prompt: acceptanceCase.input.prompt,
        expectedFacts: acceptanceCase.expectedFacts,
        deterministicAssertions: acceptanceCase.deterministicAssertions,
        hardFailureDefinitions: acceptanceCase.hardFailureDefinitions,
        artifacts: sample.artifacts,
        existingReviews: sample.reviews.map((review) => ({
          reviewerId: review.reviewerId,
          role: review.role,
        })),
      };
    }),
  };
}

export async function reviewLiveReport(
  options: ReviewLiveReportOptions,
): Promise<LiveAcceptanceReport> {
  const report = liveAcceptanceReportSchema.parse(structuredClone(options.report));
  const decisions = reviewDecisionDocumentSchema.parse(options.decisions);
  const trust = evidenceTrustDocumentSchema.parse(options.trust);
  if (decisions.runId !== report.runId) throw new Error("live.review_run_mismatch");
  if (!verifyExecutionAttestation(report, trust)) {
    throw new Error("live.review_execution_attestation_invalid");
  }
  const trustedReviewer = trust.reviewers.find((reviewer) => reviewer.id === decisions.reviewerId);
  if (!trustedReviewer) throw new Error("live.review_reviewer_untrusted");

  const reviewerManifestSha256 = await liveReviewerManifestDigest(options.repositoryRoot);
  assertExistingReviews(report, trust, reviewerManifestSha256);
  const expectedCaseIds = expectedReviewCaseIds(report, decisions, trust);
  assertExactCaseIds(
    decisions.cases.map((decision) => decision.caseId),
    expectedCaseIds,
  );
  const profile = acceptanceProfiles[report.offeringId];
  if (!profile) throw new Error("live.review_acceptance_profile_missing");
  for (const decision of decisions.cases) {
    const acceptanceCase = profile.cases.find((candidate) => candidate.id === decision.caseId);
    if (
      !acceptanceCase ||
      decision.hardFailures.some(
        (hardFailure) => !acceptanceCase.hardFailureDefinitions.includes(hardFailure),
      )
    ) {
      throw new Error(`live.review_hard_failure_unregistered:${decision.caseId}`);
    }
  }
  await verifyReviewArtifacts(options.artifactDirectory, report, expectedCaseIds);

  const reviewerPrivateKey = createPrivateKey(
    options.reviewerPrivateKeyPem.replaceAll("\\n", "\n"),
  );
  for (const decision of decisions.cases) {
    attachSignedReview(
      report,
      decision.caseId,
      {
        reviewerId: decisions.reviewerId,
        role: decisions.role,
        reviewerManifestSha256,
        promptAdherence: decision.promptAdherence,
        referenceControlAdherence: decision.referenceControlAdherence,
        artifactCorrectness: decision.artifactCorrectness,
        usability: decision.usability,
        hardFailures: decision.hardFailures,
      },
      reviewerPrivateKey,
    );
    const review = report.samples
      .find((sample) => sample.caseId === decision.caseId)!
      .reviews.at(-1)!;
    if (!verifyReviewAttestation(report, decision.caseId, review, trust)) {
      throw new Error("live.review_private_key_mismatch");
    }
  }
  return liveAcceptanceReportSchema.parse(report);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`live.review_cli_argument_required:${name}`);
  return value;
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(import.meta.dir, "..");
  const inputPath = path.resolve(requiredArgument("--report"));
  const artifactDirectory = path.resolve(requiredArgument("--artifact-dir"));
  const trustPath = path.resolve(requiredArgument("--trust"));
  const outputPath = path.resolve(requiredArgument("--output"));
  if (inputPath === outputPath) throw new Error("live.review_output_must_be_new");

  const report = liveAcceptanceReportSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
  const trust = evidenceTrustDocumentSchema.parse(JSON.parse(await readFile(trustPath, "utf8")));
  if (process.argv.includes("--prepare")) {
    if (path.basename(outputPath) !== `${report.runId}.review-packet.json`) {
      throw new Error("live.review_packet_output_filename_mismatch");
    }
    const packet = await prepareLiveReviewPacket({
      repositoryRoot,
      report,
      trust,
      artifactDirectory,
    });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({ runId: report.runId, packet: outputPath })}\n`);
    return;
  }

  const decisionsPath = path.resolve(requiredArgument("--decisions"));
  const reviewerPrivateKeyPem = process.env.NARRASTAGE_REVIEWER_PRIVATE_KEY_PEM;
  if (!reviewerPrivateKeyPem?.trim()) {
    throw new Error("live.review_environment_required:NARRASTAGE_REVIEWER_PRIVATE_KEY_PEM");
  }
  if (path.basename(outputPath) !== `${report.runId}.json`) {
    throw new Error("live.review_output_filename_mismatch");
  }
  const decisions = reviewDecisionDocumentSchema.parse(
    JSON.parse(await readFile(decisionsPath, "utf8")),
  );
  const reviewed = await reviewLiveReport({
    repositoryRoot,
    report,
    decisions,
    trust,
    artifactDirectory,
    reviewerPrivateKeyPem,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(reviewed, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `${JSON.stringify({ runId: reviewed.runId, reviewerId: decisions.reviewerId, report: outputPath })}\n`,
  );
}

if (import.meta.main) {
  await main();
}
