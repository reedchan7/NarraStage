import type { OfferingId, ProviderId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";

export type ProviderRuntimeHealth = "unknown" | "healthy" | "degraded" | "unhealthy";

export interface OfferingHealthSnapshot {
  providerId: ProviderId;
  offeringId: OfferingId;
  providerModelId: string;
  deploymentRegion: string;
  health: ProviderRuntimeHealth;
  capabilitiesObserved: boolean;
  supportedOperations: Operation[];
  revisionObserved: boolean;
  resolvedProviderModelId?: string;
  checkedAt?: string;
  reasonCode?: string;
}

export class ProviderHealthMonitor {
  readonly #records = new Map<OfferingId, OfferingHealthSnapshot>();
  readonly #now: () => number;
  readonly #ttlMs: number;

  constructor(now: () => number = Date.now, ttlMs = 5 * 60 * 1_000) {
    this.#now = now;
    this.#ttlMs = ttlMs;
  }

  record(snapshot: Omit<OfferingHealthSnapshot, "checkedAt">): OfferingHealthSnapshot {
    const recorded: OfferingHealthSnapshot = {
      ...snapshot,
      checkedAt: new Date(this.#now()).toISOString(),
    };
    this.#records.set(snapshot.offeringId, recorded);
    return recorded;
  }

  invalidateProvider(providerId: ProviderId): void {
    for (const [key, snapshot] of this.#records) {
      if (snapshot.providerId === providerId) this.#records.delete(key);
    }
  }

  get(offeringId: OfferingId): OfferingHealthSnapshot {
    const record = this.#records.get(offeringId);
    if (!record?.checkedAt || this.#now() - Date.parse(record.checkedAt) > this.#ttlMs) {
      return {
        providerId: record?.providerId ?? "unknown",
        offeringId,
        providerModelId: record?.providerModelId ?? "unknown",
        deploymentRegion: record?.deploymentRegion ?? "unknown",
        health: "unknown",
        capabilitiesObserved: false,
        supportedOperations: [],
        revisionObserved: false,
      };
    }
    return record;
  }
}

let runtime: ProviderHealthMonitor | undefined;

export function configureProviderHealthRuntime(
  monitor: ProviderHealthMonitor = new ProviderHealthMonitor(),
): ProviderHealthMonitor {
  runtime = monitor;
  return monitor;
}

export function getProviderHealthRuntime(): ProviderHealthMonitor {
  if (!runtime) throw new Error("provider.health_runtime_not_configured");
  return runtime;
}

export function resetProviderHealthRuntimeForTests(): void {
  runtime = undefined;
}
