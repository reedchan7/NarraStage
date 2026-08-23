import { createHash, createPublicKey } from "node:crypto";
import { z } from "zod";
import { offeringIdSchema, providerIdSchema } from "@/providers/domain/ids";
import { operationSchema } from "@/providers/domain/operations";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const scoreSchema = z.number().int().min(0).max(4);
const signatureSchema = z
  .object({ algorithm: z.literal("ed25519"), valueBase64: z.string().min(40) })
  .strict();

export function publicKeySpkiSha256(publicKeyPem: string): string | undefined {
  try {
    const spki = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
    return createHash("sha256").update(spki).digest("hex");
  } catch {
    return undefined;
  }
}

export function reviewerPublicKeyFingerprint(
  trust: { reviewers: readonly { id: string; publicKeyPem: string }[] },
  reviewerId: string,
): string | undefined {
  const matches = trust.reviewers.filter((reviewer) => reviewer.id === reviewerId);
  return matches.length === 1 ? publicKeySpkiSha256(matches[0]!.publicKeyPem) : undefined;
}

export const blindReviewSchema = z
  .object({
    reviewerId: z.string().min(1),
    role: z.enum(["blind", "adjudicator"]),
    reviewerManifestSha256: sha256Schema,
    promptAdherence: scoreSchema,
    referenceControlAdherence: scoreSchema,
    artifactCorrectness: scoreSchema,
    usability: scoreSchema,
    hardFailures: z.array(z.string().min(1)),
    signature: signatureSchema,
  })
  .strict();

export const reviewDecisionDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    reviewerId: z.string().min(1),
    role: z.enum(["blind", "adjudicator"]),
    cases: z.array(
      z
        .object({
          caseId: z.string().min(1),
          promptAdherence: scoreSchema,
          referenceControlAdherence: scoreSchema,
          artifactCorrectness: scoreSchema,
          usability: scoreSchema,
          hardFailures: z.array(z.string().min(1)),
        })
        .strict(),
    ),
  })
  .strict();

export const liveAcceptanceSampleSchema = z
  .object({
    caseId: z.string().min(1),
    caseSha256: sha256Schema,
    group: z.string().min(1),
    operations: z.array(operationSchema).min(1),
    seed: z.string().optional(),
    deterministicPassed: z.boolean(),
    factsRatio: z.number().min(0).max(1).optional(),
    hardFailures: z.array(z.string().min(1)),
    artifacts: z
      .array(
        z
          .object({
            kind: z.enum(["text", "image", "video", "audio", "file"]),
            purpose: z.enum(["output", "normalized_request", "protocol"]),
            mediaType: z.string().min(1),
            byteLength: z.number().int().positive(),
            sha256: sha256Schema,
            reviewPath: z.string().regex(/^[A-Za-z0-9._/-]+$/),
            width: z.number().int().positive().optional(),
            height: z.number().int().positive().optional(),
            durationSeconds: z.number().positive().optional(),
          })
          .strict(),
      )
      .min(1),
    attempts: z
      .array(
        z
          .object({
            attempt: z.number().int().positive(),
            outcome: z.enum(["succeeded", "failed", "cancelled"]),
            providerRequestId: z.string().min(1).optional(),
            errorCode: z.string().min(1).optional(),
            rerunReason: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1),
    reviews: z.array(blindReviewSchema),
  })
  .strict();

export const liveAcceptanceReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    offeringId: offeringIdSchema,
    providerId: providerIdSchema,
    requestedProviderModelId: z.string().min(1),
    resolvedProviderModelId: z.string().min(1),
    deploymentRegion: z.string().min(1),
    adapterManifestId: z.string().min(1),
    adapterManifestSha256: sha256Schema,
    acceptanceSuiteId: z.string().min(1),
    acceptanceSuiteSha256: sha256Schema,
    sdkPackage: z.string().min(1),
    sdkVersion: z.string().min(1),
    providerApiRevision: z.string().min(1),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    estimatedMaximumUsd: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    accountedCostUsd: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    costBasis: z.enum(["provider_reported", "billing_export", "conservative_case_cap"]),
    samples: z.array(liveAcceptanceSampleSchema).min(1),
    executionAttestation: z
      .object({
        executorId: z.string().min(1),
        repository: z.string().min(1),
        workflow: z.string().min(1),
        environment: z.string().min(1),
        commitSha: z.string().regex(/^[a-f0-9]{40}$/),
        workflowRunId: z.string().min(1),
        executorManifestSha256: sha256Schema,
        signature: signatureSchema,
      })
      .strict(),
  })
  .strict();

