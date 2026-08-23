import contractSource from "@toonflow/contracts/source";
import type { operations } from "@toonflow/contracts";

export interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

export interface Session {
  token: string;
  name: string;
  id: number;
  role: string;
}

export interface Project {
  id: number;
  name: string;
  intro: string | null;
  type: string | null;
  artStyle: string | null;
  videoRatio: string | null;
  projectType: string | null;
  createTime?: number;
  directorManual?: string | null;
  imageModel?: string | null;
  imageQuality?: string | null;
  mode?: string | null;
  videoModel?: string | null;
  videoCatalogMode?: string | null;
  videoCanonicalModelId?: string | null;
  videoOfferingId?: string | null;
  videoOfferingPreferenceMode?: string | null;
  videoProviderId?: string | null;
}

export interface CreateProjectInput {
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  imageQuality: string;
  mode: string;
  videoGenerationSelection?: {
    catalogMode: "builtin";
    canonicalModelId: string;
    offeringId: string;
    providerId: string;
    preferenceMode: "auto" | "pinned";
  };
}

export interface ConversationHistoryItem {
  id: string | number;
  role: "user" | "assistant";
  name?: string;
  status: "complete";
  datetime: string;
  content: Array<{
    id?: string | number;
    type: string;
    status?: "complete";
    data: unknown;
  }>;
}

export interface ScriptRecord {
  id: number;
  name: string;
  content: string;
  createTime?: number;
  extractState?: -1 | 0 | 1 | 2;
  errorReason?: string;
  relatedAssets: Array<{ id: number; name: string }>;
}

export interface ScriptInput {
  name: string;
  content: string;
  assets: number[];
}

export interface ProjectAsset {
  id: number;
  name: string;
  describe?: string | null;
  type: string;
  filePath?: string | null;
  state?: string | null;
  historyImages?: Array<{ id: number; filePath?: string | null }>;
}

type CatalogEnvelope =
  operations["getProviderCatalog"]["responses"][200]["content"]["application/json"];
type ProviderEnvelope =
  operations["getProviderCredentialStatus"]["responses"][200]["content"]["application/json"];
type SubmitJobOperation =
  operations["submitGenerationJob"]["requestBody"]["content"]["application/json"];
type UploadAssetEnvelope =
  operations["uploadOwnedMediaAsset"]["responses"][201]["content"]["application/json"];
type JobListEnvelope =
  operations["listGenerationJobs"]["responses"][200]["content"]["application/json"];

export type CatalogResult = CatalogEnvelope["data"];
export type CapabilitySchema = CatalogResult["capabilitySchemas"][number];
export type CapabilityField = CapabilitySchema["fields"][number];
export type Offering = CatalogResult["offerings"][number];
export type ProviderStatusResult = ProviderEnvelope["data"];
export type ProviderStatus = ProviderStatusResult["providers"][number];
export type ProviderSlot = ProviderStatus["slots"][number];
export type SubmitGenerationJobInput = SubmitJobOperation;
export type GenerationOperation = Extract<
  SubmitGenerationJobInput["operation"],
  "image.generate" | "video.generate"
>;
export type GenerationJob =
  operations["submitGenerationJob"]["responses"][202]["content"]["application/json"]["data"];
