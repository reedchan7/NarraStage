<template>
  <section class="h3Form" aria-labelledby="h3-form-title">
    <header class="formHeader">
      <div>
        <h3 id="h3-form-title">{{ $t("providerPlatform.h3.title") }}</h3>
        <p>{{ $t("providerPlatform.h3.description") }}</p>
      </div>
      <span class="providerLabel">{{ offering.providerId === "fal" ? "fal.ai" : "MiniMax" }}</span>
    </header>

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
          {{ modeLabel(mode.id) }}
        </button>
      </div>
    </fieldset>

    <label v-if="showPrompt" class="field promptField">
      <span>{{ $t("providerPlatform.h3.prompt") }}</span>
      <textarea
        :value="fieldValue('prompt')"
        :maxlength="field('prompt')?.maximumLength"
        rows="5"
        @input="updateValue('prompt', ($event.target as HTMLTextAreaElement).value)" />
    </label>

    <div class="parameterGrid">
      <label class="field">
        <span>{{ $t("workbench.generate.duration") }}</span>
        <input
          type="number"
          :value="fieldValue('durationSeconds')"
          :min="field('durationSeconds')?.minimum"
          :max="field('durationSeconds')?.maximum"
          step="1"
          @input="updateInteger('durationSeconds', $event)" />
        <small>{{ field("durationSeconds")?.minimum }}–{{ field("durationSeconds")?.maximum }}s</small>
      </label>

      <label class="field">
        <span>{{ $t("workbench.generate.resolution") }}</span>
        <select :value="fieldValue('resolution')" @change="updateSelect('resolution', $event)">
          <option v-for="resolution in enumValues('resolution')" :key="resolution" :value="resolution">
            {{ resolution }}
          </option>
        </select>
      </label>

      <label v-if="enumValues('aspectRatio').length" class="field">
        <span>{{ $t("providerPlatform.h3.aspectRatio") }}</span>
        <select :value="fieldValue('aspectRatio')" @change="updateSelect('aspectRatio', $event)">
          <option v-for="ratio in enumValues('aspectRatio')" :key="ratio" :value="ratio">
            {{ ratio === "adaptive" ? $t("providerPlatform.h3.adaptive") : ratio }}
          </option>
        </select>
      </label>
    </div>

    <p v-if="outputProfile" class="qualityNote" :data-delivery="outputProfile.delivery">
      {{ qualityLabel(outputProfile) }}
    </p>

    <section v-if="selectedMode?.roles.length" class="assetContract" :aria-label="$t('providerPlatform.acceptedAssets')">
      <div class="sectionTitle">
        <h4>{{ $t("providerPlatform.h3.materialContract") }}</h4>
        <span>{{ assets.length }} / {{ selectedMode.maximumTotalAssets ?? "—" }}</span>
      </div>
      <ul>
        <li v-for="role in selectedMode.roles" :key="role.role">
          <span>{{ roleLabel(role.role) }}</span>
          <small>{{ assets.filter((asset) => asset.role === role.role).length }} / {{ role.maximum }} · {{ role.kinds.join(" / ") }}</small>
        </li>
      </ul>
      <p v-if="selectedMode.requiresAnyRole?.length" class="contractHint">
        {{ $t("providerPlatform.h3.audioRequiresVisual") }}
      </p>
    </section>

    <details v-if="advancedFields.length" class="advancedFields">
      <summary>{{ $t("providerPlatform.advancedOptions") }}</summary>
      <div class="advancedGrid">
        <label v-for="advancedField in advancedFields" :key="advancedField.path" class="field">
          <span>{{ advancedLabel(advancedField.path) }}</span>
          <input
            v-if="advancedField.kind === 'boolean'"
            type="checkbox"
            :checked="booleanValue(advancedField.path)"
            @change="updateValue(advancedField.path, ($event.target as HTMLInputElement).checked)" />
          <select
            v-else-if="advancedField.kind === 'enum'"
            :value="fieldValue(advancedField.path)"
            @change="updateSelect(advancedField.path, $event)">
            <option value="">—</option>
            <option v-for="value in advancedField.enumValues" :key="value" :value="value">{{ value }}</option>
          </select>
          <input v-else type="number" :value="fieldValue(advancedField.path)" @input="updateInteger(advancedField.path, $event)" />
        </label>
      </div>
    </details>

    <ul v-if="violations.length" role="alert" class="violations">
      <li v-for="violation in violations" :key="`${violation.code}:${violation.path}`">
        {{ violation.message }}
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CapabilityInput, CapabilityViolation, CatalogCapability, CatalogOffering } from "@/features/models/catalog";

type CapabilityField = CatalogCapability["fields"][number];
type OutputProfile = NonNullable<CatalogOffering["operations"][number]["outputProfiles"]>[number];

