<template>
  <div class="index fc">
    <JobRecovery />
    <div class="modelSelect">
      <modeMenu v-model="modelParmas" :modeOptions="modeOptions" :trackId="currentTrack?.id" :modeList="modeList" @modeChange="modeChange" />
    </div>
    <div v-if="isCatalogVideo && selectedCatalogCapability && selectedCatalogOffering && providerCatalog" class="catalogControls">
      <H3Form
        v-if="isH3Catalog"
        v-model="catalogInput"
        :capability="selectedCatalogCapability"
        :offering="selectedCatalogOffering"
        :assets="catalogAssets"
        :violations="selectedCatalogViolations"
        :show-prompt="false" />
      <CapabilityForm
        v-else
        v-model="catalogInput"
        :capability="selectedCatalogCapability"
        :hidden-fields="['prompt']"
        :violations="selectedCatalogViolations" />
      <label v-if="selectedCatalogMode?.requiresContinuation" class="continuationField">
        <span>{{ $t("providerPlatform.continuationParent") }}</span>
        <t-select v-model="continuationParentJobId" :placeholder="$t('providerPlatform.continuationParentPlaceholder')">
          <t-option v-for="job in continuationParentJobs" :key="job.id" :value="job.id" :label="new Date(job.updatedAt).toLocaleString()" />
        </t-select>
      </label>
      <H3OfferingComparison
        v-if="isH3Catalog"
        :catalog="providerCatalog"
        :preflight="catalogPreflight"
        :selected-offering-id="selectedCatalogOffering.id"
        :resolution="String(catalogInput.values.resolution ?? '')"
        @select="selectH3Offering" />
    </div>
    <div class="referenceImage">
      <div class="uploadBtn">
        <imageSelect :mode="imageSelectMode" v-model="imageList" :storyboard-list="storyboardList" />
      </div>
    </div>
    <div class="generate ac">
      <div class="prompt" v-if="currentTrack">
        <t-card :title="'#' + (activeTrackIndex + 1) + $t('workbench.generate.generateText')" header-bordered class="videoPrompt">
          <template #actions>
            <t-button size="small" class="genTextbtn" :loading="currentTrack.state == '生成中'" @click="genText">
              {{ $t("workbench.generate.generateText") }}
            </t-button>
          </template>
          <div class="promptData fc">
            <div class="promptInput" @focusout="handlePromptBlur">
              <promptEditor v-model="currentTrack.prompt" :references="references" :placeholder="$t('workbench.generate.promptPlaceholder')" />
            </div>
          </div>
        </t-card>
      </div>
      <div class="video">
        <videoCard
          v-if="currentTrack"
          :active-track-index="activeTrackIndex"
          :generating="catalogJobGenerating"
          v-model:current-track="currentTrack"
          @refresh="getGenerateData"
          @generate="generateVideo" />
      </div>
    </div>
    <div class="track">
      <newTrack
        v-model:activeTrackIndex="activeTrackIndex"
        v-model="trackList"
        :image-list="imageList"
        @change="trackChange"
        :modelParmas="modelParmas"
        :clampDuration="clampDuration"
        :catalog-batch-generate="generateCatalogBatch"
        @getData="getGenerateData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { useDebounceFn } from "@vueuse/core";
import newTrack from "./components/track.vue";
import imageSelect from "./components/imageSelect.vue";
import modeMenu from "./components/modeMenu.vue";
import videoCard from "./components/video.vue";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import promptEditor from "@/components/promptEditor.vue";
import imageListCacheStore from "@/stores/imageListCache";
import JobRecovery from "@/features/generation/JobRecovery.vue";
import H3Form from "@/features/generation/h3/H3Form.vue";
import H3OfferingComparison from "@/features/generation/h3/H3OfferingComparison.vue";
import CapabilityForm from "@/features/generation/CapabilityForm.vue";
import { normalizeCapabilityInput } from "@/features/generation/capabilityInput";
import { useGenerationJobStore } from "@/features/generation/jobStore";
import { buildCatalogVideoJobRequest } from "@/features/generation/catalogVideoRequest";
import { clearPendingIdempotencyKey, getPendingIdempotencyKey, logicalActionScope } from "@/features/generation/idempotency";
import { runIdempotentBatch } from "@/features/generation/idempotentBatch";
import {
  getProviderCatalog,
  preflightProviderRequest,
  type CapabilityInput,
  type CatalogCapability,
  type CatalogOffering,
  type ProviderCatalog,
  type PreflightResult,
} from "@/features/models/catalog";
import type { paths } from "/contracts";
import {
  createProjectSelectionPersistence,
  projectGenerationSelection,
  resolvePersistedGenerationSelection,
  type ProjectGenerationSelection,
} from "@/features/generation/projectSelection";

const { project } = storeToRefs(projectStore());
const episodesId = inject<Ref<number>>("episodesId")!;
const activeTrackIndex = ref(0);
const cacheStore = imageListCacheStore();
const generationJobStore = useGenerationJobStore();
const { getCache, setCache, removeCache, initCacheFromTrackList, warmUpUrls } = cacheStore;
const { urlMap } = storeToRefs(cacheStore);

