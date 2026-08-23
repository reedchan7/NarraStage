import { z } from "zod";
import { offeringIdSchema, type OfferingId } from "@/providers/domain/ids";
import { operationSchema, type Operation } from "@/providers/domain/operations";

export type PriceMeter =
  | "output_video_second"
  | "input_image"
  | "input_reference_video_second"
  | "input_audio_second"
  | "provider_compute_second";

export type PriceCoverage = "included" | "metered" | "unknown";

export interface PriceRate {
  meter: PriceMeter;
  unitPrice: string;
  includedUnits?: number;
  selector?: {
    resolution?: string;
  };
}

export interface PriceSnapshot {
  id: string;
  offeringId: OfferingId;
  operation: Operation;
  currency: string;
  pricingModel: "request_meters" | "provider_compute";
  rates: PriceRate[];
  coverage: {
    inputImage: PriceCoverage;
    referenceVideo: PriceCoverage;
    inputAudio: PriceCoverage;
  };
  comparisonBasisByResolution?: Readonly<Record<string, string | undefined>>;
  sourceUrl: string;
  sourceScope: "public" | "account" | "contract";
  asOf: string;
  expiresAt: string;
}

export const priceMeterSchema = z.enum([
  "output_video_second",
  "input_image",
  "input_reference_video_second",
  "input_audio_second",
  "provider_compute_second",
]);

