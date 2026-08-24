import { z } from "zod";
import { createHash, createPrivateKey, type KeyObject } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  acceptanceAssetFixtures,
  acceptanceCaseSha256,
  acceptanceFixtureBytes,
  acceptanceProfiles,
  type AcceptanceCase,
} from "@/release/acceptanceSuite";
import { signExecution } from "@/release/attestation";
import {
  liveAcceptanceReportSchema,
  type LiveAcceptanceReport,
  type LiveAcceptanceSample,
} from "@/release/evidence";
import type { OfferingId, ProviderId } from "@/providers/domain/ids";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { createEnvironmentCredentialVault } from "@/security/credentials/runtime";
import { createBuiltinProviderRegistry } from "@/providers/runtime";
import { FrozenAcceptanceAssetResolver, ProviderLiveCaseExecutor } from "./live-provider-executor";
import {
  acceptanceSuiteDigests,
  adapterManifestDigests,
  liveExecutorManifestDigest,
} from "@/release/manifestDigests";
import { releaseTargets } from "@/release/supportMatrix";
import { ProviderHealthMonitor } from "@/providers/availability/providerHealth";
import { ProviderConnectionProbe } from "@/providers/availability/connectionProbe";

const moneySchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const liveTestCaseSchema = z
  .object({
    id: z.string().min(1),
    credentialEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    estimatedMaxUsd: moneySchema,
  })
  .strict();

export type LiveTestCase = z.infer<typeof liveTestCaseSchema>;

export interface LiveTestPreview {
  schemaVersion: 1;
  caseCount: number;
  estimatedMaxUsd: string;
  cases: LiveTestCase[];
}