const modeOptions = ref<VideoModel>({
  name: "",
  modelName: "",
  durationResolutionMap: [],
  audio: false,
  type: "video",
  mode: [],
}); // 当前模型配置

const trackList = ref<TrackItem[]>([]); // 轨道列表

const modelParmas = ref<ModelSetting>({
  mode: "",
  model: "",
  resolution: "480p",
  duration: 8,
  audio: false,
  catalogMode: false,
});

type WorkbenchAssetIngestOperation = paths["/api/v2/media-assets/workbench"]["post"];
type WorkbenchAssetIngestRequest = WorkbenchAssetIngestOperation["requestBody"]["content"]["application/json"];
type WorkbenchAssetIngestEnvelope = WorkbenchAssetIngestOperation["responses"][201]["content"]["application/json"];

const providerCatalog = ref<ProviderCatalog | null>(null);
const catalogPreflight = ref<PreflightResult | null>(null);
const catalogInput = ref<CapabilityInput>({
  mode: "text",
  values: {
    prompt: "",
    durationSeconds: 8,
    resolution: "768P",
    aspectRatio: "16:9",
  },
  assets: [],
});
const continuationParentJobId = ref("");
const mediaDurations = ref<Record<string, number>>({});
const materializedCatalogJobs = new Set<string>();
let selectionPersistenceReady = false;

function applyPersistedGenerationSelection(selection: ProjectGenerationSelection) {
  if (!project.value) return;
  project.value.videoCatalogMode = selection.catalogMode;
  project.value.videoCanonicalModelId = selection.catalogMode === "builtin" ? selection.canonicalModelId : null;
  project.value.videoOfferingId = selection.catalogMode === "builtin" ? selection.offeringId : null;
  project.value.videoProviderId = selection.catalogMode === "builtin" ? selection.providerId : null;
  project.value.videoOfferingPreferenceMode = selection.catalogMode === "builtin" ? selection.preferenceMode : null;
}

const generationSelectionWrites = createProjectSelectionPersistence({
  async write(projectId, selection) {
    await axios.post("/project/updateGenerationSelection", { id: projectId, selection });
  },
  currentProjectId() {
    const projectId = Number(project.value?.id);
    return Number.isSafeInteger(projectId) && projectId > 0 ? projectId : undefined;
  },
  onCommitted: applyPersistedGenerationSelection,
  onError: () => window.$message.error($t("providerPlatform.selectionPersistenceFailed")),
});

const persistGenerationSelection = useDebounceFn(() => {
  const projectId = Number(project.value?.id);
  if (!selectionPersistenceReady || !Number.isSafeInteger(projectId) || projectId <= 0) return;
  const selection = projectGenerationSelection(modelParmas.value);
  if (!selection) return;
  generationSelectionWrites.schedule(projectId, selection);
}, 250);

watch(
  [() => modelParmas.value.catalogMode, () => modelParmas.value.canonicalModelId, () => modelParmas.value.model, () => modelParmas.value.providerId],
  () => void persistGenerationSelection(),
);

const storyboardList = ref<StoryboardItem[]>([]); // 分镜列表

/** 排序优先级：assets有图=0，storyboard有图=1，无图=2 */
function getImageItemPriority(item: UploadItem): number {
  if (item.src) return item.sources === "assets" ? 0 : 1;
  return 2;
}

const imageList = computed({
  get(): UploadItem[] {
    // 触发对 urlMap 的依赖追踪，当 warmUpUrls 更新 urlMap 后自动重新计算
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    urlMap.value;
    const trackId = currentTrack.value?.id;
    const pid = project.value?.id;
    const sid = episodesId.value;
    // 优先从缓存读取
    if (pid != null && sid != null && trackId != null) {
      const cached = getCache(pid, sid, trackId);

      if (cached?.length) {
        return [...cached].sort((a, b) => getImageItemPriority(a) - getImageItemPriority(b));
      }
    }
    const medias = currentTrack.value?.medias;
    if (!medias?.length) return [];
    return [...(medias as UploadItem[])].sort((a, b) => getImageItemPriority(a) - getImageItemPriority(b));
  },
  set(val: UploadItem[]) {
    if (currentTrack.value) {
      currentTrack.value.medias = val as any;
      // 同步写入缓存
      const pid = project.value?.id;
      const sid = episodesId.value;
      const trackId = currentTrack.value.id;
      if (pid != null && sid != null && trackId != null) {
        setCache(pid, sid, trackId, val);
      }
    }
  },
});

