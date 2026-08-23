<template>
  <main class="compatibility-gate" role="alert" aria-live="assertive">
    <section class="compatibility-card">
      <div class="compatibility-mark" aria-hidden="true">TF</div>
      <p class="compatibility-kicker">ToonFlow</p>
      <h1>{{ title }}</h1>
      <p class="compatibility-description">{{ description }}</p>
      <code v-if="code" class="compatibility-code">{{ code }}</code>
      <t-button theme="primary" size="large" :loading="retrying" @click="$emit('retry')">
        {{ $t("compatibility.retry") }}
      </t-button>
    </section>
  </main>
</template>

<script setup lang="ts">
import type { CompatibilityFailureCode } from "./compatibility";

const props = defineProps<{
  state: "incompatible" | "unreachable";
  code?: CompatibilityFailureCode;
  retrying?: boolean;
}>();

defineEmits<{ retry: [] }>();

const title = computed(() => (props.state === "unreachable" ? $t("compatibility.unreachableTitle") : $t("compatibility.incompatibleTitle")));
const description = computed(() =>
  props.state === "unreachable" ? $t("compatibility.unreachableDescription") : $t("compatibility.incompatibleDescription"),
);
</script>

<style scoped lang="scss">
.compatibility-gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 40px;
  background: radial-gradient(circle at 50% 20%, rgba(0, 82, 217, 0.1), transparent 34%), var(--td-bg-color-page, #f4f5f7);
}

.compatibility-card {
  width: min(480px, 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 40px;
  border: 1px solid var(--td-component-border, #dcdfe6);
  border-radius: 16px;
  background: var(--td-bg-color-container, #fff);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}

.compatibility-mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  color: #fff;
  font-weight: 700;
  letter-spacing: -0.04em;
  background: var(--td-brand-color, #0052d9);
}

.compatibility-kicker {
  margin: 8px 0 -8px;
  color: var(--td-text-color-secondary, #5e6673);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--td-text-color-primary, #111827);
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.2;
}

.compatibility-description {
  margin: 0;
  color: var(--td-text-color-secondary, #5e6673);
  line-height: 1.7;
}

.compatibility-code {
  padding: 6px 9px;
  border-radius: 6px;
  color: var(--td-text-color-placeholder, #7b8492);
  background: var(--td-bg-color-secondarycontainer, #f3f4f6);
  font-size: 12px;
}
</style>
