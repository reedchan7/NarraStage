import {
  validateCapabilityInput,
  type CapabilityInput,
  type CapabilityViolation,
  type CapabilityWarning,
} from "@/providers/domain/capabilities";
import type { CanonicalModelId, OfferingId } from "@/providers/domain/ids";
import type { ProviderCatalog } from "@/providers/domain/models";
import type { Operation } from "@/providers/domain/operations";
import {
  estimateCost,
  type CostEstimate,
  type FxSnapshot,
  type PriceUsage,
} from "@/providers/domain/pricing";
import { selectOffering, type OfferingSelectionRequest } from "@/providers/policy/offeringPolicy";
import {
  offeringAvailabilityKey,
  type OfferingAvailability,
} from "@/providers/availability/offeringAvailability";

export interface PreflightRequest {
  schemaVersion: "2.0.0";
  canonicalModelId: CanonicalModelId;
  operation: Operation;
  input: CapabilityInput;
  offeringPreference: OfferingSelectionRequest;
  displayCurrency: string;
  hasContinuation?: boolean;
}

export interface PreflightOfferingResult {
  offeringId: OfferingId;
  providerId: string;
  accessChannel: "official" | "aggregator" | "compatibility";
  eligible: boolean;
  violations: CapabilityViolation[];
  warnings: CapabilityWarning[];
  cost?: CostEstimate;
}

export interface PreflightResult {
  schemaVersion: "2.0.0";
  canonicalModelId: CanonicalModelId;
  operation: Operation;
  offerings: PreflightOfferingResult[];
  selection:
    | {
        status: "selected";
        offeringId: OfferingId;
        reasonCodes: string[];
      }
    | {
        status: "unavailable";
        reasonCodes: string[];
      };
}

export const builtinCnyFxSnapshot: FxSnapshot = {
  baseCurrency: "USD",
  quoteCurrency: "CNY",
  rate: "6.7817",
  sourceUrl: "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do",
  asOf: "2026-08-21",
  expiresAt: "2026-08-25T00:00:00+08:00",
};

function priceUsage(input: CapabilityInput): PriceUsage | undefined {
  const resolution = input.values.resolution;
  const outputSeconds = input.values.durationSeconds;
  if (typeof resolution !== "string" || !Number.isInteger(outputSeconds)) return undefined;

  return {
    resolution,
    outputSeconds: outputSeconds as number,
    inputImages: input.assets.filter((asset) => asset.kind === "image").length,
    referenceVideoSeconds: input.assets
      .filter((asset) => asset.role === "reference_video")
      .reduce((total, asset) => total + (asset.durationSeconds ?? 0), 0),
    inputAudioSeconds: input.assets
      .filter((asset) => asset.role === "reference_audio")
      .reduce((total, asset) => total + (asset.durationSeconds ?? 0), 0),
  };
}

export function preflightRequest(
  request: PreflightRequest,
  options: {
    catalog: ProviderCatalog;
    at: string;
    fx?: FxSnapshot;
    availability?: ReadonlyMap<string, Pick<OfferingAvailability, "available" | "reasonCodes">>;
  },
): PreflightResult {
  const matchingOfferings = options.catalog.offerings.filter(
    (offering) =>
      offering.canonicalModelId === request.canonicalModelId &&
      offering.operations.some(
        (operation) => operation.operation === request.operation && operation.enabled,
      ),
  );
  const usage = priceUsage(request.input);
  const offeringResults = matchingOfferings.map((offering) => {
    const operation = offering.operations.find(
      (candidate) => candidate.operation === request.operation,
    );
    const capability = options.catalog.capabilitySchemas.find(
      (candidate) => candidate.id === operation?.capabilitySchemaId,
    );
    if (!capability) {
      return {
        offeringId: offering.id,
        providerId: offering.providerId,
        accessChannel: offering.accessChannel,
        eligible: false,
        violations: [
          {
            code: "capability.schema_missing",
            path: "",
            message: "Offering capability schema is unavailable",
          },
        ],
        warnings: [],
      };
    }
    const validation = validateCapabilityInput(capability, request.input, {
      hasContinuation: request.hasContinuation,
    });
    const availability = options.availability?.get(
      offeringAvailabilityKey(offering.id, request.operation),
    );
    const availabilityViolations =
      availability && !availability.available
        ? availability.reasonCodes.map((code) => ({
            code,
            path: "",
            message: `Offering is unavailable: ${code}`,
          }))
        : [];
    const priceSnapshot = options.catalog.priceSnapshots.find(
      (snapshot) =>
        snapshot.id === offering.priceSnapshotId && snapshot.operation === request.operation,
    );
    const cost =
      usage && priceSnapshot
        ? estimateCost(
            priceSnapshot,
            usage,
            request.displayCurrency,
            options.fx ?? builtinCnyFxSnapshot,
            options.at,
          )
        : undefined;

    return {
      offeringId: offering.id,
      providerId: offering.providerId,
      accessChannel: offering.accessChannel,
      eligible: validation.violations.length === 0 && availabilityViolations.length === 0,
      violations: [...validation.violations, ...availabilityViolations],
      warnings: validation.warnings,
      ...(cost ? { cost } : {}),
    };
  });

  const selection = selectOffering(
    request.offeringPreference,
    offeringResults.map((offering, index) => ({
      offeringId: offering.offeringId,
      eligible: offering.eligible,
      rejectionCodes: offering.violations.map((violation) => violation.code),
      priority: index,
      cost: offering.cost,
    })),
  );

  return {
    schemaVersion: "2.0.0",
    canonicalModelId: request.canonicalModelId,
    operation: request.operation,
    offerings: offeringResults,
    selection,
  };
}
