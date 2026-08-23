import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { liveAcceptanceReportSchema, type LiveAcceptanceReport } from "@/release/evidence";

const manifestInputs = {
  "deepseek-v4": ["apps/server/src/providers/adapters/deepseek/**/*.ts"],
  "fal-h3": [
    "apps/server/src/providers/adapters/fal/**/*.ts",
    "apps/server/src/providers/adapters/minimax/h3Schema.ts",
  ],
  "google-generative-ai": ["apps/server/src/providers/adapters/google/**/*.ts"],
} as const;

const acceptanceSuiteInputs = {
  "provider-product-acceptance-v1": [
    "apps/server/src/release/evidence.ts",
    "apps/server/src/release/acceptanceSuite.ts",
    "apps/server/src/release/attestation.ts",
    "apps/server/src/release/supportMatrix.ts",
    "apps/server/src/release/releaseGate.ts",
    "docs/logo.png",
    "docs/screenshot/1.png",
    "docs/videoCover.jpg",
    "data/assets/ending.mp4",
  ],
} as const;

const liveExecutorInputs = {
  "provider-live-executor-v1": [
    "scripts/run-live-tests.ts",
    "scripts/live-provider-executor.ts",
    ".github/workflows/provider-live-acceptance.yml",
    "apps/server/src/providers/**/*.ts",
    "apps/server/src/assets/metadata.ts",
    "apps/server/src/security/credentials/**/*.ts",
    "apps/server/src/release/acceptanceSuite.ts",
    "apps/server/src/release/attestation.ts",
    "apps/server/src/release/evidence.ts",
    "apps/server/src/release/supportMatrix.ts",
    "bun.lock",
  ],
} as const;

const liveReviewerInputs = {
  "provider-live-reviewer-v1": [
    "scripts/review-live-report.ts",
    "apps/server/src/assets/metadata.ts",
    "apps/server/src/release/acceptanceSuite.ts",
    "apps/server/src/release/attestation.ts",
    "apps/server/src/release/evidence.ts",
    "apps/server/src/release/manifestDigests.ts",
    "apps/server/src/release/releaseGate.ts",
    "bun.lock",
  ],
} as const;

async function sourceDigests(
  root: string,
  inputs: Readonly<Record<string, readonly string[]>>,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(inputs).map(async ([manifestId, patterns]) => {
      const files = await fg([...patterns], {
        cwd: root,
        onlyFiles: true,
        ignore: ["**/*.test.ts", "**/*.spec.ts"],
      });
      files.sort();
      if (files.length === 0) throw new Error(`release.manifest_empty:${manifestId}`);
      const digest = createHash("sha256");
      for (const relativePath of files) {
        digest.update(relativePath);
        digest.update("\0");
        digest.update(await readFile(path.join(root, relativePath)));
        digest.update("\0");
      }
      return [manifestId, digest.digest("hex")] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function adapterManifestDigests(root: string): Promise<Record<string, string>> {
  return sourceDigests(root, manifestInputs);
}

export async function acceptanceSuiteDigests(root: string): Promise<Record<string, string>> {
  return sourceDigests(root, acceptanceSuiteInputs);
}

export async function liveExecutorManifestDigest(root: string): Promise<string> {
  const digests = await sourceDigests(root, liveExecutorInputs);
  return digests["provider-live-executor-v1"]!;
}

export async function liveReviewerManifestDigest(root: string): Promise<string> {
  const digests = await sourceDigests(root, liveReviewerInputs);
  return digests["provider-live-reviewer-v1"]!;
}

export async function liveReportDigests(root: string): Promise<Record<string, string>> {
  const reportRoot = path.join(root, "data/contracts/live-reports");
  const files = await fg(["*.json"], { cwd: reportRoot, onlyFiles: true });
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        path.basename(file, ".json"),
        createHash("sha256")
          .update(await readFile(path.join(reportRoot, file)))
          .digest("hex"),
      ]),
    ),
  );
}

export async function loadLiveReports(root: string): Promise<Record<string, LiveAcceptanceReport>> {
  const reportRoot = path.join(root, "data/contracts/live-reports");
  const files = await fg(["*.json"], { cwd: reportRoot, onlyFiles: true });
  const reports: Record<string, LiveAcceptanceReport> = {};
  for (const file of files.sort()) {
    const report = liveAcceptanceReportSchema.parse(
      JSON.parse(await readFile(path.join(reportRoot, file), "utf8")),
    );
    const filenameRunId = path.basename(file, ".json");
    if (report.runId !== filenameRunId) throw new Error(`release.report_filename_mismatch:${file}`);
    if (reports[report.runId]) throw new Error(`release.report_duplicate:${report.runId}`);
    reports[report.runId] = report;
  }
  return reports;
}
