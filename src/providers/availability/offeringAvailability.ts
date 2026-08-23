import { z } from "zod";
import type { OfferingId } from "@/providers/domain/ids";
import type { ProviderCatalog } from "@/providers/domain/models";
import type { SupportEvidenceLevel } from "@/providers/domain/models";
import { operationSchema, type Operation } from "@/providers/domain/operations";
import type { ProviderRegistry } from "@/providers/registry/providerRegistry";
import type { CredentialVault } from "@/security/credentials/types";
import type { ProductEvidenceRecord } from "@/release/evidence";
import type {
  OfferingHealthSnapshot,
  ProviderRuntimeHealth,
} from "@/providers/availability/providerHealth";

export const offeringAvailabilitySchema = z
  .object({
    offeringId: z.string().min(1),
    operation: operationSchema,
    available: z.boolean(),
    reasonCodes: z.array(z.string().min(1)),
    health: z.enum(["unknown", "healthy", "degraded", "unhealthy"]),
    requiredEvidence: z.enum([
      "implemented",
      "contract_verified",
      "live_verified",
      "product_accepted",
    ]),
    deploymentRegion: z.string().min(1),
  })
  .strict();

export type OfferingAvailability = z.infer<typeof offeringAvailabilitySchema>;

export interface OfferingAvailabilityPolicy {
  requiredEvidence: SupportEvidenceLevel;
  deploymentRegion: string;
  maximumEvidenceAgeMs: number;
  now: () => number;
  providerHealth: (offeringId: OfferingId) => OfferingHealthSnapshot;
  productEvidence: (offeringId: OfferingId) => ProductEvidenceRecord | undefined;
  requireHealthy: boolean;
}

const defaultAvailabilityPolicy: OfferingAvailabilityPolicy = {
  requiredEvidence: process.env.NODE_ENV === "prod" ? "product_accepted" : "contract_verified",
  deploymentRegion: process.env.TOONFLOW_DEPLOYMENT_REGION ?? "global",
  maximumEvidenceAgeMs: 30 * 24 * 60 * 60 * 1_000,
  now: Date.now,
  providerHealth: (offeringId) => ({
    providerId: "unknown",
    offeringId,
    providerModelId: "unknown",
    deploymentRegion: "unknown",
    health: "unknown",
    capabilitiesObserved: false,
    supportedOperations: [],
    revisionObserved: false,
  }),
  productEvidence: () => undefined,
  requireHealthy: false,
};

export function offeringAvailabilityKey(offeringId: string, operation: Operation): string {
  return `${offeringId}:${operation}`;
}

export class OfferingAvailabilityService {
  readonly #catalog: ProviderCatalog;
  readonly #registry: ProviderRegistry;
  readonly #credentialVault: CredentialVault;
  readonly #policy: OfferingAvailabilityPolicy;

  constructor(
    catalog: ProviderCatalog,
    registry: ProviderRegistry,
    credentialVault: CredentialVault,
    policy: Partial<OfferingAvailabilityPolicy> = {},
  ) {
    this.#catalog = catalog;
    this.#registry = registry;
    this.#credentialVault = credentialVault;
    this.#policy = { ...defaultAvailabilityPolicy, ...policy };
  }

