<template>
  <section v-if="preflight" class="comparison" aria-labelledby="h3-comparison-title">
    <header>
      <div>
        <h3 id="h3-comparison-title">{{ $t("providerPlatform.h3.comparisonTitle") }}</h3>
        <p>{{ $t("providerPlatform.h3.comparisonDescription") }}</p>
      </div>
      <span>{{ resolution }}</span>
    </header>
    <div class="offeringGrid">
      <article
        v-for="candidate in candidates"
        :key="candidate.offering.id"
        :data-selected="candidate.offering.id === selectedOfferingId"
        :data-eligible="candidate.result.eligible">
        <div class="offeringHeader">
          <strong>{{ providerName(candidate.offering.providerId) }}</strong>
          <span>{{ accessLabel(candidate.offering.accessChannel) }}</span>
        </div>
        <p class="delivery">{{ deliveryLabel(candidate.offering) }}</p>
        <template v-if="candidate.result.cost">
          <strong class="price">{{ displayPrice(candidate.result.cost) }}</strong>
          <small>
            {{ candidate.result.cost.originalTotal.currency }}
            {{ candidate.result.cost.originalTotal.amount }}
          </small>
          <a :href="candidate.result.cost.priceSourceUrl" target="_blank" rel="noopener noreferrer">
            {{ $t("providerPlatform.h3.priceSource") }} · {{ candidate.result.cost.priceAsOf }}
          </a>
          <ul v-if="candidate.result.cost.issues.length" class="issues">
            <li v-for="issue in candidate.result.cost.issues" :key="issue">{{ issueLabel(issue) }}</li>
          </ul>
        </template>
        <p v-if="candidate.result.violations.length" class="ineligible">
          {{ candidate.result.violations[0]?.message }}
        </p>
        <button type="button" :disabled="!candidate.result.eligible" @click="$emit('select', candidate.offering.id)">
          {{ candidate.offering.id === selectedOfferingId ? $t("providerPlatform.h3.selectedOffering") : $t("providerPlatform.h3.useOffering") }}
        </button>
      </article>
    </div>
    <p v-if="qualityMismatch" role="alert" class="comparisonWarning">
      {{ $t("providerPlatform.h3.qualityMismatch") }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CatalogOffering, PreflightResult, ProviderCatalog } from "@/features/models/catalog";

const props = defineProps<{
  catalog: ProviderCatalog;
  preflight: PreflightResult | null;
  selectedOfferingId: string;
  resolution: string;
}>();

defineEmits<{ select: [offeringId: string] }>();

const candidates = computed(() =>
  (props.preflight?.offerings ?? [])
    .map((result) => ({
      result,
      offering: props.catalog.offerings.find((candidate) => candidate.id === result.offeringId),
    }))
    .filter((candidate): candidate is { result: PreflightResult["offerings"][number]; offering: CatalogOffering } => Boolean(candidate.offering)),
);

const qualityMismatch = computed(() => props.preflight?.selection.reasonCodes.includes("policy.quality_profile_mismatch"));

function providerName(providerId: string): string {
  return props.catalog.providers.find((provider) => provider.id === providerId)?.name ?? providerId;
}

function accessLabel(channel: CatalogOffering["accessChannel"]): string {
  return $t(`providerPlatform.${channel}`);
}

function deliveryLabel(offering: CatalogOffering): string {
  const profile = offering.operations
    .find((operation) => operation.operation === "video.generate")
    ?.outputProfiles?.find((candidate) => candidate.resolution === props.resolution);
  if (!profile) return "—";
  if (profile.delivery === "native") return $t("providerPlatform.h3.delivery.native");
  if (profile.delivery === "regenerated") return $t("providerPlatform.h3.delivery.regenerated");
  if (profile.delivery === "provider_managed") return $t("providerPlatform.h3.delivery.provider_managed");
  return $t("providerPlatform.h3.delivery.upscaled", { source: profile.sourceResolution });
}

function displayPrice(cost: NonNullable<PreflightResult["offerings"][number]["cost"]>): string {
  const total = cost.displayTotal ?? cost.originalTotal;
  return `${total.currency} ${total.amount}`;
}

function issueLabel(issue: string): string {
  return $t(`providerPlatform.h3.priceIssue.${issue}`);
}
</script>

<style scoped>
.comparison {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
}

header,
.offeringHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h3,
p,
ul {
  margin: 0;
}

h3 {
  font-size: 14px;
}

header p,
header > span,
.offeringHeader span,
.delivery,
small,
a {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.offeringGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

article {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 7px;
}

article[data-selected="true"] {
  border-color: var(--td-brand-color);
}

.price {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

a {
  width: fit-content;
}

button {
  justify-self: start;
  padding: 6px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-primary);
}

button:disabled {
  color: var(--td-text-color-disabled);
}

.issues,
.ineligible,
.comparisonWarning {
  padding-left: 18px;
  color: var(--td-warning-color);
  font-size: 12px;
}

.ineligible,
.comparisonWarning {
  padding: 0;
}

@media (max-width: 900px) {
  .offeringGrid {
    grid-template-columns: 1fr;
  }
}
</style>
