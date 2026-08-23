import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type { BlindReview, EvidenceTrustDocument, LiveAcceptanceReport } from "@/release/evidence";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function executionPayload(report: LiveAcceptanceReport) {
  const { signature: _signature, ...attestationSubject } = report.executionAttestation;
  return {
    ...report,
    samples: report.samples.map((sample) => ({ ...sample, reviews: [] })),
    executionAttestation: attestationSubject,
  };
}

export function executionDigest(report: LiveAcceptanceReport): string {
  return createHash("sha256")
    .update(canonicalJson(executionPayload(report)))
    .digest("hex");
}

function reviewPayload(report: LiveAcceptanceReport, caseId: string, review: BlindReview) {
  const { signature: _signature, ...scores } = review;
  return {
    runId: report.runId,
    offeringId: report.offeringId,
    caseId,
    executionDigest: executionDigest(report),
    review: scores,
  };
}

export function signExecution(report: LiveAcceptanceReport, privateKey: KeyObject): string {
  return sign(null, Buffer.from(executionDigest(report), "hex"), privateKey).toString("base64");
}

export function signReview(
  report: LiveAcceptanceReport,
  caseId: string,
  review: BlindReview,
  privateKey: KeyObject,
): string {
  return sign(
    null,
    Buffer.from(canonicalJson(reviewPayload(report, caseId, review))),
    privateKey,
  ).toString("base64");
}

export function attachSignedReview(
  report: LiveAcceptanceReport,
  caseId: string,
  review: Omit<BlindReview, "signature">,
  reviewerPrivateKey: KeyObject,
): void {
  const sample = report.samples.find((candidate) => candidate.caseId === caseId);
  if (!sample) throw new Error(`live.review_case_missing:${caseId}`);
  const signed: BlindReview = {
    ...review,
    signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
  };
  signed.signature.valueBase64 = signReview(report, caseId, signed, reviewerPrivateKey);
  sample.reviews.push(signed);
}

export function verifyExecutionAttestation(
  report: LiveAcceptanceReport,
  trust: EvidenceTrustDocument,
): boolean {
  const attestation = report.executionAttestation;
  const signer = trust.executors.find((candidate) => candidate.id === attestation.executorId);
  if (
    !signer ||
    signer.repository !== attestation.repository ||
    signer.workflow !== attestation.workflow ||
    !signer.environments.includes(attestation.environment)
  ) {
    return false;
  }
  try {
    return verify(
      null,
      Buffer.from(executionDigest(report), "hex"),
      createPublicKey(signer.publicKeyPem),
      Buffer.from(attestation.signature.valueBase64, "base64"),
    );
  } catch {
    return false;
  }
}

export function verifyReviewAttestation(
  report: LiveAcceptanceReport,
  caseId: string,
  review: BlindReview,
  trust: EvidenceTrustDocument,
): boolean {
  const signer = trust.reviewers.find((candidate) => candidate.id === review.reviewerId);
  if (!signer) return false;
  try {
    return verify(
      null,
      Buffer.from(canonicalJson(reviewPayload(report, caseId, review))),
      createPublicKey(signer.publicKeyPem),
      Buffer.from(review.signature.valueBase64, "base64"),
    );
  } catch {
    return false;
  }
}