function modeChange(newVal: string) {
  if (newVal == modelParmas.value.mode) return;
  if ((imageList.value.length || currentTrack.value?.prompt) && modelParmas.value.mode) {
    const dialog = DialogPlugin.confirm({
      header: $t("workbench.generate.modeChange"),
      body: $t("workbench.generate.modeChangeConfirm"),
      confirmBtn: $t("settings.generate.modelChnageSure"),
      cancelBtn: $t("settings.memory.msg.cancel"),
      onConfirm: async () => {
        imageList.value = [];
        currentTrack.value.prompt = "";
        dialog.destroy();
        modelParmas.value.mode = newVal;
      },
    });
  } else if (newVal) {
    modelParmas.value.mode = newVal;
  }
}
const modeList = computed(() => {
  const modeLabelMap: Record<string, string> = {
    singleImage: "单图",
    startEndRequired: "首尾帧",
    endFrameOptional: "尾帧可选",
    startFrameOptional: "首帧可选",
    text: "文本生视频",
    videoReference: "视频",
    imageReference: "图片",
    audioReference: "音频",
    textReference: "文本",
  };
  function parseRefLabel(m: string): string {
    const match = m.match(/^(videoReference|imageReference|audioReference|textReference):(\d+)$/);
    if (match) {
      const base = modeLabelMap[match[1]] || match[1];
      return `${base} ×${match[2]}`;
    }
    return modeLabelMap[m] || m;
  }
  return modeOptions.value.mode
    ? modeOptions.value.mode.map((mode) =>
        Array.isArray(mode)
          ? { value: JSON.stringify(mode), label: mode.map((m) => parseRefLabel(m)).join(" + ") + "参考" }
          : { value: mode, label: modeLabelMap[mode] || mode },
      )
    : [];
});
const currentTrack = computed({
  get() {
    return trackList.value[activeTrackIndex.value];
  },
  set(val) {
    trackList.value[activeTrackIndex.value] = val;
  },
});

const isCatalogVideo = computed(() => modelParmas.value.catalogMode === true && Boolean(modelParmas.value.canonicalModelId));
const isH3Catalog = computed(() => isCatalogVideo.value && modelParmas.value.canonicalModelId === "minimax:h3");
const selectedCatalogOffering = computed<CatalogOffering | undefined>(() =>
  providerCatalog.value?.offerings.find((offering) => offering.id === modelParmas.value.model),
);
const selectedCatalogCapability = computed<CatalogCapability | undefined>(() => {
  const operation = selectedCatalogOffering.value?.operations.find((candidate) => candidate.operation === "video.generate" && candidate.enabled);
  return providerCatalog.value?.capabilitySchemas.find((capability) => capability.id === operation?.capabilitySchemaId);
});
const selectedCatalogMode = computed(() => selectedCatalogCapability.value?.assetModes?.find((mode) => mode.id === catalogInput.value.mode));
const selectedCatalogViolations = computed(
  () => catalogPreflight.value?.offerings.find((offering) => offering.offeringId === selectedCatalogOffering.value?.id)?.violations ?? [],
);
const continuationParentJobs = computed(() =>
  generationJobStore.jobs.filter(
    (job) =>
      job.state === "succeeded" &&
      job.offeringId === selectedCatalogOffering.value?.id &&
      job.operation === "video.generate" &&
      job.consumer?.type === "workbench" &&
      Number(job.consumer.context.projectId) === Number(project.value?.id),
  ),
);
const catalogAssets = computed<CapabilityInput["assets"]>(() => {
  return buildLocalCatalogAssets(imageList.value);
});

function buildLocalCatalogAssets(items: UploadItem[]): CapabilityInput["assets"] {
  if (catalogInput.value.mode === "text") return [];

  return items.flatMap((item, index) => {
    if (item.id == null || !item.src) return [];
    const kind = item.fileType;
    const role = catalogAssetRole(kind, index);
    const durationSeconds = kind === "image" ? undefined : mediaDurations.value[mediaDurationKey(item)];
    return [
      {
        assetId: `workbench:${item.sources}:${item.id}`,
        kind,
        role,
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
      },
    ];
  });
}
const catalogRequestInput = computed<CapabilityInput>(() => ({
  ...catalogInput.value,
  values: {
    ...catalogInput.value.values,
    prompt: currentTrack.value?.prompt ?? "",
  },
  assets: catalogAssets.value,
}));
const imageSelectMode = computed<VideoMode>(() => {
  if (!isCatalogVideo.value) return parseMode(modelParmas.value.mode) ?? "text";
  if (catalogInput.value.mode === "text" || catalogInput.value.mode === "edit") return "text";
  if (catalogInput.value.mode === "keyframes") return "startEndRequired";
  const kinds = new Set(selectedCatalogMode.value?.roles.flatMap((role) => role.kinds) ?? []);
  const references: ReferenceType[] = [];
  if (kinds.has("image")) references.push("imageReference");
  if (kinds.has("video")) references.push("videoReference");
  if (kinds.has("audio")) references.push("audioReference");
  return references.length ? references : "text";
});
const catalogJobGenerating = computed(() => {
  if (!isCatalogVideo.value || currentTrack.value?.id == null) return false;
  return generationJobStore.activeJobs.some(
    (job) =>
      job.consumer?.type === "workbench" &&
      job.consumer.context.trackId === currentTrack.value.id &&
      job.offeringId === selectedCatalogOffering.value?.id,
  );
});

function mediaDurationKey(item: UploadItem): string {
  return `${item.sources}:${item.id ?? "empty"}:${item.src ?? ""}`;
}

