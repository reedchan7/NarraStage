import { createHash } from "node:crypto";
import { FalQueueTransport } from "@/providers/adapters/fal/transport";
import { falH3Manifest } from "@/providers/adapters/fal/manifest";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { Offering } from "@/providers/domain/models";
import type { ProviderId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";
import {
  ProviderHealthMonitor,
  type OfferingHealthSnapshot,
  type ProviderRuntimeHealth,
} from "@/providers/availability/providerHealth";
import type { CredentialVault } from "@/security/credentials/types";

export interface ProviderConnectionProbeOptions {
  credentialVault: CredentialVault;
  healthMonitor: ProviderHealthMonitor;
  fetch?: ProbeFetch;
  falProbe?: () => Promise<void>;
  deploymentRegion?: string;
}

type ProbeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type CheckedHealth = Exclude<ProviderRuntimeHealth, "unknown">;

export interface ProviderConnectionProbeResult {
  providerId: ProviderId;
  health: CheckedHealth;
  checkedAt: string;
  reasonCode?: string;
  offerings: OfferingHealthSnapshot[];
}

interface ProbeOutcome {
  health: CheckedHealth;
  reasonCode?: string;
  capabilitiesObserved: boolean;
  supportedOperations: Operation[];
  revisionObserved: boolean;
  resolvedProviderModelId?: string;
}

const inaccessible = (reasonCode: string, health: CheckedHealth = "unhealthy"): ProbeOutcome => ({
  health,
  reasonCode,
  capabilitiesObserved: false,
  supportedOperations: [],
  revisionObserved: false,
});

function contentOperations(offering: Offering, methods: Set<string>): Operation[] {
  const generateContent = methods.has("generateContent");
  const generateVideo = methods.has("predictLongRunning") || methods.has("generateVideos");
  return offering.operations.flatMap(({ operation, enabled }) => {
    if (!enabled) return [];
    if (
      generateContent &&
      ["language.generate", "language.stream", "image.generate", "image.edit"].includes(operation)
    ) {
      return [operation];
    }
    if (generateVideo && ["video.generate", "video.status", "video.cancel"].includes(operation)) {
      return [operation];
    }
    return [];
  });
}

export class ProviderConnectionProbe {
  readonly #credentialVault: CredentialVault;
  readonly #healthMonitor: ProviderHealthMonitor;
  readonly #fetch: ProbeFetch;
  readonly #falProbe?: () => Promise<void>;
  readonly #deploymentRegion: string;

  constructor(options: ProviderConnectionProbeOptions) {
    this.#credentialVault = options.credentialVault;
    this.#healthMonitor = options.healthMonitor;
    this.#fetch = options.fetch ?? fetch;
    this.#falProbe = options.falProbe;
    this.#deploymentRegion =
      options.deploymentRegion ?? process.env.NARRASTAGE_DEPLOYMENT_REGION ?? "global";
  }

  async check(providerId: ProviderId): Promise<ProviderConnectionProbeResult> {
    const offerings = builtinCatalog.offerings.filter(
      (offering) =>
        offering.providerId === providerId && offering.support.implementation === "implemented",
    );
    const apiKey = await this.#credentialVault.get({ providerId, slot: "apiKey" });
    if (!apiKey) {
      return this.#recordAll(providerId, offerings, inaccessible("credential.missing"));
    }
    if (providerId === "deepseek") return this.#checkDeepSeek(apiKey, offerings);
    if (providerId === "google") return this.#checkGoogle(apiKey, offerings);
    if (providerId === "fal") return this.#checkFal(offerings);
    return this.#recordAll(
      providerId,
      offerings,
      inaccessible("provider.health_probe_unsupported"),
    );
  }

  async #checkDeepSeek(
    apiKey: string,
    offerings: Offering[],
  ): Promise<ProviderConnectionProbeResult> {
    try {
      const response = await this.#request("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const payload = (await response.json()) as {
        data?: Array<{ id?: unknown; version?: unknown; supported_methods?: unknown }>;
      };
      return this.#recordPerOffering(
        "deepseek",
        offerings.map((offering) => {
          const model = payload.data?.find(
            (candidate) => candidate.id === offering.providerModelId,
          );
          if (!model) {
            return { offering, outcome: inaccessible("provider.model_unavailable") };
          }
          const methods = Array.isArray(model.supported_methods)
            ? new Set(
                model.supported_methods.filter(
                  (method): method is string => typeof method === "string",
                ),
              )
            : undefined;
          const supportedOperations = methods
            ? offering.operations.flatMap(({ operation, enabled }) => {
                if (!enabled) return [];
                if (
                  ["language.generate", "language.stream"].includes(operation) &&
                  (methods.has("chat.completions") || methods.has("responses"))
                ) {
                  return [operation];
                }
                if (operation === "files.upload" && methods.has("files")) return [operation];
                return [];
              })
            : [];
          const version = typeof model.version === "string" ? model.version : undefined;
          return {
            offering,
            outcome: {
              health: "healthy" as const,
              capabilitiesObserved: Boolean(methods),
              supportedOperations,
              revisionObserved: Boolean(version),
              ...(version
                ? { resolvedProviderModelId: `${offering.providerModelId}@${version}` }
                : {}),
            },
          };
        }),
      );
    } catch (cause) {
      return this.#recordAll("deepseek", offerings, this.#failureOutcome(cause, true));
    }
  }

  async #checkGoogle(
    apiKey: string,
    offerings: Offering[],
  ): Promise<ProviderConnectionProbeResult> {
    let filesAvailable = false;
    if (
      offerings.some((offering) =>
        offering.operations.some((entry) => entry.operation === "files.upload"),
      )
    ) {
      try {
        await this.#request("https://generativelanguage.googleapis.com/v1beta/files?pageSize=1", {
          headers: { "x-goog-api-key": apiKey },
        });
        filesAvailable = true;
      } catch (cause) {
        if (cause instanceof ProviderProbeHttpError && cause.status === 401) {
          return this.#recordAll("google", offerings, inaccessible("credential.invalid"));
        }
      }
    }

    const results: Array<{ offering: Offering; outcome: ProbeOutcome }> = [];
    for (const offering of offerings) {
      try {
        const response = await this.#request(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(offering.providerModelId)}`,
          { headers: { "x-goog-api-key": apiKey } },
        );
        const payload = (await response.json()) as {
          name?: unknown;
          version?: unknown;
          supportedGenerationMethods?: unknown;
        };
        if (
          payload.name !== `models/${offering.providerModelId}` &&
          payload.name !== offering.providerModelId
        ) {
          results.push({
            offering,
            outcome: inaccessible("provider.model_identity_mismatch"),
          });
          continue;
        }
        const methods = new Set(
          Array.isArray(payload.supportedGenerationMethods)
            ? payload.supportedGenerationMethods.filter(
                (method): method is string => typeof method === "string",
              )
            : [],
        );
        const supportedOperations = contentOperations(offering, methods);
        if (
          filesAvailable &&
          offering.operations.some((entry) => entry.operation === "files.upload")
        ) {
          supportedOperations.push("files.upload");
        }
        const version = typeof payload.version === "string" ? payload.version : undefined;
        results.push({
          offering,
          outcome: {
            health: "healthy",
            capabilitiesObserved: true,
            supportedOperations,
            revisionObserved: Boolean(version),
            ...(version
              ? { resolvedProviderModelId: `${offering.providerModelId}@${version}` }
              : {}),
          },
        });
      } catch (cause) {
        if (cause instanceof ProviderProbeHttpError && cause.status === 401) {
          return this.#recordAll("google", offerings, inaccessible("credential.invalid"));
        }
        results.push({
          offering,
          outcome:
            cause instanceof ProviderProbeHttpError && cause.status === 403
              ? inaccessible("provider.model_access_denied")
              : this.#failureOutcome(cause, false),
        });
      }
    }
    return this.#recordPerOffering("google", results);
  }

  async #checkFal(offerings: Offering[]): Promise<ProviderConnectionProbeResult> {
    try {
      if (this.#falProbe) await this.#falProbe();
      else {
        await new FalQueueTransport({ credentialVault: this.#credentialVault }).upload(
          new Blob(["narrastage-health"], { type: "text/plain" }),
        );
      }
      const endpointRevisions: Array<{ mode: string; endpoint: string; revision: string }> = [];
      for (const [mode, endpoint] of Object.entries(falH3Manifest.endpoints)) {
        const metadataResponse = await this.#request(
          `https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(endpoint)}&expand=enterprise_status`,
        );
        const metadata = (await metadataResponse.json()) as {
          models?: Array<{
            endpoint_id?: unknown;
            metadata?: { status?: unknown; updated_at?: unknown };
          }>;
        };
        const model = metadata.models?.find(
          (candidate) =>
            candidate.endpoint_id === endpoint && candidate.metadata?.status === "active",
        );
        if (!model) {
          return this.#recordAll("fal", offerings, inaccessible("provider.endpoint_unavailable"));
        }
        if (typeof model.metadata?.updated_at !== "string") {
          return this.#recordAll("fal", offerings, {
            health: "degraded",
            reasonCode: "provider.endpoint_revision_unavailable",
            capabilitiesObserved: true,
            supportedOperations: ["video.generate", "video.status", "video.cancel"],
            revisionObserved: false,
          });
        }
        endpointRevisions.push({ mode, endpoint, revision: model.metadata.updated_at });

        const schemaResponse = await this.#request(
          `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
        );
        const schema = (await schemaResponse.json()) as {
          paths?: Record<string, Record<string, unknown>>;
        };
        const paths = schema.paths ?? {};
        const requiredPaths = [
          [`.${endpoint}`, "post"],
          [`.${endpoint}/requests/{request_id}/status`, "get"],
          [`.${endpoint}/requests/{request_id}`, "get"],
          [`.${endpoint}/requests/{request_id}/cancel`, "put"],
        ] as const;
        if (
          requiredPaths.some(([suffix, method]) => {
            const path = suffix.slice(1);
            return !paths[`/${path}`]?.[method];
          })
        ) {
          return this.#recordAll(
            "fal",
            offerings,
            inaccessible("provider.endpoint_contract_unavailable"),
          );
        }
      }
      const revision = createHash("sha256")
        .update(
          JSON.stringify(
            endpointRevisions.sort((left, right) => left.mode.localeCompare(right.mode)),
          ),
        )
        .digest("hex");
      return this.#recordAll("fal", offerings, {
        health: "healthy",
        capabilitiesObserved: true,
        supportedOperations: ["video.generate", "video.status", "video.cancel"],
        revisionObserved: true,
        resolvedProviderModelId: `minimax/h3@endpoints-sha256:${revision}`,
      });
    } catch (cause) {
      return this.#recordAll("fal", offerings, this.#failureOutcome(cause, false));
    }
  }

  async #request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.#fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new ProviderProbeHttpError(response.status);
    return response;
  }

  #failureOutcome(cause: unknown, forbiddenIsCredential: boolean): ProbeOutcome {
    if (
      cause instanceof ProviderProbeHttpError &&
      (cause.status === 401 || (forbiddenIsCredential && cause.status === 403))
    ) {
      return inaccessible("credential.invalid");
    }
    if (cause instanceof ProviderProbeHttpError && cause.status === 404) {
      return inaccessible("provider.model_unavailable");
    }
    return inaccessible("provider.connection_failed", "degraded");
  }

  #recordAll(providerId: ProviderId, offerings: Offering[], outcome: ProbeOutcome) {
    return this.#recordPerOffering(
      providerId,
      offerings.map((offering) => ({ offering, outcome })),
      outcome,
    );
  }

  #recordPerOffering(
    providerId: ProviderId,
    outcomes: Array<{ offering: Offering; outcome: ProbeOutcome }>,
    emptyOutcome: ProbeOutcome = inaccessible("provider.offering_missing"),
  ): ProviderConnectionProbeResult {
    const snapshots = outcomes.map(({ offering, outcome }) =>
      this.#healthMonitor.record({
        providerId,
        offeringId: offering.id,
        providerModelId: offering.providerModelId,
        deploymentRegion: this.#deploymentRegion,
        ...outcome,
      }),
    );
    const outcomeValues = outcomes.map(({ outcome }) => outcome);
    const aggregate =
      outcomeValues.length === 0
        ? emptyOutcome
        : outcomeValues.every((outcome) => outcome.health === "healthy")
          ? { health: "healthy" as const }
          : outcomeValues.every((outcome) => outcome.health === "unhealthy")
            ? {
                health: "unhealthy" as const,
                reasonCode: outcomeValues.every(
                  (outcome) => outcome.reasonCode === outcomeValues[0]!.reasonCode,
                )
                  ? outcomeValues[0]!.reasonCode
                  : "provider.offerings_unavailable",
              }
            : {
                health: "degraded" as const,
                reasonCode: "provider.offerings_partially_available",
              };
    return {
      providerId,
      ...aggregate,
      checkedAt: snapshots[0]?.checkedAt ?? new Date().toISOString(),
      offerings: snapshots,
    };
  }
}

class ProviderProbeHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("provider.health_probe_failed");
    this.status = status;
  }
}

let runtime: ProviderConnectionProbe | undefined;

export function configureProviderConnectionProbeRuntime(
  probe: ProviderConnectionProbe,
): ProviderConnectionProbe {
  runtime = probe;
  return probe;
}

export function getProviderConnectionProbeRuntime(): ProviderConnectionProbe {
  if (!runtime) throw new Error("provider.connection_probe_not_configured");
  return runtime;
}

export function resetProviderConnectionProbeRuntimeForTests(): void {
  runtime = undefined;
}
