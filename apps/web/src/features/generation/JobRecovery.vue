<template>
  <section v-if="store.activeJobs.length" class="jobRecovery" :aria-busy="store.loading">
    <header>
      <h3>{{ $t("providerPlatform.activeJobs") }}</h3>
      <span :data-connected="store.connected">
        {{ $t(store.connected ? "providerPlatform.liveUpdatesConnected" : "providerPlatform.liveUpdatesReconnecting") }}
      </span>
    </header>
    <JobCard v-for="job in store.activeJobs" :key="job.id" :job="job" @cancel="cancel" @reconcile="reconcile" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import JobCard from "@/features/generation/JobCard.vue";
import { useGenerationJobStore } from "@/features/generation/jobStore";

const store = useGenerationJobStore();

async function cancel(id: string) {
  await store.cancel(id, { reason: "user_requested" });
}

function reconcile() {
  window.$message.warning($t("providerPlatform.reconciliationOperatorOnly"));
}

onMounted(() => {
  void store.refresh();
  store.startNotifications();
});
onUnmounted(() => store.stopNotifications());
</script>

<style scoped>
.jobRecovery {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--td-component-border);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h3 {
  margin: 0;
  font-size: 14px;
}

header span {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
</style>