function toCents(value: string): bigint {
  const parsed = moneySchema.parse(value);
  const [whole, fraction = ""] = parsed.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function createLiveTestPreview(cases: LiveTestCase[]): LiveTestPreview {
  const parsedCases = z.array(liveTestCaseSchema).min(1).parse(cases);
  const total = parsedCases.reduce((sum, item) => sum + toCents(item.estimatedMaxUsd), 0n);

  return {
    schemaVersion: 1,
    caseCount: parsedCases.length,
    estimatedMaxUsd: fromCents(total),
    cases: parsedCases,
  };
}

export function assertLiveTestAuthorization(
  preview: LiveTestPreview,
  env: Record<string, string | undefined>,
): void {
  if (env.NARRASTAGE_LIVE_TESTS !== "1") {
    throw new Error("paid live tests require explicit NARRASTAGE_LIVE_TESTS=1");
  }

  const approvedBudget = env.NARRASTAGE_LIVE_TEST_MAX_USD;
  if (!approvedBudget) {
    throw new Error("paid live tests require NARRASTAGE_LIVE_TEST_MAX_USD");
  }

  const missingCredentials = preview.cases
    .map((item) => item.credentialEnv)
    .filter((name) => !env[name]);
  if (missingCredentials.length > 0) {
    throw new Error(
      `missing live-test credentials: ${[...new Set(missingCredentials)].join(", ")}`,
    );
  }

  if (toCents(preview.estimatedMaxUsd) > toCents(approvedBudget)) {
    throw new Error(
      `live-test estimate $${preview.estimatedMaxUsd} exceeds approved budget $${fromCents(
        toCents(approvedBudget),
      )}`,
    );
  }
}

export interface LiveCaseExecution {
  resolvedProviderModelId: string;
  deterministicPassed: boolean;
  factsRatio?: number;
  hardFailures: string[];
  artifacts: LiveAcceptanceSample["artifacts"];
  attempts: LiveAcceptanceSample["attempts"];
  seed?: string;
  accountedCostUsd: string;
}

export interface LiveCaseExecutor {
  execute(
    acceptanceCase: AcceptanceCase,
    fixtures: typeof acceptanceAssetFixtures,
  ): Promise<LiveCaseExecution>;
}

export interface LiveAcceptanceRunOptions {
  repositoryRoot: string;
  offeringId: OfferingId;
  providerId: ProviderId;
  requestedProviderModelId: string;
  deploymentRegion: string;
  adapterManifestId: string;
  adapterManifestSha256: string;
  acceptanceSuiteId: string;
  acceptanceSuiteSha256: string;
  sdkPackage: string;
  sdkVersion: string;
  providerApiRevision: string;
  runId: string;
  credentialEnv: string;
  estimatedMaximumUsdByCase: Readonly<Record<string, string>>;
  executor: LiveCaseExecutor;
  executorId: string;
  executorPrivateKey: KeyObject;
  repository: string;
  workflow: string;
  environment: string;
  commitSha: string;
  workflowRunId: string;
  executorManifestSha256: string;
  env: Record<string, string | undefined>;
  now?: () => Date;
}

async function assertFrozenAssets(repositoryRoot: string, acceptanceCase: AcceptanceCase) {
  for (const asset of acceptanceCase.input.assets) {
    const fixture = acceptanceAssetFixtures[asset.fixtureId];
    const digest = createHash("sha256")
      .update(await acceptanceFixtureBytes(repositoryRoot, asset.fixtureId))
      .digest("hex");
    if (digest !== fixture.sha256) {
      throw new Error(`live.fixture_digest_mismatch:${asset.fixtureId}`);
    }
  }
}

export async function executeLiveAcceptanceSuite(
  options: LiveAcceptanceRunOptions,
): Promise<LiveAcceptanceReport> {
  const profile = acceptanceProfiles[options.offeringId];
  if (!profile) throw new Error(`live.acceptance_profile_missing:${options.offeringId}`);
  const preview = createLiveTestPreview(
    profile.cases.map((acceptanceCase) => ({
      id: acceptanceCase.id,
      credentialEnv: options.credentialEnv,
      estimatedMaxUsd: moneySchema.parse(options.estimatedMaximumUsdByCase[acceptanceCase.id]),
    })),
  );
  assertLiveTestAuthorization(preview, options.env);
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const samples: LiveAcceptanceSample[] = [];
  let accountedCostCents = 0n;
  let resolvedProviderModelId: string | undefined;
  for (const acceptanceCase of profile.cases) {
    await assertFrozenAssets(options.repositoryRoot, acceptanceCase);
    const execution = await options.executor.execute(acceptanceCase, acceptanceAssetFixtures);
    if (resolvedProviderModelId && resolvedProviderModelId !== execution.resolvedProviderModelId) {
      throw new Error("live.resolved_model_changed_within_run");
    }
    resolvedProviderModelId = execution.resolvedProviderModelId;
    accountedCostCents += toCents(execution.accountedCostUsd);
    samples.push({
      caseId: acceptanceCase.id,
      caseSha256: acceptanceCaseSha256(acceptanceCase),
      group: acceptanceCase.group,
      operations: [...acceptanceCase.operations],
      ...(execution.seed ? { seed: execution.seed } : {}),
      deterministicPassed: execution.deterministicPassed,
      ...(execution.factsRatio === undefined ? {} : { factsRatio: execution.factsRatio }),
      hardFailures: execution.hardFailures,
      artifacts: execution.artifacts,
      attempts: execution.attempts,
      reviews: [],
    });
  }
  if (!resolvedProviderModelId) throw new Error("live.resolved_model_missing");
  const accountedCostUsd = fromCents(accountedCostCents);
  if (toCents(accountedCostUsd) > toCents(preview.estimatedMaxUsd)) {
    throw new Error("live.accounted_cost_exceeded_estimate");
  }
  const report: LiveAcceptanceReport = {
    schemaVersion: 1,
    runId: options.runId,
    offeringId: options.offeringId,
    providerId: options.providerId,
    requestedProviderModelId: options.requestedProviderModelId,
    resolvedProviderModelId,
    deploymentRegion: options.deploymentRegion,
    adapterManifestId: options.adapterManifestId,
    adapterManifestSha256: options.adapterManifestSha256,
    acceptanceSuiteId: options.acceptanceSuiteId,
    acceptanceSuiteSha256: options.acceptanceSuiteSha256,
    sdkPackage: options.sdkPackage,
    sdkVersion: options.sdkVersion,
    providerApiRevision: options.providerApiRevision,
    startedAt,
    completedAt: now().toISOString(),
    estimatedMaximumUsd: preview.estimatedMaxUsd,
    accountedCostUsd,
    costBasis: "conservative_case_cap",
    samples,
    executionAttestation: {
      executorId: options.executorId,
      repository: options.repository,
      workflow: options.workflow,
      environment: options.environment,
      commitSha: options.commitSha,
      workflowRunId: options.workflowRunId,
      executorManifestSha256: options.executorManifestSha256,
      signature: { algorithm: "ed25519", valueBase64: "A".repeat(88) },
    },
  };
  report.executionAttestation.signature.valueBase64 = signExecution(
    report,
    options.executorPrivateKey,
  );
  return report;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`live.cli_argument_required:${name}`);
  return value;
}

function environmentValue(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`live.environment_required:${name}`);
  return value;
}

