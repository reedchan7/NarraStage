import generatedSource from "./generated/source.json";

const env = import.meta.env as ImportMetaEnv & {
  VITE_TOONFLOW_WEB_REVISION?: string;
  VITE_TOONFLOW_CONTRACT_RANGE?: string;
  VITE_TOONFLOW_OPENAPI_SHA256?: string;
  VITE_TOONFLOW_GENERATED_CLIENT_SHA256?: string;
};

export const webBuildMeta = Object.freeze({
  schemaVersion: 1 as const,
  webRevision: env.VITE_TOONFLOW_WEB_REVISION ?? "development",
  supportedContractRange: env.VITE_TOONFLOW_CONTRACT_RANGE ?? "^2.0.0",
  openapiSha256: env.VITE_TOONFLOW_OPENAPI_SHA256 ?? generatedSource.openapiSha256,
  generatedClientSha256: env.VITE_TOONFLOW_GENERATED_CLIENT_SHA256 ?? generatedSource.generatedClientSha256,
});
