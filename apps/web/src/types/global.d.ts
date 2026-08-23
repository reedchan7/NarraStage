interface ToonflowCredentialRef {
  providerId: string;
  slot: string;
}

interface ToonflowCredentialStatus {
  configured: boolean;
  source: "environment" | "electron_safe_storage" | "memory" | "none";
  writable: boolean;
  updatedAt?: string;
}

interface Window {
  toonflowWindow?: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  toonflowCredentials?: {
    status(request: ToonflowCredentialRef): Promise<ToonflowCredentialStatus>;
    set(request: ToonflowCredentialRef & { value: string }): Promise<ToonflowCredentialStatus>;
    delete(request: ToonflowCredentialRef): Promise<ToonflowCredentialStatus>;
  };
}

interface ImportMetaEnv {
  readonly VITE_TOONFLOW_WEB_REVISION?: string;
  readonly VITE_TOONFLOW_CONTRACT_RANGE?: string;
  readonly VITE_TOONFLOW_OPENAPI_SHA256?: string;
  readonly VITE_TOONFLOW_GENERATED_CLIENT_SHA256?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
