<template>
  <div class="capabilityForm">
    <fieldset v-if="capability.assetModes?.length" class="modeGroup">
      <legend>{{ $t("providerPlatform.inputMode") }}</legend>
      <div class="modeButtons">
        <button
          v-for="mode in capability.assetModes"
          :key="mode.id"
          type="button"
          :data-mode="mode.id"
          :aria-pressed="modelValue.mode === mode.id"
          @click="selectMode(mode.id)">
          {{ mode.label }}
        </button>
      </div>
    </fieldset>

    <template v-for="field in publicFields" :key="field.path">
      <label class="field">
        <span>
          {{ field.label }}
          <span v-if="field.required" aria-hidden="true">*</span>
        </span>
        <select
          v-if="field.kind === 'enum' || field.allowedValues?.length"
          :value="fieldValue(field.path)"
          :required="field.required"
          @change="updateFromEvent(field, $event)">
          <option v-for="value in field.allowedValues ?? field.enumValues" :key="String(value)" :value="value">
            {{ value }}
          </option>
        </select>
        <input
          v-else-if="field.kind === 'integer'"
          type="number"
          :value="fieldValue(field.path)"
          :required="field.required"
          :min="field.minimum"
          :max="field.maximum"
          @input="updateFromEvent(field, $event)" />
        <input
          v-else-if="field.kind === 'boolean'"
          type="checkbox"
          :checked="fieldValue(field.path) === true"
          @change="updateFromEvent(field, $event)" />
        <textarea v-else :value="textFieldValue(field.path)" :required="field.required" @input="updateFromEvent(field, $event)" />
        <small v-if="field.unit">{{ field.unit }}</small>
      </label>
    </template>

    <details v-if="advancedFields.length" class="advancedFields">
      <summary>{{ $t("providerPlatform.advancedOptions") }}</summary>
      <label v-for="field in advancedFields" :key="field.path" class="field">
        <span>{{ field.label }}</span>
        <select v-if="field.kind === 'enum' || field.allowedValues?.length" :value="fieldValue(field.path)" @change="updateFromEvent(field, $event)">
          <option v-for="value in field.allowedValues ?? field.enumValues" :key="String(value)" :value="value">{{ value }}</option>
        </select>
        <input
          v-else-if="field.kind === 'integer'"
          type="number"
          :value="fieldValue(field.path)"
          :min="field.minimum"
          :max="field.maximum"
          @input="updateFromEvent(field, $event)" />
        <input
          v-else-if="field.kind === 'boolean'"
          type="checkbox"
          :checked="fieldValue(field.path) === true"
          @change="updateFromEvent(field, $event)" />
        <input v-else :value="fieldValue(field.path)" @input="updateFromEvent(field, $event)" />
      </label>
    </details>

    <section v-if="selectedMode" class="assetRoles" :aria-label="$t('providerPlatform.acceptedAssets')">
      <h4>{{ $t("providerPlatform.acceptedAssets") }}</h4>
      <div v-for="role in selectedMode.roles" :key="role.role" class="assetRole">
        <span>{{ role.role }}</span>
        <small>{{ role.kinds.join(" / ") }} · {{ role.minimum }}–{{ role.maximum }}</small>
      </div>
    </section>

    <ul v-if="violations.length" role="alert" class="violations">
      <li v-for="violation in violations" :key="`${violation.code}:${violation.path}`">
        <code>{{ violation.code }}</code>
        {{ violation.message }}
      </li>
    </ul>
    <ul v-if="warnings.length" class="warnings">
      <li v-for="warning in warnings" :key="`${warning.code}:${warning.path ?? ''}`">
        {{ warning.message }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CapabilityInput, CapabilityViolation, CapabilityWarning, CatalogCapability } from "@/features/models/catalog";

type CapabilityField = CatalogCapability["fields"][number];

const props = withDefaults(
  defineProps<{
    capability: CatalogCapability;
    modelValue: CapabilityInput;
    violations?: CapabilityViolation[];
    warnings?: CapabilityWarning[];
    hiddenFields?: string[];
  }>(),
  {
    violations: () => [],
    warnings: () => [],
    hiddenFields: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: CapabilityInput];
}>();

const hiddenFields = computed(() => new Set(props.hiddenFields));
const selectedMode = computed(() => props.capability.assetModes?.find((mode) => mode.id === props.modelValue.mode));
const effectiveFields = computed(() =>
  props.capability.fields.map((field) => {
    const rule = selectedMode.value?.fieldRules?.find((candidate) => candidate.path === field.path);
    return rule ? { ...field, ...rule } : field;
  }),
);
const publicFields = computed(() => effectiveFields.value.filter((field) => !field.advanced && !hiddenFields.value.has(field.path)));
const advancedFields = computed(() => effectiveFields.value.filter((field) => field.advanced && !hiddenFields.value.has(field.path)));

function fieldValue(path: string): string | number | boolean {
  const value = props.modelValue.values[path];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : "";
}

function textFieldValue(path: string): string | number {
  const value = fieldValue(path);
  return typeof value === "boolean" ? String(value) : value;
}

function selectMode(mode: string) {
  emit("update:modelValue", {
    ...props.modelValue,
    mode,
  });
}

function updateFromEvent(field: CapabilityField, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const value = field.kind === "integer" ? Number(target.value) : field.kind === "boolean" ? (target as HTMLInputElement).checked : target.value;
  emit("update:modelValue", {
    ...props.modelValue,
    values: {
      ...props.modelValue.values,
      [field.path]: value,
    },
  });
}
</script>

<style scoped>
.capabilityForm {
  display: grid;
  gap: 16px;
}

.modeGroup,
.assetRoles {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
}

.modeButtons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modeButtons button {
  padding: 6px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}

.modeButtons button[aria-pressed="true"] {
  border-color: var(--td-brand-color);
  color: var(--td-brand-color);
}

.field {
  display: grid;
  gap: 6px;
}

.field input,
.field select,
.field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}

.assetRoles h4 {
  margin: 0 0 8px;
}

.assetRole {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.violations,
.warnings {
  margin: 0;
  padding-left: 20px;
}

.violations {
  color: var(--td-error-color);
}

.warnings {
  color: var(--td-warning-color);
}
</style>