function catalogAssetRole(kind: UploadItem["fileType"], index: number): string {
  if (catalogInput.value.mode === "keyframes") return index === 0 ? "first_frame" : "last_frame";
  if (catalogInput.value.mode === "images") return index === 0 ? "first_frame" : "reference_image";
  if (catalogInput.value.mode === "extend") return "source_video";
  if (kind === "image") return "reference_image";
  if (kind === "video") return "reference_video";
  return "reference_audio";
}

function readMediaDuration(src: string, kind: "video" | "audio"): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const timeout = window.setTimeout(() => {
      element.removeAttribute("src");
      reject(new Error("media_metadata_timeout"));
    }, 10_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeAttribute("src");
      element.load();
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = element.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("media_duration_invalid"));
      else resolve(Math.round(duration * 1_000) / 1_000);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error("media_metadata_unavailable"));
    };
    element.src = src;
  });
}

async function refreshMediaDurations(items: UploadItem[]) {
  await Promise.all(
    items.map(async (item) => {
      if (!item.src || (item.fileType !== "video" && item.fileType !== "audio")) return;
      const key = mediaDurationKey(item);
      if (mediaDurations.value[key] !== undefined) return;
      try {
        const duration = await readMediaDuration(item.src, item.fileType);
        mediaDurations.value = { ...mediaDurations.value, [key]: duration };
      } catch {
        // Capability preflight reports the missing duration and prevents submission.
      }
    }),
  );
}

function selectH3Offering(offeringId: string) {
  const offering = providerCatalog.value?.offerings.find((candidate) => candidate.id === offeringId);
  if (!offering || offering.canonicalModelId !== "minimax:h3") return;
  const model = providerCatalog.value?.models.find((candidate) => candidate.id === offering.canonicalModelId);
  modelParmas.value.model = offering.id;
  modelParmas.value.canonicalModelId = offering.canonicalModelId;
  modelParmas.value.providerId = offering.providerId;
  modelParmas.value.offeringLabel = `${model?.name ?? offering.canonicalModelId} · ${offering.providerId}`;
}

/** 将时长限制在模型支持的范围内 */
function clampDuration(trackDuration: number): number {
  const drMap = modeOptions.value?.durationResolutionMap;
  if (Array.isArray(drMap) && drMap.length > 0 && drMap[0].duration?.length) {
    const durations = drMap[0].duration;
    return Math.max(Math.min(...durations), Math.min(trackDuration, Math.max(...durations)));
  }
  return trackDuration;
}
watch(
  () => modelParmas.value.model,
  (val) => {
    if (modelParmas.value.catalogMode) return;
    if (!val) {
      modeOptions.value = {
        name: "",
        modelName: "",
        durationResolutionMap: [],
        audio: false,
        type: "video",
        mode: [],
      };
      modelParmas.value.mode = "";
      return;
    }
    axios.post("/modelSelect/getModelDetail", { modelId: val }).then(({ data }) => {
      modeOptions.value = data;
      modelParmas.value.audio = data.audio === true || data.audio === "true" || data.audio == "optional";
      const drMap = data.durationResolutionMap;
      if (Array.isArray(drMap) && drMap.length > 0) {
        if (drMap[0].resolution?.length) modelParmas.value.resolution = drMap[0].resolution[0];
        if (drMap[0].duration?.length) modelParmas.value.duration = clampDuration(modelParmas.value.duration);
      }

      const currentParsed = parseMode(modelParmas.value.mode);
      const modeMatched =
        currentParsed !== null &&
        data.mode.some((m: VideoMode) => {
          if (Array.isArray(m) && Array.isArray(currentParsed)) {
            return JSON.stringify(m) === JSON.stringify(currentParsed);
          }
          return m == currentParsed;
        });
      if (!modeMatched) {
        const newMode = Array.isArray(data.mode[0]) ? JSON.stringify(data.mode[0]) : data.mode[0];
        modeChange(newMode);
      }
    });
  },
);

watch(
  [selectedCatalogCapability, () => catalogInput.value.mode],
  ([capability]) => {
    if (!capability) return;
    const normalized = normalizeCapabilityInput(capability, catalogInput.value);
    if (JSON.stringify(normalized) !== JSON.stringify(catalogInput.value)) catalogInput.value = normalized;
  },
  { immediate: true },
);

let preflightSequence = 0;
watch(
  [isCatalogVideo, selectedCatalogOffering, catalogRequestInput, continuationParentJobId],
  async ([enabled, offering, input]) => {
    const sequence = ++preflightSequence;
    if (!enabled || !offering) {
      catalogPreflight.value = null;
      return;
    }
    try {
      const result = await preflightProviderRequest({
        schemaVersion: "2.0.0",
        canonicalModelId: offering.canonicalModelId,
        operation: "video.generate",
        input,
        ...(selectedCatalogMode.value?.requiresContinuation && continuationParentJobId.value
          ? { continuation: { parentJobId: continuationParentJobId.value } }
          : {}),
        offeringPreference: { mode: "auto", profile: "lowest_cost" },
        displayCurrency: "CNY",
      });
      if (sequence === preflightSequence) catalogPreflight.value = result;
    } catch {
      if (sequence === preflightSequence) catalogPreflight.value = null;
    }
  },
  { deep: true, immediate: true },
);

