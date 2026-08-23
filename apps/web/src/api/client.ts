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
}

export interface ProviderSlot {
  slot: string;
  configured: boolean;
  source: ToonflowCredentialStatus["source"];
  writable: boolean;
  updatedAt?: string;
}

export interface ProviderStatus {
  providerId: string;
  health: "healthy" | "unhealthy" | "degraded" | "unknown";
  slots: ProviderSlot[];
}

export interface ProviderStatusResult {
  schemaVersion: "2.0.0";
  providers: ProviderStatus[];
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
    return apiRequest<{ message: string }>(
      "/api/project/addProject",
      { method: "POST", body: JSON.stringify(input) },
      token,
    );
  },
  providers(token: string) {
    return apiRequest<ProviderStatusResult>("/api/v2/providers", undefined, token);
  },
};
