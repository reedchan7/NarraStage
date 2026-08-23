<template>
  <div class="modelOfferingPicker">
    <t-select
      :model-value="modelValue?.offeringId"
      :loading="loading"
      :disabled="disabled"
      :aria-label="$t('providerPlatform.modelAndOffering')"
      @change="handleChange">
      <t-option-group v-for="group in groups" :key="group.model.id" :label="group.model.name">
        <t-option
          v-for="offering in group.offerings"
          :key="offering.id"
          :value="offering.id"
          :label="offeringLabel(offering)"
          :disabled="!isOfferingAvailable(offering)">
          <span class="optionContent">
            <span class="optionName">{{ offeringLabel(offering) }}</span>
            <OfferingBadge :access-channel="offering.accessChannel" :lifecycle="offering.lifecycle" :support="offering.support" />
          </span>
        </t-option>
      </t-option-group>
    </t-select>
    <p v-if="errorMessage" role="alert" class="errorMessage">{{ errorMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import OfferingBadge from "./OfferingBadge.vue";
import { getProviderCatalog, type CatalogOffering, type ModelOfferingSelection, type ModelOperation, type ProviderCatalog } from "./catalog";
import { onProviderRuntimeChanged } from "@/features/providers/runtimeInvalidation";

const props = withDefaults(
  defineProps<{
    modelValue: ModelOfferingSelection | null;
    operation: ModelOperation;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [selection: ModelOfferingSelection];
}>();

const catalog = ref<ProviderCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref("");

const groups = computed(() => {
  if (!catalog.value) return [];
  return catalog.value.models
    .map((model) => ({
      model,
      offerings: catalog.value!.offerings.filter(
        (offering) =>
          offering.canonicalModelId === model.id &&
          offering.operations.some((operation) => operation.operation === props.operation && operation.enabled),
      ),
    }))
    .filter((group) => group.offerings.length > 0);
});

const providerNames = computed(() => new Map((catalog.value?.providers ?? []).map((provider) => [provider.id, provider.name])));

function offeringLabel(offering: CatalogOffering): string {
  const providerName = providerNames.value.get(offering.providerId) ?? offering.providerId;
  const availability = catalog.value?.availability.find(
    (candidate) => candidate.offeringId === offering.id && candidate.operation === props.operation,
  );
  return availability?.available ? providerName : `${providerName} · ${availability?.reasonCodes[0] ?? "provider.operation_unavailable"}`;
}

function isOfferingAvailable(offering: CatalogOffering): boolean {
  return (
    catalog.value?.availability.find((candidate) => candidate.offeringId === offering.id && candidate.operation === props.operation)?.available ===
    true
  );
}

function handleChange(value: unknown) {
  if (typeof value !== "string") return;
  const offering = catalog.value?.offerings.find((candidate) => candidate.id === value);
  if (!offering || !isOfferingAvailable(offering)) return;
  const model = catalog.value?.models.find((candidate) => candidate.id === offering.canonicalModelId);
  emit("update:modelValue", {
    canonicalModelId: offering.canonicalModelId,
    offeringId: offering.id,
    providerId: offering.providerId,
    label: `${model?.name ?? offering.canonicalModelId} · ${offeringLabel(offering)}`,
  });
}

let loadSequence = 0;

async function loadCatalog() {
  const sequence = ++loadSequence;
  loading.value = true;
  errorMessage.value = "";
  try {
    const nextCatalog = await getProviderCatalog();
    if (sequence === loadSequence) catalog.value = nextCatalog;
  } catch {
    if (sequence === loadSequence) errorMessage.value = $t("providerPlatform.loadCatalogError");
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

let disposeRuntimeListener: (() => void) | undefined;
onMounted(() => {
  disposeRuntimeListener = onProviderRuntimeChanged(loadCatalog);
  void loadCatalog();
});
onUnmounted(() => disposeRuntimeListener?.());
</script>

<style scoped>
.modelOfferingPicker {
  display: grid;
  gap: 8px;
}

.optionContent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.optionName {
  color: var(--td-text-color-primary);
}

.errorMessage {
  margin: 0;
  color: var(--td-error-color);
  font-size: 12px;
}
</style>