watch(
  () => imageList.value.map((item) => mediaDurationKey(item)),
  () => void refreshMediaDurations(imageList.value),
  { immediate: true },
);

watch(
  [isCatalogVideo, catalogInput],
  ([enabled, input]) => {
    if (!enabled) return;
    modelParmas.value.mode = input.mode ?? "text";
    modelParmas.value.duration = Number(input.values.durationSeconds ?? 8);
    modelParmas.value.resolution = String(input.values.resolution ?? "768P");
  },
  { deep: true, immediate: true },
);

watch(
  [selectedCatalogOffering, () => catalogInput.value.mode],
  () => {
    if (!selectedCatalogMode.value?.requiresContinuation) continuationParentJobId.value = "";
    else if (!continuationParentJobs.value.some((job) => job.id === continuationParentJobId.value)) {
      continuationParentJobId.value = continuationParentJobs.value[0]?.id ?? "";
    }
  },
  { immediate: true },
);

watch(
  () => generationJobStore.jobs.map((job) => `${job.id}:${job.state}:${job.version}`),
  () => {
    for (const job of generationJobStore.jobs) {
      if (job.state !== "succeeded" || job.consumer?.type !== "workbench" || materializedCatalogJobs.has(job.id)) continue;
      materializedCatalogJobs.add(job.id);
      void generationJobStore
        .materializeWorkbench(job.id)
        .then(() => {
          if (job.consumer?.context.projectId === project.value?.id) void getGenerateData();
        })
        .catch((error: unknown) => {
          materializedCatalogJobs.delete(job.id);
          window.$message.error((error as Error)?.message ?? $t("providerPlatform.h3.materializeFailed"));
        });
    }
  },
  { immediate: true },
);
function parseMode(value: string): VideoMode | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as ReferenceType[];
  } catch {
    return value as Exclude<VideoMode, ReferenceType[]>;
  }
  return value as Exclude<VideoMode, ReferenceType[]>;
}
/** uploadBox 作为 promptEditor 的引用预览 */
const references = computed(() => {
  function getFileTypeByExt(src: string | undefined): "image" | "video" | "audio" {
    if (!src) return "image";
    // 去掉 query 和 hash 部分
    const cleanSrc = src.split("?")[0].split("#")[0];
    const ext = cleanSrc.split(".").pop()?.toLowerCase() ?? "";

    if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
    return "image";
  }

  return imageList.value
    .filter((item) => item.src)
    .map((item) => ({
      type: getFileTypeByExt(item.src) as "image" | "video" | "audio" | "text",
      src: item.src ?? "",
    }));
});

async function getGenerateData() {
  const { data } = await axios.post("/production/workbench/getGenerateData", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
  });

  storyboardList.value = data.storyboardList;
  // 优先使用本地缓存，没有缓存则用后端数据并写入缓存
  const pid = project.value?.id;
  const sid = episodesId.value;
  if (pid != null && sid != null) {
    // 先将没有缓存的轨道写入缓存（保留已有本地编辑）
    initCacheFromTrackList(pid, sid, data.trackList);
    // 批量向后端请求文件路径对应的完整 URL
    await warmUpUrls(pid, sid);
    // 将本地缓存回写到 trackList，确保优先使用缓存数据（src 已解析为完整 URL）
    data.trackList.forEach((track: TrackItem) => {
      if (track.id == null) return;
      const cached = getCache(pid, sid, track.id);
      if (cached?.length) {
        track.medias = cached as unknown as TrackMedia[];
      }
    });
    // 整体赋值触发响应式
    trackList.value = [...data.trackList];
  }

  modelParmas.value.duration = clampDuration(data.trackList?.[activeTrackIndex.value]?.duration);
}
/** 提示词失焦时保存到后端 */
function handlePromptBlur() {
  const trackId = trackList.value[activeTrackIndex.value]?.id;
  if (trackId == null) return;
  axios.post("/production/workbench/updateVideoPrompt", { id: trackId, prompt: currentTrack.value?.prompt });
}

