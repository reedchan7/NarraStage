import type { OfferingId } from "@/providers/domain/ids";
import { compareCostEstimates, type CostEstimate } from "@/providers/domain/pricing";

export type OfferingSelectionRequest =
  | {
      mode: "pinned";
      offeringId: OfferingId;
    }
  | {
      mode: "auto";
      profile: "balanced" | "lowest_cost";
    };

export interface OfferingCandidate {
  offeringId: OfferingId;
  eligible: boolean;
  rejectionCodes?: string[];
  priority: number;
  latencyMs?: number;
  cost?: CostEstimate;
}

export type OfferingSelection =
  | {
      status: "selected";
      offeringId: OfferingId;
      reasonCodes: string[];
    }
  | {
      status: "unavailable";
      reasonCodes: string[];
    };

function stablePriority(candidates: OfferingCandidate[]): OfferingCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      left.priority - right.priority ||
      (left.latencyMs ?? Number.POSITIVE_INFINITY) -
        (right.latencyMs ?? Number.POSITIVE_INFINITY) ||
      left.offeringId.localeCompare(right.offeringId),
  );
}

export function selectOffering(
  request: OfferingSelectionRequest,
  candidates: OfferingCandidate[],
): OfferingSelection {
  if (request.mode === "pinned") {
    const pinned = candidates.find((candidate) => candidate.offeringId === request.offeringId);
    if (!pinned) {
      return { status: "unavailable", reasonCodes: ["offering.not_found"] };
    }
    if (!pinned.eligible) {
      return {
        status: "unavailable",
        reasonCodes: pinned.rejectionCodes?.length
          ? pinned.rejectionCodes
          : ["offering.unavailable"],
      };
    }
    return {
      status: "selected",
      offeringId: pinned.offeringId,
      reasonCodes: ["policy.explicit_pin"],
    };
  }

  const eligible = candidates.filter((candidate) => candidate.eligible);
  if (eligible.length === 0) {
    return {
      status: "unavailable",
      reasonCodes: [
        ...new Set(candidates.flatMap((candidate) => candidate.rejectionCodes ?? [])),
      ].sort(),
    };
  }

  if (request.profile === "lowest_cost") {
    const costs = eligible.map((candidate) => candidate.cost).filter(Boolean) as CostEstimate[];
    if (costs.length !== eligible.length) {
      return {
        status: "unavailable",
        reasonCodes: ["policy.cost_estimate_missing"],
      };
    }
    const comparison = compareCostEstimates(costs);
    if (!comparison.comparable) {
      return {
        status: "unavailable",
        reasonCodes: [`policy.${comparison.reason}`],
      };
    }
    if (comparison.cheaperOfferingId) {
      return {
        status: "selected",
        offeringId: comparison.cheaperOfferingId,
        reasonCodes: ["policy.lower_estimated_cost"],
      };
    }
  }

  const [selected] = stablePriority(eligible);
  return {
    status: "selected",
    offeringId: selected.offeringId,
    reasonCodes: [
      request.profile === "balanced" ? "policy.balanced_priority" : "policy.equal_estimated_cost",
    ],
  };
}
