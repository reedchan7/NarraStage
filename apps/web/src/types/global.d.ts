interface NarraStageCredentialRef {
  providerId: string;
  slot: string;
}

interface NarraStageCredentialStatus {
  configured: boolean;
  source: "environment" | "electron_safe_storage" | "memory" | "none";
  writable: boolean;
  updatedAt?: string;
}

interface Window {
  narrastageWindow?: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  narrastageCredentials?: {
    status(request: NarraStageCredentialRef): Promise<NarraStageCredentialStatus>;
    set(request: NarraStageCredentialRef & { value: string }): Promise<NarraStageCredentialStatus>;
    delete(request: NarraStageCredentialRef): Promise<NarraStageCredentialStatus>;
  };
}

interface ImportMetaEnv {
  readonly VITE_NARRASTAGE_WEB_REVISION?: string;
  readonly VITE_NARRASTAGE_CONTRACT_RANGE?: string;
  readonly VITE_NARRASTAGE_OPENAPI_SHA256?: string;
  readonly VITE_NARRASTAGE_GENERATED_CLIENT_SHA256?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