/** 单个轨道生成提示词 */
async function genText() {
  const track = currentTrack.value;
  if (track.id == null || track.state === "生成中") return;
  let info: { id: number; sources: string }[] = [];
  const currentTrackId = track.id;
  const rawMedias = (track.medias ?? []) as UploadItem[];
  if (modelParmas.value.mode == "text") {
    info = rawMedias.map(({ id, sources }) => ({ id: id!, sources }));
  } else {
    const frameMode = ["startEndRequired", "endFrameOptional", "startFrameOptional"];
    const preSliced = frameMode.includes(modelParmas.value.mode)
      ? rawMedias.slice(0, 2)
      : modelParmas.value.mode === "singleImage"
        ? rawMedias.slice(0, 1)
        : rawMedias;
    const filtered = preSliced.filter((item) => typeof item.id === "number" && !isNaN(item.id)).map(({ id, sources }) => ({ id: id!, sources }));
    if (frameMode.includes(modelParmas.value.mode)) info = filtered.slice(0, 2);
    else if (modelParmas.value.mode === "singleImage") info = filtered.slice(0, 1);
    else info = filtered;
  }
  track.state = "生成中";
  try {
    const { data } = await axios.post("/production/workbench/generateVideoPrompt", {
      projectId: project.value?.id,
      trackId: currentTrackId,
      info: info,
      model: modelParmas.value.model,
      mode: modelParmas.value.mode,
    });
    track.prompt = data;
    track.state = "已完成";
  } catch (e) {
    track.state = "生成失败";
    window.$message.error((e as Error)?.message ?? "提示词生成失败");
  }
}
function trackChange(prevIndex?: number) {
  // 切换前：将旧轨道的 imageList 保存到缓存
  if (prevIndex != null) {
    const prevTrack = trackList.value[prevIndex];
    const pid = project.value?.id;
    const sid = episodesId.value;
    if (pid != null && sid != null && prevTrack?.id != null) {
      setCache(pid, sid, prevTrack.id, prevTrack.medias as unknown as UploadItem[]);
    }
  }
  // 切换后：从缓存恢复当前轨道的 imageList
  const pid = project.value?.id;
  const sid = episodesId.value;
  const curTrack = trackList.value[activeTrackIndex.value];
  if (pid != null && sid != null && curTrack?.id != null) {
    const cached = getCache(pid, sid, curTrack.id);
    if (cached) {
      curTrack.medias = cached as unknown as TrackMedia[];
    }
  }
  // imageList 是基于 currentTrack.medias 的计算属性，切换轨道后自动切换数据
  if (modelParmas.value.mode == "singleImage" && imageList.value.length > 1) {
    imageList.value = imageList.value.slice(0, 1);
  }
  modelParmas.value.duration = clampDuration(trackList.value?.[activeTrackIndex.value]?.duration);
}
/** 监听当前轨道的 medias 变化，实时同步到缓存 */
watch(
  () => currentTrack.value?.medias,
  (medias) => {
    if (!medias) return;
    const pid = project.value?.id;
    const sid = episodesId.value;
    const trackId = currentTrack.value?.id;
    if (pid != null && sid != null && trackId != null) {
      setCache(pid, sid, trackId, medias as unknown as UploadItem[]);
    }
  },
  { deep: true },
);

onMounted(async () => {
  const restoreBuiltinSelection =
    project.value?.videoCatalogMode === "builtin" &&
    Boolean(project.value.videoCanonicalModelId) &&
    Boolean(project.value.videoOfferingId) &&
    Boolean(project.value.videoProviderId);
  modelParmas.value.catalogMode = restoreBuiltinSelection;
  modelParmas.value.model = restoreBuiltinSelection ? project.value?.videoOfferingId || "" : project.value?.videoModel || "";
  modelParmas.value.canonicalModelId = restoreBuiltinSelection ? project.value?.videoCanonicalModelId || undefined : undefined;
  modelParmas.value.providerId = restoreBuiltinSelection ? project.value?.videoProviderId || undefined : undefined;
  modelParmas.value.mode = project.value?.mode || "";
  await Promise.all([
    getGenerateData(),
    getProviderCatalog()
      .then((catalog) => {
        providerCatalog.value = catalog;
      })
      .catch(() => {
        window.$message.error($t("providerPlatform.loadCatalogError"));
      }),
  ]);
  if (restoreBuiltinSelection && providerCatalog.value) {
    const restored = resolvePersistedGenerationSelection(project.value, providerCatalog.value);
    if (!restored) {
      modelParmas.value.catalogMode = false;
      modelParmas.value.model = project.value?.videoModel || "";
      modelParmas.value.canonicalModelId = undefined;
      modelParmas.value.providerId = undefined;
    } else {
      const model = providerCatalog.value.models.find((candidate) => candidate.id === restored.canonicalModelId);
      modelParmas.value.offeringLabel = `${model?.name ?? restored.canonicalModelId} · ${restored.providerId}`;
    }
  }
  await nextTick();
  selectionPersistenceReady = true;
  if (hasGenerateVideoIds.value && hasGenerateVideoIds.value.length) {
    startPoll();
  }
});
/** 单个轨道生成视频 */
async function generateVideo() {
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.generateConfirm"),
    body: $t("workbench.generate.generateConfirmBody"),
    onConfirm: async () => {
      dlg.destroy();
      try {
        if (isCatalogVideo.value) {
          await generateCatalogVideo();
          return;
        }
        const { data } = await axios.post("/production/workbench/generateVideo", {
          projectId: project.value?.id,
          scriptId: episodesId.value,
          uploadData:
            modelParmas.value.mode === "text"
              ? []
              : (() => {
                  const frameMode = ["startEndRequired", "endFrameOptional", "startFrameOptional"];
                  const preSliced = frameMode.includes(modelParmas.value.mode)
                    ? imageList.value.slice(0, 2)
                    : modelParmas.value.mode === "singleImage"
                      ? imageList.value.slice(0, 1)
                      : imageList.value;
                  const filtered = preSliced
                    .filter((item) => Boolean(item.src) && typeof item.id === "number" && !isNaN(item.id))
                    .map(({ id, sources }) => ({ id, sources }));
                  if (frameMode.includes(modelParmas.value.mode)) return filtered.slice(0, 2);
                  if (modelParmas.value.mode === "singleImage") return filtered.slice(0, 1);
                  return filtered;
                })(),
          prompt: currentTrack.value.prompt,
          model: modelParmas.value.model,
          mode: modelParmas.value.mode,
          resolution: modelParmas.value.resolution,
          duration: modelParmas.value.duration,
          audio: modelParmas.value.audio,
          trackId: currentTrack.value.id,
        });
        window.$message.success($t("workbench.generate.generateStarted"));
        currentTrack.value.videoList.push({
          id: data,
          state: "生成中",
          src: "",
        });
      } catch (e) {
        window.$message.error((e as any)?.message ?? "视频发起生成请求失败");
      } finally {
      }
    },
    onCancel: () => dlg.destroy(),
  });
}

