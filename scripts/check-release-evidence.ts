import { readFile } from "node:fs/promises";
import path from "node:path";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { evidenceTrustDocumentSchema, productEvidenceDocumentSchema } from "@/release/evidence";
import {
  adapterManifestDigests,
  acceptanceSuiteDigests,
  liveReportDigests,
  loadLiveReports,
  liveExecutorManifestDigest,
  liveReviewerManifestDigest,
} from "@/release/manifestDigests";
import { assertReleaseEvidence } from "@/release/releaseGate";
import { releaseTargets } from "@/release/supportMatrix";

const root = path.resolve(import.meta.dir, "..");
const evidence = productEvidenceDocumentSchema.parse(
  JSON.parse(
    await readFile(path.join(root, "data/contracts/provider-release-evidence.json"), "utf8"),
  ),
);
const evidenceTrust = evidenceTrustDocumentSchema.parse(
  JSON.parse(
    await readFile(path.join(root, "data/contracts/provider-evidence-trust.json"), "utf8"),
  ),
);
const lock = Bun.JSONC.parse(await readFile(path.join(root, "bun.lock"), "utf8")) as {
  packages?: Record<string, [string, ...unknown[]]>;
};
for (const target of releaseTargets) {
  const resolved = lock.packages?.[target.sdkPackage]?.[0];
  if (resolved !== `${target.sdkPackage}@${target.sdkVersion}`) {
    throw new Error(`release.sdk_lock_mismatch:${target.sdkPackage}`);
  }
}
assertReleaseEvidence(builtinCatalog, evidence, {
  now: Date.now(),
  deploymentRegion: process.env.TOONFLOW_DEPLOYMENT_REGION ?? "global",
  adapterManifestDigests: await adapterManifestDigests(root),
  acceptanceSuiteDigests: await acceptanceSuiteDigests(root),
  liveReportDigests: await liveReportDigests(root),
  liveReports: await loadLiveReports(root),
  evidenceTrust,
  executorManifestSha256: await liveExecutorManifestDigest(root),
  reviewerManifestSha256: await liveReviewerManifestDigest(root),
});
console.log("release evidence is complete and fresh");
