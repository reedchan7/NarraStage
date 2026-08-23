<template>
  <span class="offeringBadges" :aria-label="ariaLabel">
    <t-tag size="small" variant="light">{{ $t(channelKey) }}</t-tag>
    <t-tag v-if="lifecycle !== 'stable'" size="small" variant="light" theme="warning">
      {{ lifecycle }}
    </t-tag>
    <t-tag v-if="support.implementation === 'declared'" size="small" variant="light">
      {{ $t("providerPlatform.contractOnly") }}
    </t-tag>
    <t-tag v-else-if="!support.evidence.includes('live_verified')" size="small" variant="light">
      {{ $t("providerPlatform.liveUnverified") }}
    </t-tag>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CatalogOffering } from "./catalog";

const props = defineProps<{
  accessChannel: CatalogOffering["accessChannel"];
  lifecycle: CatalogOffering["lifecycle"];
  support: CatalogOffering["support"];
}>();

const channelKey = computed(() => {
  if (props.accessChannel === "official") return "providerPlatform.official";
  if (props.accessChannel === "aggregator") return "providerPlatform.aggregator";
  return "providerPlatform.compatibility";
});

const ariaLabel = computed(() => [$t(channelKey.value), props.lifecycle, props.support.implementation, ...props.support.evidence].join(", "));
</script>

<style scoped>
.offeringBadges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
