<template>
  <article class="jobCard" :data-state="job.state">
    <div class="jobSummary">
      <div>
        <strong>{{ job.canonicalModelId }}</strong>
        <span>{{ job.offeringId }}</span>
      </div>
      <span class="state" role="status">{{ jobStateLabel }}</span>
    </div>
    <p v-if="job.cancelRequestedAt" class="intent">{{ $t("providerPlatform.cancelRequested") }}</p>
    <p v-if="job.requiresReconciliation" class="warning" role="alert">
      {{ $t("providerPlatform.reconciliationRequired") }}
    </p>
    <div class="actions">
      <button v-if="canCancel" type="button" @click="$emit('cancel', job.id)">
        {{ $t("providerPlatform.cancelJob") }}
      </button>
      <button v-if="job.requiresReconciliation" type="button" @click="$emit('reconcile', job.id)">
        {{ $t("providerPlatform.reconcileJob") }}
      </button>
      <button v-if="canResumeImport" type="button" @click="$emit('resumeImport', job.id)">
        {{ $t("providerPlatform.resumeImport") }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { GenerationJobView } from "@/features/generation/jobStore";

const props = defineProps<{ job: GenerationJobView }>();
defineEmits<{ cancel: [id: string]; reconcile: [id: string]; resumeImport: [id: string] }>();

const canCancel = computed(() => !["succeeded", "failed", "cancelled", "abandoned"].includes(props.job.state) && !props.job.cancelRequestedAt);
const canResumeImport = computed(
  () =>
    props.job.state === "failed" &&
    Boolean(
      props.job.error &&
        typeof props.job.error === "object" &&
        (props.job.error as Record<string, unknown>).resumableImport === true,
    ),
);

const jobStateLabel = computed(() => {
  switch (props.job.state) {
    case "queued":
      return $t("providerPlatform.jobState.queued");
    case "preparing_assets":
      return $t("providerPlatform.jobState.preparing_assets");
    case "submitting":
      return $t("providerPlatform.jobState.submitting");
    case "submitted":
      return $t("providerPlatform.jobState.submitted");
    case "remote_queued":
      return $t("providerPlatform.jobState.remote_queued");
    case "running":
      return $t("providerPlatform.jobState.running");
    case "importing":
      return $t("providerPlatform.jobState.importing");
    case "submission_unknown":
      return $t("providerPlatform.jobState.submission_unknown");
    case "succeeded":
      return $t("providerPlatform.jobState.succeeded");
    case "failed":
      return $t("providerPlatform.jobState.failed");
    case "cancelled":
      return $t("providerPlatform.jobState.cancelled");
    case "abandoned":
      return $t("providerPlatform.jobState.abandoned");
  }
});
</script>

<style scoped>
.jobCard {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
}

.jobSummary,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.jobSummary div {
  display: grid;
  gap: 2px;
}

.jobSummary span,
.intent {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.state {
  white-space: nowrap;
}

p {
  margin: 0;
}

.warning {
  color: var(--td-warning-color);
}

button {
  padding: 6px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-primary);
}
</style>