export const priceRateSchema = z
  .object({
    meter: priceMeterSchema,
    unitPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
    includedUnits: z.number().int().nonnegative().optional(),
    selector: z
      .object({
        resolution: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const priceSnapshotSchema = z
  .object({
    id: z.string().min(1),
    offeringId: offeringIdSchema,
    operation: operationSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    pricingModel: z.enum(["request_meters", "provider_compute"]),
    rates: z.array(priceRateSchema),
    coverage: z
      .object({
        inputImage: z.enum(["included", "metered", "unknown"]),
        referenceVideo: z.enum(["included", "metered", "unknown"]),
        inputAudio: z.enum(["included", "metered", "unknown"]),
      })
      .strict(),
    comparisonBasisByResolution: z.record(z.string(), z.string().min(1)).optional(),
    sourceUrl: z.string().url(),
    sourceScope: z.enum(["public", "account", "contract"]),
    asOf: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export interface FxSnapshot {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  sourceUrl: string;
  asOf: string;
  expiresAt: string;
}

export const fxSnapshotSchema = z
  .object({
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    quoteCurrency: z.string().regex(/^[A-Z]{3}$/),
    rate: z.string().regex(/^\d+(?:\.\d+)?$/),
    sourceUrl: z.string().url(),
    asOf: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export interface PriceUsage {
  resolution: string;
  outputSeconds: number;
  inputImages: number;
  referenceVideoSeconds: number;
  inputAudioSeconds: number;
}

export interface Money {
  currency: string;
  amount: string;
}

export interface CostComponent {
  meter: PriceMeter;
  quantity: string;
  unitPrice: Money;
  amount: Money;
}

export interface CostEstimate {
  offeringId: OfferingId;
  status: "complete" | "incomplete";
  originalTotal: Money;
  displayTotal?: Money;
  components: CostComponent[];
  issues: string[];
  priceAsOf: string;
  priceSourceUrl: string;
  fx?: FxSnapshot;
  comparisonBasis?: string;
}

const moneySchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  })
  .strict();

export const costEstimateSchema = z
  .object({
    offeringId: offeringIdSchema,
    status: z.enum(["complete", "incomplete"]),
    originalTotal: moneySchema,
    displayTotal: moneySchema.optional(),
    components: z.array(
      z
        .object({
          meter: priceMeterSchema,
          quantity: z.string().regex(/^\d+(?:\.\d+)?$/),
          unitPrice: moneySchema,
          amount: moneySchema,
        })
        .strict(),
    ),
    issues: z.array(z.string()),
    priceAsOf: z.string().min(1),
    priceSourceUrl: z.string().url(),
    fx: fxSnapshotSchema.optional(),
    comparisonBasis: z.string().min(1).optional(),
  })
  .strict();

export type CostComparison =
  | {
      comparable: true;
      cheaperOfferingId?: OfferingId;
      reason: "lower_estimated_cost" | "equal_estimated_cost";
    }
  | {
      comparable: false;
      reason:
        | "estimate_incomplete"
        | "display_currency_mismatch"
        | "insufficient_estimates"
        | "quality_profile_mismatch";
    };

interface Decimal {
  coefficient: bigint;
  scale: number;
}

function parseDecimal(value: string): Decimal {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`invalid decimal: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  return {
    coefficient: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function align(left: Decimal, right: Decimal): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * 10n ** BigInt(scale - left.scale),
    right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  ];
}

function add(left: Decimal, right: Decimal): Decimal {
  const [leftCoefficient, rightCoefficient, scale] = align(left, right);
  return {
    coefficient: leftCoefficient + rightCoefficient,
    scale,
  };
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return {
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  };
}

function multiplyInteger(value: Decimal, quantity: number): Decimal {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`price quantity must be a non-negative integer: ${quantity}`);
  }
  return {
    coefficient: value.coefficient * BigInt(quantity),
    scale: value.scale,
  };
}

function formatDecimal(value: Decimal, fractionDigits: number): string {
  let coefficient = value.coefficient;
  if (value.scale > fractionDigits) {
    const divisor = 10n ** BigInt(value.scale - fractionDigits);
    const remainder = coefficient % divisor;
    coefficient /= divisor;
    if (remainder * 2n >= divisor) coefficient += 1n;
  } else if (value.scale < fractionDigits) {
    coefficient *= 10n ** BigInt(fractionDigits - value.scale);
  }
  const digits = coefficient.toString().padStart(fractionDigits + 1, "0");
  if (fractionDigits === 0) return digits;
  return `${digits.slice(0, -fractionDigits)}.${digits.slice(-fractionDigits)}`;
}

function rateFor(
  snapshot: PriceSnapshot,
  meter: PriceMeter,
  resolution: string,
): PriceRate | undefined {
  return snapshot.rates.find(
    (rate) =>
      rate.meter === meter &&
      (!rate.selector?.resolution || rate.selector.resolution === resolution),
  );
}

export function estimateCost(
  snapshot: PriceSnapshot,
  usage: PriceUsage,
  displayCurrency: string,
  fx: FxSnapshot | undefined,
  at: string,
): CostEstimate {
  const issues: string[] = [];
  const components: CostComponent[] = [];
  let total = parseDecimal("0");

  const addComponent = (meter: PriceMeter, quantity: number, rate: PriceRate) => {
    const unitPrice = parseDecimal(rate.unitPrice);
    const amount = multiplyInteger(unitPrice, quantity);
    total = add(total, amount);
    components.push({
      meter,
      quantity: String(quantity),
      unitPrice: {
        currency: snapshot.currency,
        amount: rate.unitPrice,
      },
      amount: {
        currency: snapshot.currency,
        amount: formatDecimal(amount, 2),
      },
    });
  };

  if (new Date(at).getTime() > new Date(snapshot.expiresAt).getTime()) {
    issues.push("price.snapshot_stale");
  }

  if (snapshot.pricingModel === "provider_compute") {
    issues.push("price.compute_conversion_unknown");
  } else {
    const outputRate = rateFor(snapshot, "output_video_second", usage.resolution);
    if (!outputRate) issues.push("price.output_rate_missing");
    else addComponent("output_video_second", usage.outputSeconds, outputRate);

    const imageRate = rateFor(snapshot, "input_image", usage.resolution);
    if (usage.inputImages > 0 && snapshot.coverage.inputImage === "unknown") {
      issues.push("price.input_image_unknown");
    } else if (usage.inputImages > 0 && snapshot.coverage.inputImage === "metered") {
      if (!imageRate) issues.push("price.input_image_rate_missing");
      else {
        addComponent(
          "input_image",
          Math.max(0, usage.inputImages - (imageRate.includedUnits ?? 0)),
          imageRate,
        );
      }
    }

    const referenceVideoRate = rateFor(snapshot, "input_reference_video_second", usage.resolution);
    if (usage.referenceVideoSeconds > 0 && snapshot.coverage.referenceVideo === "unknown") {
      issues.push("price.reference_video_unknown");
    } else if (usage.referenceVideoSeconds > 0 && snapshot.coverage.referenceVideo === "metered") {
      if (!referenceVideoRate) issues.push("price.reference_video_rate_missing");
      else {
        addComponent(
          "input_reference_video_second",
          usage.referenceVideoSeconds,
          referenceVideoRate,
        );
      }
    }

    const audioRate = rateFor(snapshot, "input_audio_second", usage.resolution);
    if (usage.inputAudioSeconds > 0 && snapshot.coverage.inputAudio === "unknown") {
      issues.push("price.input_audio_unknown");
    } else if (usage.inputAudioSeconds > 0 && snapshot.coverage.inputAudio === "metered") {
      if (!audioRate) issues.push("price.input_audio_rate_missing");
      else addComponent("input_audio_second", usage.inputAudioSeconds, audioRate);
    }
  }

  const originalTotal = {
    currency: snapshot.currency,
    amount: formatDecimal(total, 2),
  };
  let displayTotal: Money | undefined;
  let appliedFx: FxSnapshot | undefined;

  if (displayCurrency === snapshot.currency) {
    displayTotal = originalTotal;
  } else if (fx && fx.baseCurrency === snapshot.currency && fx.quoteCurrency === displayCurrency) {
    appliedFx = fx;
    if (new Date(at).getTime() > new Date(fx.expiresAt).getTime()) {
      issues.push("price.fx_stale");
    }
    displayTotal = {
      currency: displayCurrency,
      amount: formatDecimal(multiply(total, parseDecimal(fx.rate)), 2),
    };
  } else {
    issues.push("price.fx_missing");
  }

  return {
    offeringId: snapshot.offeringId,
    status: issues.length === 0 ? "complete" : "incomplete",
    originalTotal,
    displayTotal,
    components,
    issues,
    priceAsOf: snapshot.asOf,
    priceSourceUrl: snapshot.sourceUrl,
    ...(appliedFx ? { fx: appliedFx } : {}),
    ...(snapshot.comparisonBasisByResolution?.[usage.resolution]
      ? { comparisonBasis: snapshot.comparisonBasisByResolution[usage.resolution] }
      : {}),
  };
}

export function compareCostEstimates(estimates: CostEstimate[]): CostComparison {
  if (estimates.some((estimate) => estimate.status !== "complete")) {
    return { comparable: false, reason: "estimate_incomplete" };
  }
  if (estimates.length < 2) {
    return { comparable: false, reason: "insufficient_estimates" };
  }
  const comparisonBasis = estimates[0].comparisonBasis;
  if (estimates.some((estimate) => estimate.comparisonBasis !== comparisonBasis)) {
    return { comparable: false, reason: "quality_profile_mismatch" };
  }
  const currency = estimates[0].displayTotal?.currency;
  if (!currency || estimates.some((estimate) => estimate.displayTotal?.currency !== currency)) {
    return { comparable: false, reason: "display_currency_mismatch" };
  }

  const sorted = [...estimates].sort((left, right) => {
    const [leftAmount, rightAmount] = align(
      parseDecimal(left.displayTotal!.amount),
      parseDecimal(right.displayTotal!.amount),
    );
    return leftAmount < rightAmount ? -1 : leftAmount > rightAmount ? 1 : 0;
  });
  const [lowest, next] = sorted;
  if (lowest.displayTotal?.amount === next.displayTotal?.amount) {
    return { comparable: true, reason: "equal_estimated_cost" };
  }
  return {
    comparable: true,
    cheaperOfferingId: lowest.offeringId,
    reason: "lower_estimated_cost",
  };
}
