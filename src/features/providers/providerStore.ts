import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "@/utils/axios";
import { getProviderCatalog } from "@/features/models/catalog";
import type { paths } from "@/api/generated/v2";
import { notifyProviderRuntimeChanged } from "@/features/providers/runtimeInvalidation";

type CredentialEnvelope = paths["/api/v2/providers"]["get"]["responses"][200]["content"]["application/json"];
type CredentialProvider = CredentialEnvelope["data"]["providers"][number];

export interface ProviderCredentialView extends CredentialProvider {
  name: string;
  health: "unknown" | "healthy" | "degraded" | "unhealthy";
}

export const useProviderStore = defineStore("provider-platform", () => {
  const providers = ref<ProviderCredentialView[]>([]);
  const loading = ref(false);
  const healthChecking = ref<string[]>([]);
  const errorCode = ref("");

  async function refresh() {
    loading.value = true;
    errorCode.value = "";
    try {
      const [credentialResponse, catalog] = await Promise.all([axios.get("/v2/providers") as Promise<CredentialEnvelope>, getProviderCatalog()]);
      const names = new Map(catalog.providers.map((provider) => [provider.id, provider.name]));
      providers.value = credentialResponse.data.providers.map((provider) => ({
        ...provider,
        name: names.get(provider.providerId) ?? provider.providerId,
        health: (provider as CredentialProvider & { health?: ProviderCredentialView["health"] }).health ?? "unknown",
      }));
    } catch {
      errorCode.value = "providerPlatform.loadCredentialStatusError";
      throw new Error(errorCode.value);
    } finally {
      loading.value = false;
    }
  }

  async function setCredential(providerId: string, slot: string, value: string) {
    if (!window.toonflowCredentials) throw new Error("credential.desktop_bridge_required");
    await window.toonflowCredentials.set({ providerId, slot, value });
    await checkHealth(providerId);
    notifyProviderRuntimeChanged();
  }

  async function deleteCredential(providerId: string, slot: string) {
    if (!window.toonflowCredentials) throw new Error("credential.desktop_bridge_required");
    await window.toonflowCredentials.delete({ providerId, slot });
    await checkHealth(providerId);
    notifyProviderRuntimeChanged();
  }

  async function checkHealth(providerId: string) {
    if (healthChecking.value.includes(providerId)) return;
    healthChecking.value = [...healthChecking.value, providerId];
    try {
      await axios.post(`/v2/providers/${encodeURIComponent(providerId)}/health-check`);
      await refresh();
      notifyProviderRuntimeChanged();
    } finally {
      healthChecking.value = healthChecking.value.filter((candidate) => candidate !== providerId);
    }
  }

  return {
    providers,
    loading,
    healthChecking,
    errorCode,
    refresh,
    setCredential,
    deleteCredential,
    checkHealth,
  };
});