function buildWorkbenchAssetIngestItems(items: UploadItem[]): WorkbenchAssetIngestRequest["items"] {
  if (catalogInput.value.mode === "text" || catalogInput.value.mode === "edit") return [];
  return items.flatMap((item, index) => {
    if (item.id == null || !item.src) return [];
    const durationSeconds = item.fileType === "image" ? undefined : mediaDurations.value[mediaDurationKey(item)];
    return [
      {
        id: item.id,
        source: item.sources,
        kind: item.fileType,
        role: catalogAssetRole(item.fileType, index),
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
      },
    ];
  });
}

async function assertCatalogOfferingEligible(input: CapabilityInput, offering: CatalogOffering): Promise<void> {
  const result = await preflightProviderRequest({
    schemaVersion: "2.0.0",
    canonicalModelId: offering.canonicalModelId,
    operation: "video.generate",
    input,
    ...(selectedCatalogMode.value?.requiresContinuation && continuationParentJobId.value
      ? { continuation: { parentJobId: continuationParentJobId.value } }
      : {}),
    offeringPreference: { mode: "pinned", offeringId: offering.id },
    displayCurrency: "CNY",
  });
  const candidate = result.offerings.find((item) => item.offeringId === offering.id);
  if (!candidate?.eligible) {
    throw new Error(candidate?.violations[0]?.message ?? $t("providerPlatform.h3.preflightFailed"));
  }
}

async function generateCatalogVideo() {
  const projectId = Number(project.value?.id);
  const scriptId = episodesId.value;
  const track = currentTrack.value;
  const offering = selectedCatalogOffering.value;
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || scriptId == null || track?.id == null || !offering) {
    throw new Error($t("providerPlatform.h3.incompleteContext"));
  }

  await submitCatalogTrack(track, imageList.value, projectId, scriptId, offering);
  window.$message.success($t("workbench.generate.generateStarted"));
}

async function submitCatalogTrack(
  track: TrackItem,
  items: UploadItem[],
  projectId: number,
  scriptId: number,
  offering: CatalogOffering,
  retainKeyOnSuccess = false,
) {
  await refreshMediaDurations(items);
  const localInput: CapabilityInput = {
    ...catalogInput.value,
    values: { ...catalogInput.value.values, prompt: track.prompt },
    assets: buildLocalCatalogAssets(items),
  };
  await assertCatalogOfferingEligible(localInput, offering);

  const ingestItems = buildWorkbenchAssetIngestItems(items);
  const importedAssets = ingestItems.length
    ? (
        (await axios.post("/v2/media-assets/workbench", {
          projectId,
          items: ingestItems,
        } satisfies WorkbenchAssetIngestRequest)) as WorkbenchAssetIngestEnvelope
      ).data.assets
    : [];
  const input: CapabilityInput = {
    ...localInput,
    assets: importedAssets.map((asset) => ({
      assetId: asset.assetId,
      kind: asset.kind,
      role: asset.role,
      ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds }),
    })),
  };
  await assertCatalogOfferingEligible(input, offering);

  if (selectedCatalogMode.value?.requiresContinuation && !continuationParentJobId.value) {
    throw new Error($t("providerPlatform.continuationParentRequired"));
  }

  const actionScope = logicalActionScope("workbench-video", {
    offeringId: offering.id,
    input,
    projectId,
    scriptId,
    trackId: track.id,
    continuationParentJobId: continuationParentJobId.value,
  });
  await generationJobStore.submit(
    buildCatalogVideoJobRequest({
      offering,
      capabilityInput: input,
      projectId,
      scriptId,
      trackId: track.id,
      idempotencyKey: getPendingIdempotencyKey(actionScope),
      ...(selectedCatalogMode.value?.requiresContinuation ? { continuationParentJobId: continuationParentJobId.value } : {}),
    }),
  );
  if (!retainKeyOnSuccess) clearPendingIdempotencyKey(actionScope);
  return actionScope;
}

