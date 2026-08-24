/**
 * Generated from data/contracts/openapi.v2.json.
 * Do not edit directly.
 */

export interface paths {
  "/api/meta": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getApiMeta"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/catalog": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getProviderCatalog"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/files/upload": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["uploadProviderFile"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["listGenerationJobs"];
    put?: never;
    post: operations["submitGenerationJob"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs/{id}": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getGenerationJob"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs/{id}/cancel": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["cancelGenerationJob"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs/{id}/materialize-asset-image": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["materializeAssetImageGeneration"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs/{id}/materialize-workbench": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["materializeWorkbenchGeneration"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs/{id}/reconcile": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["reconcileGenerationJob"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/jobs/{id}/resume-import": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["resumeGenerationJobImport"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/language/generate": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["generateLanguage"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/language/stream": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["streamLanguage"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/media-assets/{id}/content": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getOwnedMediaAssetContent"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/media-assets/upload": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put: operations["uploadOwnedMediaAsset"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/media-assets/workbench": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["ingestWorkbenchAssets"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/preflight": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["preflightGeneration"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/providers": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getProviderCredentialStatus"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/providers/{providerId}/health-check": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: operations["checkProviderHealth"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v2/support": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getProviderSupport"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: never;
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export interface operations {
  getApiMeta: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            backendRevision: string;
            contractVersion: string;
            openapiSha256: string;
            webRevision: string;
          };
        };
      };
    };
  };
  getProviderCatalog: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              availability: {
                available: boolean;
                deploymentRegion: string;
                health: "unknown" | "healthy" | "degraded" | "unhealthy";
                offeringId: string;
                operation:
                  | "language.generate"
                  | "language.stream"
                  | "image.generate"
                  | "image.edit"
                  | "video.generate"
                  | "video.status"
                  | "video.cancel"
                  | "files.upload"
                  | "search.ground";
                reasonCodes: string[];
                requiredEvidence:
                  | "implemented"
                  | "contract_verified"
                  | "live_verified"
                  | "product_accepted";
              }[];
              capabilitySchemas: {
                assetModes?: {
                  durationLimits?: {
                    kinds: ("image" | "video" | "audio")[];
                    maximumCombinedSeconds?: number;
                    maximumPerAssetSeconds?: number;
                    minimumPerAssetSeconds?: number;
                  }[];
                  fieldRules?: {
                    allowedValues?: (string | number | boolean)[];
                    enumValues?: string[];
                    path: string;
                    required?: boolean;
                  }[];
                  id: string;
                  label: string;
                  maximumTotalAssets?: number;
                  minimumTotalAssets?: number;
                  requiresAnyRole?: string[];
                  requiresContinuation?: boolean;
                  roles: {
                    kinds: ("image" | "video" | "audio")[];
                    maximum: number;
                    minimum: number;
                    role: string;
                  }[];
                }[];
                fields: {
                  advanced?: boolean;
                  allowedValues?: (string | number | boolean)[];
                  enumValues?: string[];
                  kind: "text" | "integer" | "boolean" | "enum" | "assets";
                  label: string;
                  maximum?: number;
                  maximumLength?: number;
                  minimum?: number;
                  path: string;
                  required: boolean;
                  unit?: string;
                }[];
                id: string;
                operation:
                  | "language.generate"
                  | "language.stream"
                  | "image.generate"
                  | "image.edit"
                  | "video.generate"
                  | "video.status"
                  | "video.cancel"
                  | "files.upload"
                  | "search.ground";
                schemaVersion: string;
                valueConstraints?: {
                  require: { allowedValues: (string | number | boolean)[]; path: string }[];
                  when: { path: string; values: (string | number | boolean)[] };
                }[];
              }[];
              models: {
                family: string;
                id: string;
                lifecycle: "stable" | "preview" | "experimental" | "deprecated";
                name: string;
                owner: string;
              }[];
              offerings: {
                accessChannel: "official" | "aggregator" | "compatibility";
                canonicalModelId: string;
                id: string;
                lifecycle: "stable" | "preview" | "experimental" | "deprecated";
                operations: {
                  capabilitySchemaId: string;
                  enabled: boolean;
                  features?: (
                    | "streaming"
                    | "tools"
                    | "thinking"
                    | "structured_output"
                    | "image_input"
                    | "video_input"
                    | "audio_input"
                    | "pdf_input"
                    | "provider_files"
                    | "grounding"
                  )[];
                  operation:
                    | "language.generate"
                    | "language.stream"
                    | "image.generate"
                    | "image.edit"
                    | "video.generate"
                    | "video.status"
                    | "video.cancel"
                    | "files.upload"
                    | "search.ground";
                  outputProfiles?: {
                    delivery: "native" | "regenerated" | "upscaled" | "provider_managed";
                    resolution: string;
                    sourceResolution?: string;
                  }[];
                }[];
                priceSnapshotId?: string;
                providerId: string;
                providerModelId: string;
                support: {
                  evidence: (
                    | "implemented"
                    | "contract_verified"
                    | "live_verified"
                    | "product_accepted"
                  )[];
                  implementation: "declared" | "implemented";
                  lastVerifiedAt?: string;
                  verifiedProviderModelId?: string;
                };
              }[];
              priceSnapshots: {
                asOf: string;
                comparisonBasisByResolution?: {} & Record<string, string>;
                coverage: {
                  inputAudio: "included" | "metered" | "unknown";
                  inputImage: "included" | "metered" | "unknown";
                  referenceVideo: "included" | "metered" | "unknown";
                };
                currency: string;
                expiresAt: string;
                id: string;
                offeringId: string;
                operation:
                  | "language.generate"
                  | "language.stream"
                  | "image.generate"
                  | "image.edit"
                  | "video.generate"
                  | "video.status"
                  | "video.cancel"
                  | "files.upload"
                  | "search.ground";
                pricingModel: "request_meters" | "provider_compute";
                rates: {
                  includedUnits?: number;
                  meter:
                    | "output_video_second"
                    | "input_image"
                    | "input_reference_video_second"
                    | "input_audio_second"
                    | "provider_compute_second";
                  selector?: { resolution?: string };
                  unitPrice: string;
                }[];
                sourceScope: "public" | "account" | "contract";
                sourceUrl: string;
              }[];
              providers: {
                credentialSlots: { environmentVariables: string[]; slot: string }[];
                id: string;
                name: string;
                regions?: string[];
              }[];
              schemaVersion: string;
            };
            message: string;
          };
        };
      };
    };
  };
  uploadProviderFile: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          canonicalModelId: string;
          idempotencyKey: string;
          input:
            | {
                byteLength: number;
                dataBase64: string;
                expiresAfterSeconds?: number;
                filename: string;
                mediaType: string;
              }
            | {
                assetId: string;
                expiresAfterSeconds?: number;
                filename?: string;
                source: "owned_asset";
              };
          offeringId: string;
          schemaVersion: "1.0.0";
        };
      };
    };
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              byteLength?: number;
              expiresAt?: string;
              fileId: string;
              filename?: string;
              mediaType: string;
              providerId: string;
              schemaVersion: "1.0.0";
            };
            message: string;
          };
        };
      };
    };
  };
  listGenerationJobs: {
    parameters: {
      query: { limit?: number; cursor?: string; recovery?: boolean };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              jobs: {
                cancelReason?: string;
                cancelRequestedAt?: number;
                canonicalModelId: string;
                consumer?:
                  | {
                      context: { projectId: number; scriptId: number; trackId: number };
                      key: string;
                      type: "workbench";
                    }
                  | {
                      context: {
                        assetId: number;
                        assetType: "role" | "scene" | "tool";
                        projectId: number;
                      };
                      key: string;
                      type: "asset_image";
                    };
                continuation?: { parentJobId: string };
                createdAt: number;
                error?: unknown;
                id: string;
                idempotencyKey: string;
                input: {
                  assets: {
                    assetId: string;
                    durationSeconds?: number;
                    kind: "image" | "video" | "audio";
                    role: string;
                  }[];
                  mode?: string;
                  values: {} & Record<string, unknown>;
                };
                nextRunAt: number;
                offeringId: string;
                operation:
                  | "language.generate"
                  | "language.stream"
                  | "image.generate"
                  | "image.edit"
                  | "video.generate"
                  | "video.status"
                  | "video.cancel"
                  | "files.upload"
                  | "search.ground";
                pollAttemptCount: number;
                providerId: string;
                providerOutcome?:
                  | "unknown"
                  | "queued"
                  | "running"
                  | "succeeded"
                  | "failed"
                  | "cancelled";
                requiresReconciliation: boolean;
                result?: unknown;
                schemaVersion: string;
                state:
                  | "queued"
                  | "preparing_assets"
                  | "submitting"
                  | "submitted"
                  | "remote_queued"
                  | "running"
                  | "importing"
                  | "submission_unknown"
                  | "succeeded"
                  | "failed"
                  | "cancelled"
                  | "abandoned";
                updatedAt: number;
                version: number;
              }[];
              nextCursor?: string;
            };
            message: string;
          };
        };
      };
    };
  };
  submitGenerationJob: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          canonicalModelId: string;
          consumer?:
            | {
                context: { projectId: number; scriptId: number; trackId: number };
                key: string;
                type: "workbench";
              }
            | {
                context: {
                  assetId: number;
                  assetType: "role" | "scene" | "tool";
                  projectId: number;
                };
                key: string;
                type: "asset_image";
              };
          continuation?: { parentJobId: string };
          idempotencyKey: string;
          input: {
            assets: {
              assetId: string;
              durationSeconds?: number;
              kind: "image" | "video" | "audio";
              role: string;
            }[];
            mode?: string;
            values: {} & Record<string, unknown>;
          };
          offeringId: string;
          operation:
            | "language.generate"
            | "language.stream"
            | "image.generate"
            | "image.edit"
            | "video.generate"
            | "video.status"
            | "video.cancel"
            | "files.upload"
            | "search.ground";
          schemaVersion: "2.0.0";
        };
      };
    };
    responses: {
      202: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              cancelReason?: string;
              cancelRequestedAt?: number;
              canonicalModelId: string;
              consumer?:
                | {
                    context: { projectId: number; scriptId: number; trackId: number };
                    key: string;
                    type: "workbench";
                  }
                | {
                    context: {
                      assetId: number;
                      assetType: "role" | "scene" | "tool";
                      projectId: number;
                    };
                    key: string;
                    type: "asset_image";
                  };
              continuation?: { parentJobId: string };
              createdAt: number;
              error?: unknown;
              id: string;
              idempotencyKey: string;
              input: {
                assets: {
                  assetId: string;
                  durationSeconds?: number;
                  kind: "image" | "video" | "audio";
                  role: string;
                }[];
                mode?: string;
                values: {} & Record<string, unknown>;
              };
              nextRunAt: number;
              offeringId: string;
              operation:
                | "language.generate"
                | "language.stream"
                | "image.generate"
                | "image.edit"
                | "video.generate"
                | "video.status"
                | "video.cancel"
                | "files.upload"
                | "search.ground";
              pollAttemptCount: number;
              providerId: string;
              providerOutcome?:
                | "unknown"
                | "queued"
                | "running"
                | "succeeded"
                | "failed"
                | "cancelled";
              requiresReconciliation: boolean;
              result?: unknown;
              schemaVersion: string;
              state:
                | "queued"
                | "preparing_assets"
                | "submitting"
                | "submitted"
                | "remote_queued"
                | "running"
                | "importing"
                | "submission_unknown"
                | "succeeded"
                | "failed"
                | "cancelled"
                | "abandoned";
              updatedAt: number;
              version: number;
            };
            message: string;
          };
        };
      };
    };
  };
  getGenerationJob: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              cancelReason?: string;
              cancelRequestedAt?: number;
              canonicalModelId: string;
              consumer?:
                | {
                    context: { projectId: number; scriptId: number; trackId: number };
                    key: string;
                    type: "workbench";
                  }
                | {
                    context: {
                      assetId: number;
                      assetType: "role" | "scene" | "tool";
                      projectId: number;
                    };
                    key: string;
                    type: "asset_image";
                  };
              continuation?: { parentJobId: string };
              createdAt: number;
              error?: unknown;
              id: string;
              idempotencyKey: string;
              input: {
                assets: {
                  assetId: string;
                  durationSeconds?: number;
                  kind: "image" | "video" | "audio";
                  role: string;
                }[];
                mode?: string;
                values: {} & Record<string, unknown>;
              };
              nextRunAt: number;
              offeringId: string;
              operation:
                | "language.generate"
                | "language.stream"
                | "image.generate"
                | "image.edit"
                | "video.generate"
                | "video.status"
                | "video.cancel"
                | "files.upload"
                | "search.ground";
              pollAttemptCount: number;
              providerId: string;
              providerOutcome?:
                | "unknown"
                | "queued"
                | "running"
                | "succeeded"
                | "failed"
                | "cancelled";
              requiresReconciliation: boolean;
              result?: unknown;
              schemaVersion: string;
              state:
                | "queued"
                | "preparing_assets"
                | "submitting"
                | "submitted"
                | "remote_queued"
                | "running"
                | "importing"
                | "submission_unknown"
                | "succeeded"
                | "failed"
                | "cancelled"
                | "abandoned";
              updatedAt: number;
              version: number;
            };
            message: string;
          };
        };
      };
    };
  };
  cancelGenerationJob: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody: { content: { "application/json": { reason: string } } };
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              cancelReason?: string;
              cancelRequestedAt?: number;
              canonicalModelId: string;
              consumer?:
                | {
                    context: { projectId: number; scriptId: number; trackId: number };
                    key: string;
                    type: "workbench";
                  }
                | {
                    context: {
                      assetId: number;
                      assetType: "role" | "scene" | "tool";
                      projectId: number;
                    };
                    key: string;
                    type: "asset_image";
                  };
              continuation?: { parentJobId: string };
              createdAt: number;
              error?: unknown;
              id: string;
              idempotencyKey: string;
              input: {
                assets: {
                  assetId: string;
                  durationSeconds?: number;
                  kind: "image" | "video" | "audio";
                  role: string;
                }[];
                mode?: string;
                values: {} & Record<string, unknown>;
              };
              nextRunAt: number;
              offeringId: string;
              operation:
                | "language.generate"
                | "language.stream"
                | "image.generate"
                | "image.edit"
                | "video.generate"
                | "video.status"
                | "video.cancel"
                | "files.upload"
                | "search.ground";
              pollAttemptCount: number;
              providerId: string;
              providerOutcome?:
                | "unknown"
                | "queued"
                | "running"
                | "succeeded"
                | "failed"
                | "cancelled";
              requiresReconciliation: boolean;
              result?: unknown;
              schemaVersion: string;
              state:
                | "queued"
                | "preparing_assets"
                | "submitting"
                | "submitted"
                | "remote_queued"
                | "running"
                | "importing"
                | "submission_unknown"
                | "succeeded"
                | "failed"
                | "cancelled"
                | "abandoned";
              updatedAt: number;
              version: number;
            };
            message: string;
          };
        };
      };
    };
  };
  materializeAssetImageGeneration: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: { imageId: number; url: string };
            message: string;
          };
        };
      };
    };
  };
  materializeWorkbenchGeneration: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: { url: string; videoId: number };
            message: string;
          };
        };
      };
    };
  };
  reconcileGenerationJob: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          action: "adopt_handle" | "confirm_not_submitted" | "abandon";
          evidence?: {
            checkedAt: string;
            kind: "provider_lookup";
            lookupMethod: "provider_api" | "provider_console";
            outcome: "not_found";
            requestIdentity: string;
            responseSha256: string;
          };
          providerHandle?: string;
          reason: string;
        };
      };
    };
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              cancelReason?: string;
              cancelRequestedAt?: number;
              canonicalModelId: string;
              consumer?:
                | {
                    context: { projectId: number; scriptId: number; trackId: number };
                    key: string;
                    type: "workbench";
                  }
                | {
                    context: {
                      assetId: number;
                      assetType: "role" | "scene" | "tool";
                      projectId: number;
                    };
                    key: string;
                    type: "asset_image";
                  };
              continuation?: { parentJobId: string };
              createdAt: number;
              error?: unknown;
              id: string;
              idempotencyKey: string;
              input: {
                assets: {
                  assetId: string;
                  durationSeconds?: number;
                  kind: "image" | "video" | "audio";
                  role: string;
                }[];
                mode?: string;
                values: {} & Record<string, unknown>;
              };
              nextRunAt: number;
              offeringId: string;
              operation:
                | "language.generate"
                | "language.stream"
                | "image.generate"
                | "image.edit"
                | "video.generate"
                | "video.status"
                | "video.cancel"
                | "files.upload"
                | "search.ground";
              pollAttemptCount: number;
              providerId: string;
              providerOutcome?:
                | "unknown"
                | "queued"
                | "running"
                | "succeeded"
                | "failed"
                | "cancelled";
              requiresReconciliation: boolean;
              result?: unknown;
              schemaVersion: string;
              state:
                | "queued"
                | "preparing_assets"
                | "submitting"
                | "submitted"
                | "remote_queued"
                | "running"
                | "importing"
                | "submission_unknown"
                | "succeeded"
                | "failed"
                | "cancelled"
                | "abandoned";
              updatedAt: number;
              version: number;
            };
            message: string;
          };
        };
      };
    };
  };
  resumeGenerationJobImport: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              cancelReason?: string;
              cancelRequestedAt?: number;
              canonicalModelId: string;
              consumer?:
                | {
                    context: { projectId: number; scriptId: number; trackId: number };
                    key: string;
                    type: "workbench";
                  }
                | {
                    context: {
                      assetId: number;
                      assetType: "role" | "scene" | "tool";
                      projectId: number;
                    };
                    key: string;
                    type: "asset_image";
                  };
              continuation?: { parentJobId: string };
              createdAt: number;
              error?: unknown;
              id: string;
              idempotencyKey: string;
              input: {
                assets: {
                  assetId: string;
                  durationSeconds?: number;
                  kind: "image" | "video" | "audio";
                  role: string;
                }[];
                mode?: string;
                values: {} & Record<string, unknown>;
              };
              nextRunAt: number;
              offeringId: string;
              operation:
                | "language.generate"
                | "language.stream"
                | "image.generate"
                | "image.edit"
                | "video.generate"
                | "video.status"
                | "video.cancel"
                | "files.upload"
                | "search.ground";
              pollAttemptCount: number;
              providerId: string;
              providerOutcome?:
                | "unknown"
                | "queued"
                | "running"
                | "succeeded"
                | "failed"
                | "cancelled";
              requiresReconciliation: boolean;
              result?: unknown;
              schemaVersion: string;
              state:
                | "queued"
                | "preparing_assets"
                | "submitting"
                | "submitted"
                | "remote_queued"
                | "running"
                | "importing"
                | "submission_unknown"
                | "succeeded"
                | "failed"
                | "cancelled"
                | "abandoned";
              updatedAt: number;
              version: number;
            };
            message: string;
          };
        };
      };
    };
  };
  generateLanguage: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          canonicalModelId: string;
          idempotencyKey: string;
          input: {
            grounding?: { mode: "web_search" };
            maxOutputTokens?: number;
            messages: (
              | { content: string; role: "system" }
              | {
                  content: (
                    | { text: string; type: "text" }
                    | {
                        detail?: "auto" | "low" | "high" | "original";
                        source:
                          | {
                              byteLength: number;
                              dataBase64: string;
                              height?: number;
                              mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                              type: "inline";
                              width?: number;
                            }
                          | {
                              byteLength?: number;
                              height?: number;
                              mediaType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                              type: "url";
                              url: string;
                              width?: number;
                            }
                          | {
                              byteLength?: number;
                              expiresAt?: string;
                              fileId: string;
                              mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                              providerId: string;
                              type: "provider_file";
                            };
                        type: "image";
                      }
                    | {
                        source:
                          | {
                              byteLength: number;
                              dataBase64: string;
                              mediaType: string;
                              type: "inline";
                            }
                          | { byteLength?: number; mediaType: string; type: "url"; url: string }
                          | {
                              byteLength?: number;
                              expiresAt?: string;
                              fileId: string;
                              mediaType: string;
                              providerId: string;
                              type: "provider_file";
                            };
                        type: "file";
                      }
                  )[];
                  role: "user";
                }
              | {
                  content: (
                    | { text: string; type: "text" }
                    | { text: string; type: "reasoning" }
                    | { input: unknown; toolCallId: string; toolName: string; type: "tool_call" }
                  )[];
                  role: "assistant";
                }
              | {
                  content: {
                    isError?: boolean;
                    output: string | unknown;
                    toolCallId: string;
                    toolName: string;
                    type: "tool_result";
                  }[];
                  role: "tool";
                }
            )[];
            responseFormat?:
              | { type: "text" }
              | {
                  description?: string;
                  name?: string;
                  schema?: {} & Record<string, unknown>;
                  type: "json";
                };
            thinking?: {
              effort?: "low" | "high" | "max";
              mode: "enabled" | "disabled" | "adaptive";
            };
            toolChoice?: "auto" | "none" | "required" | { toolName: string; type: "tool" };
            tools?: {
              description?: string;
              inputSchema: {} & Record<string, unknown>;
              name: string;
              strict?: boolean;
            }[];
          };
          offeringId: string;
          schemaVersion: "1.0.0";
        };
      };
    };
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "error" | "other";
              providerMetadata?: {} & Record<string, unknown>;
              providerRequestId?: string;
              reasoning: string;
              resolvedModelId: string;
              schemaVersion: "1.0.0";
              sources?: (
                | {
                    id: string;
                    providerMetadata?: {} & Record<string, unknown>;
                    sourceType: "url";
                    title?: string;
                    url: string;
                  }
                | {
                    filename?: string;
                    id: string;
                    mediaType: string;
                    providerMetadata?: {} & Record<string, unknown>;
                    sourceType: "document";
                    title: string;
                  }
              )[];
              text: string;
              toolCalls: { input: unknown; toolCallId: string; toolName: string }[];
              usage: {
                cacheReadTokens?: number;
                cacheWriteTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                reasoningTokens?: number;
              };
            };
            message: string;
          };
        };
      };
    };
  };
  streamLanguage: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          canonicalModelId: string;
          idempotencyKey: string;
          input: {
            grounding?: { mode: "web_search" };
            maxOutputTokens?: number;
            messages: (
              | { content: string; role: "system" }
              | {
                  content: (
                    | { text: string; type: "text" }
                    | {
                        detail?: "auto" | "low" | "high" | "original";
                        source:
                          | {
                              byteLength: number;
                              dataBase64: string;
                              height?: number;
                              mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                              type: "inline";
                              width?: number;
                            }
                          | {
                              byteLength?: number;
                              height?: number;
                              mediaType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                              type: "url";
                              url: string;
                              width?: number;
                            }
                          | {
                              byteLength?: number;
                              expiresAt?: string;
                              fileId: string;
                              mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                              providerId: string;
                              type: "provider_file";
                            };
                        type: "image";
                      }
                    | {
                        source:
                          | {
                              byteLength: number;
                              dataBase64: string;
                              mediaType: string;
                              type: "inline";
                            }
                          | { byteLength?: number; mediaType: string; type: "url"; url: string }
                          | {
                              byteLength?: number;
                              expiresAt?: string;
                              fileId: string;
                              mediaType: string;
                              providerId: string;
                              type: "provider_file";
                            };
                        type: "file";
                      }
                  )[];
                  role: "user";
                }
              | {
                  content: (
                    | { text: string; type: "text" }
                    | { text: string; type: "reasoning" }
                    | { input: unknown; toolCallId: string; toolName: string; type: "tool_call" }
                  )[];
                  role: "assistant";
                }
              | {
                  content: {
                    isError?: boolean;
                    output: string | unknown;
                    toolCallId: string;
                    toolName: string;
                    type: "tool_result";
                  }[];
                  role: "tool";
                }
            )[];
            responseFormat?:
              | { type: "text" }
              | {
                  description?: string;
                  name?: string;
                  schema?: {} & Record<string, unknown>;
                  type: "json";
                };
            thinking?: {
              effort?: "low" | "high" | "max";
              mode: "enabled" | "disabled" | "adaptive";
            };
            toolChoice?: "auto" | "none" | "required" | { toolName: string; type: "tool" };
            tools?: {
              description?: string;
              inputSchema: {} & Record<string, unknown>;
              name: string;
              strict?: boolean;
            }[];
          };
          offeringId: string;
          schemaVersion: "1.0.0";
        };
      };
    };
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "text/event-stream":
            | { delta: string; type: "text_delta" }
            | { delta: string; type: "reasoning_delta" }
            | { call: { input: unknown; toolCallId: string; toolName: string }; type: "tool_call" }
            | {
                source:
                  | {
                      id: string;
                      providerMetadata?: {} & Record<string, unknown>;
                      sourceType: "url";
                      title?: string;
                      url: string;
                    }
                  | {
                      filename?: string;
                      id: string;
                      mediaType: string;
                      providerMetadata?: {} & Record<string, unknown>;
                      sourceType: "document";
                      title: string;
                    };
                type: "source";
              }
            | {
                finishReason:
                  | "stop"
                  | "length"
                  | "content_filter"
                  | "tool_calls"
                  | "error"
                  | "other";
                providerMetadata?: {} & Record<string, unknown>;
                providerRequestId?: string;
                resolvedModelId: string;
                type: "finish";
                usage: {
                  cacheReadTokens?: number;
                  cacheWriteTokens?: number;
                  inputTokens?: number;
                  outputTokens?: number;
                  reasoningTokens?: number;
                };
              }
            | {
                error: {
                  category:
                    | "auth"
                    | "forbidden"
                    | "invalid_input"
                    | "billing"
                    | "quota"
                    | "rate_limit"
                    | "moderation"
                    | "unavailable"
                    | "timeout"
                    | "cancelled"
                    | "invalid_response"
                    | "submission_unknown";
                  code: string;
                  detail?: {} & Record<string, unknown>;
                  message: string;
                  providerRequestId?: string;
                  retryable: boolean;
                  retryAfterMs?: number;
                };
                type: "error";
              };
        };
      };
    };
  };
  getOwnedMediaAssetContent: {
    parameters: { query?: never; header?: never; path: { id: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: { headers: Record<string, unknown>; content: { "application/octet-stream": string } };
    };
  };
  uploadOwnedMediaAsset: {
    parameters: {
      query?: never;
      header: { "X-NarraStage-Media-Type": string; "X-NarraStage-Filename": string };
      path?: never;
      cookie?: never;
    };
    requestBody: { content: { "application/octet-stream": string } };
    responses: {
      201: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              assetId: string;
              byteLength: number;
              filename: string;
              kind: "image" | "video" | "audio" | "file";
              mediaType: string;
              sha256: string;
            };
            message: string;
          };
        };
      };
    };
  };
  ingestWorkbenchAssets: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          items: {
            durationSeconds?: number;
            id: number;
            kind: "image" | "video" | "audio";
            role: string;
            source: "assets" | "storyboard";
          }[];
          projectId: number;
        };
      };
    };
    responses: {
      201: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              assets: {
                assetId: string;
                byteLength: number;
                durationSeconds?: number;
                kind: "image" | "video" | "audio";
                mimeType: string;
                role: string;
                sha256: string;
              }[];
            };
            message: string;
          };
        };
      };
    };
  };
  preflightGeneration: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody: {
      content: {
        "application/json": {
          canonicalModelId: string;
          continuation?: { parentJobId: string };
          displayCurrency: string;
          input: {
            assets: {
              assetId: string;
              durationSeconds?: number;
              kind: "image" | "video" | "audio";
              role: string;
            }[];
            mode?: string;
            values: {} & Record<string, unknown>;
          };
          offeringPreference:
            | { mode: "pinned"; offeringId: string }
            | { mode: "auto"; profile: "balanced" | "lowest_cost" };
          operation:
            | "language.generate"
            | "language.stream"
            | "image.generate"
            | "image.edit"
            | "video.generate"
            | "video.status"
            | "video.cancel"
            | "files.upload"
            | "search.ground";
          schemaVersion: "2.0.0";
        };
      };
    };
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              canonicalModelId: string;
              offerings: {
                accessChannel: "official" | "aggregator" | "compatibility";
                cost?: {
                  comparisonBasis?: string;
                  components: {
                    amount: { amount: string; currency: string };
                    meter:
                      | "output_video_second"
                      | "input_image"
                      | "input_reference_video_second"
                      | "input_audio_second"
                      | "provider_compute_second";
                    quantity: string;
                    unitPrice: { amount: string; currency: string };
                  }[];
                  displayTotal?: { amount: string; currency: string };
                  fx?: {
                    asOf: string;
                    baseCurrency: string;
                    expiresAt: string;
                    quoteCurrency: string;
                    rate: string;
                    sourceUrl: string;
                  };
                  issues: string[];
                  offeringId: string;
                  originalTotal: { amount: string; currency: string };
                  priceAsOf: string;
                  priceSourceUrl: string;
                  status: "complete" | "incomplete";
                };
                eligible: boolean;
                offeringId: string;
                providerId: string;
                violations: { code: string; message: string; path: string }[];
                warnings: { code: string; message: string; path?: string }[];
              }[];
              operation:
                | "language.generate"
                | "language.stream"
                | "image.generate"
                | "image.edit"
                | "video.generate"
                | "video.status"
                | "video.cancel"
                | "files.upload"
                | "search.ground";
              schemaVersion: "2.0.0";
              selection: {
                offeringId?: string;
                reasonCodes: string[];
                status: "selected" | "unavailable";
              };
            };
            message: string;
          };
        };
      };
    };
  };
  getProviderCredentialStatus: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              providers: {
                health: "unknown" | "healthy" | "degraded" | "unhealthy";
                providerId: string;
                slots: {
                  configured: boolean;
                  slot: string;
                  source: "environment" | "electron_safe_storage" | "memory" | "none";
                  updatedAt?: string;
                  writable: boolean;
                }[];
              }[];
              schemaVersion: "2.0.0";
            };
            message: string;
          };
        };
      };
    };
  };
  checkProviderHealth: {
    parameters: { query?: never; header?: never; path: { providerId: string }; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              checkedAt?: string;
              health: "unknown" | "healthy" | "degraded" | "unhealthy";
              offerings: {
                capabilitiesObserved: boolean;
                checkedAt?: string;
                deploymentRegion: string;
                health: "unknown" | "healthy" | "degraded" | "unhealthy";
                offeringId: string;
                providerId: string;
                providerModelId: string;
                reasonCode?: string;
                resolvedProviderModelId?: string;
                revisionObserved: boolean;
                supportedOperations: (
                  | "language.generate"
                  | "language.stream"
                  | "image.generate"
                  | "image.edit"
                  | "video.generate"
                  | "video.status"
                  | "video.cancel"
                  | "files.upload"
                  | "search.ground"
                )[];
              }[];
              providerId: string;
              reasonCode?: string;
              schemaVersion: "2.0.0";
            };
            message: string;
          };
        };
      };
    };
  };
  getProviderSupport: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            code: number;
            data: {
              offerings: {
                availability: {
                  available: boolean;
                  deploymentRegion: string;
                  health: "unknown" | "healthy" | "degraded" | "unhealthy";
                  offeringId: string;
                  operation:
                    | "language.generate"
                    | "language.stream"
                    | "image.generate"
                    | "image.edit"
                    | "video.generate"
                    | "video.status"
                    | "video.cancel"
                    | "files.upload"
                    | "search.ground";
                  reasonCodes: string[];
                  requiredEvidence:
                    | "implemented"
                    | "contract_verified"
                    | "live_verified"
                    | "product_accepted";
                }[];
                evidence: (
                  | "implemented"
                  | "contract_verified"
                  | "live_verified"
                  | "product_accepted"
                )[];
                implementation: "declared" | "implemented";
                lastVerifiedAt?: string;
                offeringId: string;
              }[];
              providers: {
                credential: {
                  configured: boolean;
                  source: "environment" | "vault" | "none" | "unknown";
                };
                providerId: string;
              }[];
              schemaVersion: "2.0.0";
            };
            message: string;
          };
        };
      };
    };
  };
}
