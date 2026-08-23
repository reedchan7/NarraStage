import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { io, type Socket } from "socket.io-client";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import type { paths } from "@/api/generated/v2";

type JobEnvelope = paths["/api/v2/jobs/{id}"]["get"]["responses"][200]["content"]["application/json"];
type JobListEnvelope = paths["/api/v2/jobs"]["get"]["responses"][200]["content"]["application/json"];
type SubmitOperation = paths["/api/v2/jobs"]["post"];
type SubmitRequest = SubmitOperation["requestBody"]["content"]["application/json"];
type CancelRequest = paths["/api/v2/jobs/{id}/cancel"]["post"]["requestBody"]["content"]["application/json"];
type ReconcileRequest = paths["/api/v2/jobs/{id}/reconcile"]["post"]["requestBody"]["content"]["application/json"];
type ResumeImportEnvelope = paths["/api/v2/jobs/{id}/resume-import"]["post"]["responses"][200]["content"]["application/json"];
type MaterializeEnvelope = paths["/api/v2/jobs/{id}/materialize-workbench"]["post"]["responses"][200]["content"]["application/json"];
type MaterializeAssetImageEnvelope = paths["/api/v2/jobs/{id}/materialize-asset-image"]["post"]["responses"][200]["content"]["application/json"];

export type GenerationJobView = JobEnvelope["data"];
export type SubmitGenerationJobRequest = SubmitRequest;

const terminalStates = new Set<GenerationJobView["state"]>(["succeeded", "failed", "cancelled", "abandoned"]);

export const useGenerationJobStore = defineStore("generation-jobs", () => {
  const jobsById = ref<Record<string, GenerationJobView>>({});
  const loading = ref(false);
  const connected = ref(false);
  let socket: Socket | undefined;

  const jobs = computed(() => Object.values(jobsById.value).sort((left, right) => right.updatedAt - left.updatedAt));
  const activeJobs = computed(() => jobs.value.filter((job) => !terminalStates.has(job.state)));

  function merge(job: GenerationJobView) {
    const current = jobsById.value[job.id];
    if (!current || current.version <= job.version) jobsById.value[job.id] = job;
  }

  async function refresh() {
    loading.value = true;
    try {
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      do {
        const response = (await axios.get("/v2/jobs", {
          params: { limit: 100, recovery: true, ...(cursor ? { cursor } : {}) },
        })) as JobListEnvelope;
        response.data.jobs.forEach(merge);
        const next = response.data.nextCursor;
        if (!next || seenCursors.has(next)) break;
        seenCursors.add(next);
        cursor = next;
      } while (cursor);
    } finally {
      loading.value = false;
    }
  }

  async function refreshJob(id: string, announcedVersion?: number) {
    if (announcedVersion !== undefined && (jobsById.value[id]?.version ?? -1) >= announcedVersion) return;
    const response = (await axios.get(`/v2/jobs/${id}`)) as JobEnvelope;
    merge(response.data);
  }

  async function submit(request: SubmitRequest) {
    const response = (await axios.post("/v2/jobs", request)) as JobEnvelope;
    merge(response.data);
    return response.data;
  }

  async function cancel(id: string, request: CancelRequest) {
    const response = (await axios.post(`/v2/jobs/${id}/cancel`, request)) as JobEnvelope;
    merge(response.data);
    return response.data;
  }

  async function reconcile(id: string, request: ReconcileRequest) {
    const response = (await axios.post(`/v2/jobs/${id}/reconcile`, request)) as JobEnvelope;
    merge(response.data);
    return response.data;
  }

  async function resumeImport(id: string) {
    const response = (await axios.post(`/v2/jobs/${id}/resume-import`)) as ResumeImportEnvelope;
    merge(response.data);
    return response.data;
  }

  async function materializeWorkbench(id: string) {
    const response = (await axios.post(`/v2/jobs/${id}/materialize-workbench`)) as MaterializeEnvelope;
    return response.data;
  }

  async function materializeAssetImage(id: string) {
    const response = (await axios.post(`/v2/jobs/${id}/materialize-asset-image`)) as MaterializeAssetImageEnvelope;
    return response.data;
  }

  function startNotifications() {
    if (socket) return;
    const socketUrl = `${settingStore().baseUrl.replace(/\/$/, "")}/socket/jobs`;
    socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      auth: { token: localStorage.getItem("token") },
    });
    socket.on("connect", () => {
      connected.value = true;
      void refresh();
    });
    socket.on("disconnect", () => {
      connected.value = false;
    });
    socket.on("job:changed", (notice: { jobId: string; version: number }) => {
      void refreshJob(notice.jobId, notice.version);
    });
  }

  function stopNotifications() {
    socket?.disconnect();
    socket = undefined;
    connected.value = false;
  }

  return {
    jobs,
    activeJobs,
    loading,
    connected,
    refresh,
    refreshJob,
    submit,
    cancel,
    reconcile,
    resumeImport,
    materializeWorkbench,
    materializeAssetImage,
    startNotifications,
    stopNotifications,
  };
});