export const productEvidenceRecordSchema = z
  .object({
    offeringId: offeringIdSchema,
    providerId: providerIdSchema,
    requestedProviderModelId: z.string().min(1),
    resolvedProviderModelId: z.string().min(1),
    deploymentRegion: z.string().min(1),
    adapterManifestId: z.string().min(1),
    adapterManifestSha256: sha256Schema,
    acceptanceSuiteId: z.string().min(1),
    acceptanceSuiteSha256: sha256Schema,
    sdkPackage: z.string().min(1),
    sdkVersion: z.string().min(1),
    providerApiRevision: z.string().min(1),
    verifiedAt: z.string().datetime({ offset: true }),
    runId: z.string().min(1),
    reportSha256: sha256Schema,
    executionCommitSha: z.string().regex(/^[a-f0-9]{40}$/),
    executionWorkflowRunId: z.string().min(1),
    executorManifestSha256: sha256Schema,
  })
  .strict();

export const productEvidenceDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    records: z.array(productEvidenceRecordSchema),
  })
  .strict();

const trustedSignerSchema = z
  .object({
    id: z.string().min(1),
    publicKeyPem: z.string().includes("BEGIN PUBLIC KEY"),
  })
  .strict();

export const evidenceTrustDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    executors: z.array(
      trustedSignerSchema.extend({
        repository: z.string().min(1),
        workflow: z.string().min(1),
        environments: z.array(z.string().min(1)).min(1),
      }),
    ),
    reviewers: z.array(trustedSignerSchema),
  })
  .strict()
  .superRefine((document, context) => {
    for (const [group, signers] of [
      ["executors", document.executors],
      ["reviewers", document.reviewers],
    ] as const) {
      const ids = new Set<string>();
      for (const [index, signer] of signers.entries()) {
        if (ids.has(signer.id)) {
          context.addIssue({
            code: "custom",
            path: [group, index, "id"],
            message: "trusted signer ids must be unique",
          });
        }
        ids.add(signer.id);
        if (!publicKeySpkiSha256(signer.publicKeyPem)) {
          context.addIssue({
            code: "custom",
            path: [group, index, "publicKeyPem"],
            message: "trusted signer public key must be valid SPKI",
          });
        }
      }
    }

    const reviewerKeys = new Set<string>();
    for (const [index, reviewer] of document.reviewers.entries()) {
      const fingerprint = publicKeySpkiSha256(reviewer.publicKeyPem);
      if (!fingerprint) continue;
      if (reviewerKeys.has(fingerprint)) {
        context.addIssue({
          code: "custom",
          path: ["reviewers", index, "publicKeyPem"],
          message: "reviewers must use unique public key identities",
        });
      }
      reviewerKeys.add(fingerprint);
    }
  });

export type BlindReview = z.infer<typeof blindReviewSchema>;
export type ReviewDecisionDocument = z.infer<typeof reviewDecisionDocumentSchema>;
export type LiveAcceptanceSample = z.infer<typeof liveAcceptanceSampleSchema>;
export type LiveAcceptanceReport = z.infer<typeof liveAcceptanceReportSchema>;
export type ProductEvidenceRecord = z.infer<typeof productEvidenceRecordSchema>;
export type ProductEvidenceDocument = z.infer<typeof productEvidenceDocumentSchema>;
export type EvidenceTrustDocument = z.infer<typeof evidenceTrustDocumentSchema>;