  async resolve(offeringId: OfferingId, operation: Operation): Promise<OfferingAvailability> {
    const offering = this.#catalog.offerings.find((candidate) => candidate.id === offeringId);
    if (!offering) {
      return {
        offeringId,
        operation,
        available: false,
        reasonCodes: ["provider.offering_missing"],
        health: "unknown",
        requiredEvidence: this.#policy.requiredEvidence,
        deploymentRegion: this.#policy.deploymentRegion,
      };
    }
    const reasons: string[] = [];
    if (offering.support.implementation !== "implemented") {
      reasons.push("provider.offering_not_implemented");
    }
    if (!offering.support.evidence.includes("contract_verified")) {
      reasons.push("provider.contract_unverified");
    }
    const productEvidence =
      this.#policy.requiredEvidence === "product_accepted"
        ? this.#policy.productEvidence(offering.id)
        : undefined;
    if (
      this.#policy.requiredEvidence !== "product_accepted" &&
      !offering.support.evidence.includes(this.#policy.requiredEvidence)
    ) {
      reasons.push("provider.required_evidence_missing");
    }
    if (this.#policy.requiredEvidence === "product_accepted" && !productEvidence) {
      reasons.push("provider.required_evidence_missing");
    }
    const verifiedAt = productEvidence
      ? Date.parse(productEvidence.verifiedAt)
      : offering.support.lastVerifiedAt
        ? Date.parse(offering.support.lastVerifiedAt)
        : Number.NaN;
    if (
      !Number.isFinite(verifiedAt) ||
      this.#policy.now() - verifiedAt > this.#policy.maximumEvidenceAgeMs
    ) {
      reasons.push("provider.evidence_stale");
    }
    if (
      productEvidence &&
      (productEvidence.providerId !== offering.providerId ||
        productEvidence.requestedProviderModelId !== offering.providerModelId ||
        productEvidence.resolvedProviderModelId.length === 0)
    ) {
      reasons.push("provider.model_revision_unverified");
    }
    if (productEvidence && productEvidence.deploymentRegion !== this.#policy.deploymentRegion) {
      reasons.push("provider.evidence_region_mismatch");
    }
    if (offering.lifecycle === "deprecated") reasons.push("provider.lifecycle_deprecated");
    const operationDescriptor = offering.operations.find(
      (candidate) => candidate.operation === operation && candidate.enabled,
    );
    if (!operationDescriptor || !this.#registry.getPort(offering.providerId, operation)) {
      reasons.push("provider.operation_unavailable");
    }
    const provider = this.#catalog.providers.find(
      (candidate) => candidate.id === offering.providerId,
    );
    if (
      provider?.regions?.length &&
      !provider.regions.includes("global") &&
      !provider.regions.includes(this.#policy.deploymentRegion)
    ) {
      reasons.push("provider.region_unavailable");
    }
    const healthSnapshot = this.#policy.providerHealth(offering.id);
    const health: ProviderRuntimeHealth = healthSnapshot.health;
    if (
      healthSnapshot.capabilitiesObserved &&
      !healthSnapshot.supportedOperations.includes(operation)
    ) {
      reasons.push("provider.operation_health_unavailable");
    }
    if (
      productEvidence &&
      healthSnapshot.revisionObserved &&
      healthSnapshot.resolvedProviderModelId !== productEvidence.resolvedProviderModelId
    ) {
      reasons.push("provider.model_revision_unverified");
    }
    if (this.#policy.requireHealthy && health !== "healthy") {
      reasons.push(
        health === "unknown" ? "provider.health_unknown" : "provider.health_unavailable",
      );
    } else if (health === "degraded" || health === "unhealthy") {
      reasons.push("provider.health_unavailable");
    }
    const statuses = await Promise.all(
      (provider?.credentialSlots ?? []).map((descriptor) =>
        this.#credentialVault.status({ providerId: offering.providerId, slot: descriptor.slot }),
      ),
    );
    if (statuses.some((status) => !status.configured)) reasons.push("credential.missing");
    return {
      offeringId,
      operation,
      available: reasons.length === 0,
      reasonCodes: [...new Set(reasons)],
      health,
      requiredEvidence: this.#policy.requiredEvidence,
      deploymentRegion: this.#policy.deploymentRegion,
    };
  }

  async resolveAll(): Promise<OfferingAvailability[]> {
    return Promise.all(
      this.#catalog.offerings.flatMap((offering) =>
        offering.operations
          .filter((operation) => operation.enabled)
          .map((operation) => this.resolve(offering.id, operation.operation)),
      ),
    );
  }
}

let runtime: OfferingAvailabilityService | undefined;

export function configureOfferingAvailabilityRuntime(
  catalog: ProviderCatalog,
  registry: ProviderRegistry,
  credentialVault: CredentialVault,
  policy: Partial<OfferingAvailabilityPolicy> = {},
): OfferingAvailabilityService {
  runtime = new OfferingAvailabilityService(catalog, registry, credentialVault, policy);
  return runtime;
}

export function getOfferingAvailabilityRuntime(): OfferingAvailabilityService {
  if (!runtime) throw new Error("provider.availability_runtime_not_configured");
  return runtime;
}

export function resetOfferingAvailabilityRuntimeForTests(): void {
  runtime = undefined;
}