function trackUploadItems(track: TrackItem): UploadItem[] {
  if (track.id === currentTrack.value?.id) return imageList.value;
  return track.medias.flatMap((media) => {
    if (media.id == null || !media.src || (media.sources !== "assets" && media.sources !== "storyboard")) return [];
    return [
      {
        id: media.id,
        src: media.src,
        fileType: media.fileType,
        sources: media.sources,
        ...(media.sources === "storyboard" ? { index: media.index ?? 0 } : {}),
      } as UploadItem,
    ];
  });
}

async function generateCatalogBatch(tracks: TrackItem[]) {
  if (!isCatalogVideo.value) return;
  const projectId = Number(project.value?.id);
  const scriptId = episodesId.value;
  const offering = selectedCatalogOffering.value;
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || scriptId == null || !offering) {
    throw new Error($t("providerPlatform.h3.incompleteContext"));
  }
  if (selectedCatalogMode.value?.requiresContinuation) {
    throw new Error($t("providerPlatform.continuationBatchUnsupported"));
  }
  await runIdempotentBatch(
    tracks,
    (track) => submitCatalogTrack(track, trackUploadItems(track), projectId, scriptId, offering, true),
    clearPendingIdempotencyKey,
  );
}
let pollTimer: NodeJS.Timeout | null = null;
let promptPollTimer: NodeJS.Timeout | null = null;
function startPoll() {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => getVideoList(), 3000);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
const hasGenerateVideoIds = computed(() => {
  return trackList.value
    .map((track) => {
      return track.videoList.filter((i) => i.state == "生成中").map((i) => i.id);
    })
    .flatMap((i) => i);
});
const hasGeneratePromptIds = computed(() => {
  const trackIds = trackList.value.filter((t) => t.state == "生成中").map((t) => t.id);
  return trackIds;
});
/** 查询所有视频列表，并检测生成完成/失败状态 */
async function getVideoList() {
  const { data } = await axios.post("/production/workbench/checkVideoStateList", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
    videoIds: hasGenerateVideoIds.value,
  });
  if (data && data.length) {
    data.forEach((item: { id: number; state: "生成中" | "未生成" | "已完成" | "生成失败"; src?: string; errorReason?: string }) => {
      for (const track of trackList.value) {
        const findData = track.videoList.find((i) => i.id == item.id);
        if (findData) {
          findData.state = item.state;
          findData.src = item?.src ?? "";
          findData.errorReason = item?.errorReason ?? "";
          break;
        }
      }
    });
  }
}
function startPromptPoll() {
  if (promptPollTimer !== null) return;
  promptPollTimer = setInterval(() => getTrackPromptList(), 3000);
}

function stopPromptPoll() {
  if (promptPollTimer) {
    clearInterval(promptPollTimer);
    promptPollTimer = null;
  }
}
/** 查询所有视频列表，并检测生成完成/失败状态 */
async function getTrackPromptList() {
  const { data } = await axios.post("/production/workbench/checkVideoPrompt", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
    trackIds: hasGeneratePromptIds.value,
  });
  if (data && data.length) {
    data.forEach((item: { id: number; state: "生成中" | "未生成" | "已完成" | "生成失败"; prompt?: string; reason?: string }) => {
      const findData = trackList.value.find((t) => t.id == item.id);
      if (findData) {
        findData.state = item.state;
        findData.prompt = item?.prompt ?? "";
        findData.reason = item?.reason ?? "";
        if (item.state === "生成失败") {
          window.$message.error(`提示词生成失败，${item.reason ?? "未知原因"}`);
        }
      }
    });
  }
}
watch(
  () => hasGenerateVideoIds.value,
  (newVal) => {
    if (newVal && newVal.length > 0) {
      startPoll();
    } else {
      stopPoll();
    }
  },
);
watch(
  () => hasGeneratePromptIds.value,
  (newVal) => {
    if (newVal && newVal.length > 0) {
      startPromptPoll();
    } else {
      stopPromptPoll();
    }
  },
);
onUnmounted(() => {
  stopPoll();
  stopPromptPoll();
});
</script>

<style lang="scss" scoped>
.index {
  height: calc(100vh - 120px);
  gap: 16px;
  overflow-y: auto;
  .referenceImage {
  }
  .modelSelect {
  }
  .catalogControls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 0.82fr);
    gap: 12px;

    .continuationField {
      display: grid;
      grid-column: 1 / -1;
      gap: 6px;
      color: var(--td-text-color-primary);
      font-size: 13px;
    }
  }
  .generate {
    flex: 1;
    min-height: 0;
    width: 100%;
    gap: 5px;
    .prompt {
      width: 50%;
      height: 100%;
      min-height: 0;
      .videoPrompt {
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        :deep(.t-card__body) {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .promptData {
          width: 100%;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          .promptInput {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
          }
        }
      }
    }
    .video {
      width: 50%;
      height: 100%;
      min-height: 0;
    }
  }
  .track {
  }
}

@media (max-width: 1100px) {
  .index .catalogControls {
    grid-template-columns: 1fr;
  }
}
</style>