function assertExternalArtifactDirectory(repositoryRoot: string, artifactDirectory: string): void {
  if (!path.isAbsolute(artifactDirectory)) throw new Error("live.artifact_directory_not_absolute");
  const relative = path.relative(repositoryRoot, artifactDirectory);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..")) {
    throw new Error("live.artifact_directory_inside_repository");
  }
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(import.meta.dir, "..");
  const offeringId = requiredArgument("--offering") as OfferingId;
  const caseMaximumUsd = moneySchema.parse(requiredArgument("--case-max-usd"));
  const target = releaseTargets.find((candidate) => candidate.offeringId === offeringId);
  const offering = builtinCatalog.offerings.find((candidate) => candidate.id === offeringId);
  const profile = acceptanceProfiles[offeringId];
  if (!target || !offering || !profile) throw new Error(`live.offering_unsupported:${offeringId}`);
  const provider = builtinCatalog.providers.find(
    (candidate) => candidate.id === offering.providerId,
  );
  const credentialVariables = provider?.credentialSlots.flatMap(
    (descriptor) => descriptor.environmentVariables,
  );
  const credentialEnv =
    credentialVariables?.find((name) => process.env[name]?.trim()) ?? credentialVariables?.[0];
  if (!credentialEnv) throw new Error(`live.credential_mapping_missing:${offering.providerId}`);
  const estimatedMaximumUsdByCase = Object.fromEntries(
    profile.cases.map((acceptanceCase) => [acceptanceCase.id, caseMaximumUsd]),
  );
  const preview = createLiveTestPreview(
    profile.cases.map((acceptanceCase) => ({
      id: acceptanceCase.id,
      credentialEnv,
      estimatedMaxUsd: caseMaximumUsd,
    })),
  );
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return;
  }
  assertLiveTestAuthorization(preview, process.env);

  const runId = requiredArgument("--run-id");
  const artifactDirectory = path.resolve(requiredArgument("--artifact-dir"));
  const output = path.resolve(requiredArgument("--output"));
  if (path.basename(output) !== `${runId}.json`) throw new Error("live.output_filename_mismatch");
  assertExternalArtifactDirectory(repositoryRoot, artifactDirectory);
  const privateKeyPem = environmentValue("NARRASTAGE_EXECUTOR_PRIVATE_KEY_PEM").replaceAll(
    "\\n",
    "\n",
  );
  const executorPrivateKey = createPrivateKey(privateKeyPem);
  const executorId = environmentValue("NARRASTAGE_EXECUTOR_ID");
  const repository = environmentValue("GITHUB_REPOSITORY");
  const workflow = environmentValue("NARRASTAGE_EXECUTOR_WORKFLOW");
  const environment = environmentValue("NARRASTAGE_EXECUTOR_ENVIRONMENT");
  const commitSha = environmentValue("GITHUB_SHA");
  const workflowRunId = environmentValue("GITHUB_RUN_ID");
  const vault = createEnvironmentCredentialVault(process.env);
  const assetResolver = new FrozenAcceptanceAssetResolver(repositoryRoot);
  const registry = createBuiltinProviderRegistry(vault, { assetResolver });
  const monitor = new ProviderHealthMonitor();
  const probe = new ProviderConnectionProbe({ credentialVault: vault, healthMonitor: monitor });
  await probe.check(offering.providerId);
  const health = monitor.get(offeringId);
  if (health.health !== "healthy") {
    throw new Error(`live.offering_health_required:${health.reasonCode ?? health.health}`);
  }
  const manifests = await adapterManifestDigests(repositoryRoot);
  const suites = await acceptanceSuiteDigests(repositoryRoot);
  const executor = new ProviderLiveCaseExecutor({
    repositoryRoot,
    artifactDirectory,
    runId,
    offeringId,
    providerId: offering.providerId,
    requestedProviderModelId: offering.providerModelId,
    observedResolvedProviderModelId: health.resolvedProviderModelId,
    registry,
    credentialVault: vault,
    accountedCostUsdByCase: estimatedMaximumUsdByCase,
  });
  const report = await executeLiveAcceptanceSuite({
    repositoryRoot,
    offeringId,
    providerId: offering.providerId,
    requestedProviderModelId: offering.providerModelId,
    deploymentRegion: process.env.NARRASTAGE_DEPLOYMENT_REGION ?? "global",
    adapterManifestId: target.adapterManifestId,
    adapterManifestSha256: manifests[target.adapterManifestId]!,
    acceptanceSuiteId: target.acceptanceSuiteId,
    acceptanceSuiteSha256: suites[target.acceptanceSuiteId]!,
    sdkPackage: target.sdkPackage,
    sdkVersion: target.sdkVersion,
    providerApiRevision: target.providerApiRevision,
    runId,
    credentialEnv,
    estimatedMaximumUsdByCase,
    executor,
    executorId,
    executorPrivateKey,
    repository,
    workflow,
    environment,
    commitSha,
    workflowRunId,
    executorManifestSha256: await liveExecutorManifestDigest(repositoryRoot),
    env: process.env,
  });
  const parsed = liveAcceptanceReportSchema.parse(report);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(parsed, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ runId, report: output, artifactDirectory, execution: "signed" })}\n`,
  );
}

if (import.meta.main) {
  await main();
}
