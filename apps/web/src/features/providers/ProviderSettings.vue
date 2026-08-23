<template>
  <section class="providerSettings" :aria-busy="store.loading">
    <header>
      <div>
        <h3>{{ $t("providerPlatform.credentialsTitle") }}</h3>
        <p>{{ $t("providerPlatform.credentialsDescription") }}</p>
      </div>
      <button type="button" class="secondaryButton" @click="refresh">
        {{ $t("providerPlatform.refresh") }}
      </button>
    </header>

    <p v-if="store.errorCode" role="alert">{{ $t(store.errorCode) }}</p>

    <article v-for="provider in store.providers" :key="provider.providerId">
      <div class="providerHeader">
        <h4>
          {{ provider.name }}
          <span class="health" :data-health="provider.health">{{ $t(`providerPlatform.health.${provider.health}`) }}</span>
        </h4>
        <button
          type="button"
          class="secondaryButton healthCheck"
          :disabled="store.healthChecking.includes(provider.providerId) || !provider.slots.some((slot) => slot.configured)"
          @click="checkHealth(provider.providerId)">
          {{
            store.healthChecking.includes(provider.providerId) ? $t("providerPlatform.checkingConnection") : $t("providerPlatform.checkConnection")
          }}
        </button>
      </div>
      <div v-for="slot in provider.slots" :key="slot.slot" class="credentialRow">
        <div class="credentialMeta">
          <label :for="credentialId(provider.providerId, slot.slot)">{{ slot.slot }}</label>
          <span :data-source="slot.source">
            {{ slot.configured ? credentialSourceLabel(slot.source) : $t("providerPlatform.credentialNotConfigured") }}
          </span>
        </div>
        <input
          :id="credentialId(provider.providerId, slot.slot)"
          v-model="drafts[credentialKey(provider.providerId, slot.slot)]"
          type="password"
          autocomplete="new-password"
          :placeholder="$t('providerPlatform.credentialPlaceholder')"
          :disabled="!slot.writable || !bridgeAvailable" />
        <div class="actions">
          <button
            type="button"
            :disabled="!slot.writable || !bridgeAvailable || !drafts[credentialKey(provider.providerId, slot.slot)]?.trim()"
            @click="save(provider.providerId, slot.slot)">
            {{ $t("providerPlatform.saveCredential") }}
          </button>
          <button
            type="button"
            class="secondaryButton"
            :disabled="!slot.writable || !bridgeAvailable || !slot.configured"
            @click="remove(provider.providerId, slot.slot)">
            {{ $t("providerPlatform.deleteCredential") }}
          </button>
        </div>
      </div>
    </article>

    <p v-if="messageKey" role="status">{{ $t(messageKey) }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useProviderStore } from "@/features/providers/providerStore";

const store = useProviderStore();
const drafts = reactive<Record<string, string>>({});
const messageKey = ref("");
const bridgeAvailable = computed(() => Boolean(window.toonflowCredentials));

function credentialKey(providerId: string, slot: string) {
  return `${providerId}:${slot}`;
}

function credentialId(providerId: string, slot: string) {
  return `credential-${providerId}-${slot}`;
}

function credentialSourceLabel(source: string) {
  switch (source) {
    case "environment":
      return $t("providerPlatform.credentialSource.environment");
    case "electron_safe_storage":
      return $t("providerPlatform.credentialSource.electron_safe_storage");
    case "memory":
      return $t("providerPlatform.credentialSource.memory");
    default:
      return $t("providerPlatform.credentialSource.none");
  }
}

async function refresh() {
  try {
    await store.refresh();
  } catch {}
}

async function save(providerId: string, slot: string) {
  const key = credentialKey(providerId, slot);
  const value = drafts[key] ?? "";
  messageKey.value = "";
  try {
    await store.setCredential(providerId, slot, value);
    messageKey.value = "providerPlatform.credentialSaved";
  } catch {
    messageKey.value = "providerPlatform.credentialSaveFailed";
  } finally {
    drafts[key] = "";
  }
}

async function remove(providerId: string, slot: string) {
  messageKey.value = "";
  try {
    await store.deleteCredential(providerId, slot);
    messageKey.value = "providerPlatform.credentialDeleted";
  } catch {
    messageKey.value = "providerPlatform.credentialDeleteFailed";
  }
}

async function checkHealth(providerId: string) {
  messageKey.value = "";
  try {
    await store.checkHealth(providerId);
    messageKey.value = "providerPlatform.connectionChecked";
  } catch {
    messageKey.value = "providerPlatform.connectionCheckFailed";
  }
}

onMounted(refresh);
</script>

<style scoped>
.providerSettings {
  display: grid;
  gap: 16px;
  padding: 4px 12px 24px;
}

header,
.providerHeader,
.credentialMeta,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h3,
h4,
p {
  margin: 0;
}

header p,
.credentialMeta span {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.health {
  margin-left: 8px;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  font-weight: 400;
}

article {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
}

.credentialRow {
  display: grid;
  gap: 8px;
}

input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}

button {
  padding: 7px 12px;
  border: 1px solid var(--td-brand-color);
  border-radius: 6px;
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.secondaryButton {
  border-color: var(--td-component-border);
  background: transparent;
  color: var(--td-text-color-primary);
}
</style>