export type GenerationJobState = GenerationJob["state"];
export type UploadAssetResult = UploadAssetEnvelope["data"];
export type GenerationJobList = JobListEnvelope["data"];
type ApiMeta = operations["getApiMeta"]["responses"][200]["content"]["application/json"];

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function parseVersion(version: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function contractRangeIncludes(range: string, version: string): boolean {
  const minimum = range.startsWith("^") ? parseVersion(range.slice(1)) : null;
  const actual = parseVersion(version);
  if (!minimum || !actual) return false;
  const [minimumMajor, minimumMinor, minimumPatch] = minimum;
  const [actualMajor, actualMinor, actualPatch] = actual;
  const atOrAboveMinimum =
    actualMajor > minimumMajor ||
    (actualMajor === minimumMajor && actualMinor > minimumMinor) ||
    (actualMajor === minimumMajor && actualMinor === minimumMinor && actualPatch >= minimumPatch);
  if (!atOrAboveMinimum) return false;
  if (minimumMajor > 0) return actualMajor === minimumMajor;
  if (minimumMinor > 0) return actualMajor === 0 && actualMinor === minimumMinor;
  return actualMajor === 0 && actualMinor === 0 && actualPatch === minimumPatch;
}

async function assertApiCompatibility(): Promise<void> {
  const expectedRange =
    import.meta.env.VITE_TOONFLOW_CONTRACT_RANGE ?? `^${contractSource.contractVersion}`;
  const expectedOpenApi =
    import.meta.env.VITE_TOONFLOW_OPENAPI_SHA256 ?? contractSource.openapiSha256;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("/api/meta", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
    });
    const meta = (await response.json().catch(() => null)) as ApiMeta | null;
    const compatibleVersion = Boolean(
      meta && contractRangeIncludes(expectedRange, meta.contractVersion),
    );
    const compatibleSchema = Boolean(
      meta &&
      (meta.contractVersion !== contractSource.contractVersion ||
        meta.openapiSha256 === expectedOpenApi),
    );
    if (!response.ok || !compatibleVersion || !compatibleSchema) {
      throw new ApiError("客户端 API 契约与服务端不兼容，请更新 Toonflow 客户端", 426);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("API 兼容性检查超时，未提交生成任务", 408);
    }
    throw new ApiError(error instanceof Error ? error.message : "API 兼容性检查失败", 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function apiRequest<T>(
  path: `/api/${string}`,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", token);

  try {
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok || !payload || payload.code !== 200) {
      throw new ApiError(payload?.message ?? `请求失败 (${response.status})`, response.status);
    }
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("请求超时，请检查服务是否正在运行", 408);
    }
    throw new ApiError(error instanceof Error ? error.message : "无法连接 Toonflow 服务", 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  login(username: string, password: string) {
    return apiRequest<Session>("/api/login/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  projects(token: string) {
    return apiRequest<Project[]>("/api/project/getProject", { method: "POST" }, token);
  },
  createProject(token: string, input: CreateProjectInput) {
    return apiRequest<{ message: string; id: number }>(
      "/api/project/addProject",
      { method: "POST", body: JSON.stringify(input) },
      token,
    );
  },
  updateImageGenerationSelection(token: string, projectId: number, offeringId: string) {
    return apiRequest<{ offeringId: string }>(
      "/api/project/updateImageGenerationSelection",
      { method: "POST", body: JSON.stringify({ id: projectId, offeringId }) },
      token,
    );
  },
  updateGenerationSelection(
    token: string,
    projectId: number,
    selection: {
      catalogMode: "builtin";
      canonicalModelId: string;
      offeringId: string;
      providerId: string;
      preferenceMode: "pinned";
    },
  ) {
    return apiRequest<{ selection: typeof selection }>(
      "/api/project/updateGenerationSelection",
      { method: "POST", body: JSON.stringify({ id: projectId, selection }) },
      token,
    );
  },
  conversationHistory(token: string, projectId: number) {
    return apiRequest<ConversationHistoryItem[]>(
      "/api/agents/getMemory",
      {
        method: "POST",
        body: JSON.stringify({ projectId, agentType: "scriptAgent" }),
      },
      token,
    );
  },
  clearConversation(token: string, projectId: number) {
    return apiRequest<null>(
      "/api/agents/clearMemory",
      {
        method: "POST",
        body: JSON.stringify({ projectId, agentType: "scriptAgent", type: "all" }),
      },
      token,
    );
  },
  scripts(token: string, projectId: number, name = "") {
    return apiRequest<ScriptRecord[]>(
      "/api/script/getScrptApi",
      { method: "POST", body: JSON.stringify({ projectId, name }) },
      token,
    );
  },
  createScript(token: string, projectId: number, input: ScriptInput) {
    return apiRequest<{ message: string }>(
      "/api/script/addScript",
      { method: "POST", body: JSON.stringify({ ...input, projectId }) },
      token,
    );
  },
  updateScript(token: string, id: number, input: ScriptInput) {
    return apiRequest<{ message: string }>(
      "/api/script/updateScript",
      { method: "POST", body: JSON.stringify({ ...input, id }) },
      token,
    );
  },
  deleteScripts(token: string, ids: number[]) {
    return apiRequest<{ message: string }>(
      "/api/script/delScript",
      { method: "POST", body: JSON.stringify({ ids }) },
      token,
    );
  },
  projectAssets(token: string, projectId: number) {
    return apiRequest<ProjectAsset[]>(
      "/api/cornerScape/getAllAssets",
      { method: "POST", body: JSON.stringify({ projectId }) },
      token,
    );
  },
  providers(token: string) {
    return apiRequest<ProviderStatusResult>("/api/v2/providers", undefined, token);
  },
  catalog(token: string) {
    return apiRequest<CatalogResult>("/api/v2/catalog", undefined, token);
  },
  async submitJob(token: string, input: SubmitGenerationJobInput) {
    await assertApiCompatibility();
    return apiRequest<GenerationJob>(
      "/api/v2/jobs",
      { method: "POST", body: JSON.stringify(input) },
      token,
    );
  },
  jobs(token: string) {
    return apiRequest<GenerationJobList>("/api/v2/jobs?limit=100", undefined, token);
  },
  job(token: string, id: string) {
    return apiRequest<GenerationJob>(`/api/v2/jobs/${id}`, undefined, token);
  },
  cancelJob(token: string, id: string) {
    return apiRequest<GenerationJob>(
      `/api/v2/jobs/${id}/cancel`,
      { method: "POST", body: JSON.stringify({ reason: "user_requested" }) },
      token,
    );
  },
  async mediaAsset(token: string, assetId: string): Promise<Blob> {
    const response = await fetch(`/api/v2/media-assets/${encodeURIComponent(assetId)}/content`, {
      headers: { Authorization: token },
    });
    if (!response.ok) throw new ApiError(`素材读取失败 (${response.status})`, response.status);
    return response.blob();
  },
  async uploadMediaAsset(token: string, file: File): Promise<UploadAssetResult> {
    if (!file.type) throw new ApiError("无法识别素材类型", 400);
    const response = await fetch("/api/v2/media-assets/upload", {
      method: "PUT",
      headers: {
        Accept: "application/json",
        Authorization: token,
        "X-Toonflow-Media-Type": file.type,
        "X-Toonflow-Filename": encodeURIComponent(file.name),
      },
      credentials: "same-origin",
      body: file,
    });
    const payload = (await response.json().catch(() => null)) as
      | ApiEnvelope<UploadAssetResult>
      | { message?: string }
      | null;
    if (!response.ok || !payload || !("code" in payload) || payload.code !== 200) {
      throw new ApiError(payload?.message ?? `素材上传失败 (${response.status})`, response.status);
    }
    return payload.data;
  },
};