const props = withDefaults(
  defineProps<{
    capability: CatalogCapability;
    offering: CatalogOffering;
    modelValue: CapabilityInput;
    assets?: CapabilityInput["assets"];
    violations?: CapabilityViolation[];
    showPrompt?: boolean;
  }>(),
  {
    assets: () => [],
    violations: () => [],
    showPrompt: true,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: CapabilityInput] }>();

const selectedMode = computed(() => props.capability.assetModes?.find((mode) => mode.id === props.modelValue.mode));
const advancedFields = computed(() => props.capability.fields.filter((candidate) => candidate.advanced));
const outputProfile = computed(() =>
  props.offering.operations
    .find((operation) => operation.operation === "video.generate")
    ?.outputProfiles?.find((profile) => profile.resolution === props.modelValue.values.resolution),
);

function field(path: string): CapabilityField | undefined {
  const base = props.capability.fields.find((candidate) => candidate.path === path);
  const rule = selectedMode.value?.fieldRules?.find((candidate) => candidate.path === path);
  return base ? { ...base, ...rule } : undefined;
}

function enumValues(path: string): string[] {
  return field(path)?.enumValues ?? [];
}

function fieldValue(path: string): string | number {
  const value = props.modelValue.values[path];
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function booleanValue(path: string): boolean {
  return props.modelValue.values[path] === true;
}

function updateValue(path: string, value: unknown) {
  emit("update:modelValue", {
    ...props.modelValue,
    values: { ...props.modelValue.values, [path]: value },
  });
}

function updateInteger(path: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  updateValue(path, raw === "" ? undefined : Number(raw));
}

function updateSelect(path: string, event: Event) {
  updateValue(path, (event.target as HTMLSelectElement).value);
}

function selectMode(mode: string) {
  const nextMode = props.capability.assetModes?.find((candidate) => candidate.id === mode);
  const nextValues = { ...props.modelValue.values };
  for (const rule of nextMode?.fieldRules ?? []) {
    if (rule.enumValues?.length && !rule.enumValues.includes(String(nextValues[rule.path] ?? ""))) {
      nextValues[rule.path] = rule.enumValues[0];
    }
  }
  emit("update:modelValue", { ...props.modelValue, mode, values: nextValues, assets: [] });
}

function modeLabel(mode: string): string {
  return $t(`providerPlatform.h3.mode.${mode}`);
}

function roleLabel(role: string): string {
  return $t(`providerPlatform.h3.role.${role}`);
}

function advancedLabel(path: string): string {
  return $t(`providerPlatform.h3.advanced.${path}`);
}

function qualityLabel(profile: OutputProfile): string {
  if (profile.delivery === "native") return $t("providerPlatform.h3.quality.native", { resolution: profile.resolution });
  if (profile.delivery === "regenerated") {
    return $t("providerPlatform.h3.quality.regenerated", {
      resolution: profile.resolution,
      source: profile.sourceResolution,
    });
  }
  if (profile.delivery === "provider_managed") {
    return $t("providerPlatform.h3.quality.provider_managed", {
      resolution: profile.resolution,
    });
  }
  return $t("providerPlatform.h3.quality.upscaled", {
    resolution: profile.resolution,
    source: profile.sourceResolution,
  });
}
</script>

<style scoped>
.h3Form {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
}

.formHeader,
.sectionTitle,
.assetContract li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h3,
h4,
p,
ul {
  margin: 0;
}

h3 {
  font-size: 16px;
}

.formHeader p,
.contractHint,
.field small,
.assetContract small {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.providerLabel {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.modeGroup {
  margin: 0;
  padding: 0;
  border: 0;
}

.modeGroup legend,
.field > span,
.sectionTitle h4 {
  margin-bottom: 7px;
  color: var(--td-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.modeButtons {
  display: flex;
  gap: 6px;
}

.modeButtons button {
  padding: 6px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-secondary);
}

.modeButtons button[aria-pressed="true"] {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}

.field {
  display: grid;
  align-content: start;
  gap: 5px;
}

.field input:not([type="checkbox"]),
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

.field textarea {
  resize: vertical;
}

.parameterGrid,
.advancedGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.qualityNote {
  padding: 9px 10px;
  border-left: 3px solid var(--td-brand-color);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.qualityNote[data-delivery="upscaled"] {
  border-left-color: var(--td-warning-color);
}

.assetContract {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--td-component-border);
}

.assetContract ul {
  display: grid;
  gap: 5px;
  padding: 0;
  list-style: none;
}

.advancedFields summary {
  cursor: pointer;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}

.advancedGrid {
  margin-top: 10px;
}

.violations {
  padding-left: 18px;
  color: var(--td-error-color);
  font-size: 12px;
}

@media (max-width: 900px) {
  .parameterGrid,
  .advancedGrid {
    grid-template-columns: 1fr;
  }
}
</style>
