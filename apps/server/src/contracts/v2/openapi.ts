import { sha256Text } from "@/contracts/buildManifest";
import {
  catalogResponseSchema,
  cancelGenerationJobSchema,
  contractVersion,
  generationJobListResponseSchema,
  generationJobResponseSchema,
  fileExecutionRequestSchema,
  fileExecutionResponseSchema,
  languageExecutionRequestSchema,
  languageExecutionResponseSchema,
  languageStreamResponseSchema,
  materializedWorkbenchOutputResponseSchema,
  materializedAssetImageResponseSchema,
  ownedAssetUploadResponseSchema,
  metaSchema,
  preflightRequestSchema,
  preflightResponseSchema,
  providerCredentialsResponseSchema,
  providerHealthCheckResponseSchema,
  reconcileGenerationJobSchema,
  submitGenerationJobSchema,
  supportResponseSchema,
  workbenchAssetIngestRequestSchema,
  workbenchAssetIngestResponseSchema,
} from "@/contracts/v2/schemas";
import type { ProviderCatalog } from "@/providers/domain/models";
import { z } from "zod";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function jsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema);
}

export function validateCatalogIntegrity(catalog: ProviderCatalog): void {
  const unique = (values: string[], kind: string) => {
    if (new Set(values).size !== values.length) throw new Error(`duplicate ${kind} ID`);
  };
  unique(
    catalog.providers.map((item) => item.id),
    "provider",
  );
  unique(
    catalog.models.map((item) => item.id),
    "canonical model",
  );
  unique(
    catalog.offerings.map((item) => item.id),
    "offering",
  );
  unique(
    catalog.capabilitySchemas.map((item) => item.id),
    "capability schema",
  );
  unique(
    catalog.priceSnapshots.map((item) => item.id),
    "price snapshot",
  );

  const providerIds = new Set(catalog.providers.map((item) => item.id));
  const modelIds = new Set(catalog.models.map((item) => item.id));
  const capabilityById = new Map(catalog.capabilitySchemas.map((item) => [item.id, item]));
  const priceIds = new Set(catalog.priceSnapshots.map((item) => item.id));
  const offeringIds = new Set(catalog.offerings.map((item) => item.id));

  for (const offering of catalog.offerings) {
    if (!providerIds.has(offering.providerId)) {
      throw new Error(`offering ${offering.id} references unknown provider`);
    }
    if (!modelIds.has(offering.canonicalModelId)) {
      throw new Error(`offering ${offering.id} references unknown canonical model`);
    }
    for (const operation of offering.operations) {
      const capability = capabilityById.get(operation.capabilitySchemaId);
      if (!capability) {
        throw new Error(`offering ${offering.id} references unknown capability`);
      }
      if (capability.operation !== operation.operation) {
        throw new Error(
          `offering ${offering.id} operation does not match capability ${capability.id}`,
        );
      }
    }
    if (offering.priceSnapshotId && !priceIds.has(offering.priceSnapshotId)) {
      throw new Error(`offering ${offering.id} references unknown price snapshot`);
    }
  }
  for (const snapshot of catalog.priceSnapshots) {
    if (!offeringIds.has(snapshot.offeringId)) {
      throw new Error(`price snapshot ${snapshot.id} references unknown offering`);
    }
  }
}

export function createOpenApiArtifact() {
  const document = {
    openapi: "3.1.0",
    info: {
      title: "Toonflow Provider API",
      version: contractVersion,
    },
    paths: {
      "/api/meta": {
        get: {
          operationId: "getApiMeta",
          responses: {
            "200": {
              description: "API build metadata",
              content: {
                "application/json": {
                  schema: jsonSchema(metaSchema),
                },
              },
            },
          },
        },
      },
      "/api/v2/catalog": {
        get: {
          operationId: "getProviderCatalog",
          responses: {
            "200": {
              description: "Canonical models and provider offerings",
              content: {
                "application/json": {
                  schema: jsonSchema(catalogResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/v2/preflight": {
        post: {
          operationId: "preflightGeneration",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: jsonSchema(preflightRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Capability and offering preflight",
              content: {
                "application/json": {
                  schema: jsonSchema(preflightResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/v2/providers": {
        get: {
          operationId: "getProviderCredentialStatus",
          responses: {
            "200": {
              description: "Secret-free provider credential status",
              content: {
                "application/json": {
                  schema: jsonSchema(providerCredentialsResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/v2/providers/{providerId}/health-check": {
        post: {
          operationId: "checkProviderHealth",
          parameters: [
            { name: "providerId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Credentialed provider connection health",
              content: {
                "application/json": { schema: jsonSchema(providerHealthCheckResponseSchema) },
              },
            },
          },
        },
      },
      "/api/v2/support": {
        get: {
          operationId: "getProviderSupport",
          responses: {
            "200": {
              description: "Credential and support evidence status",
              content: {
                "application/json": {
                  schema: jsonSchema(supportResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/v2/language/generate": {
        post: {
          operationId: "generateLanguage",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: jsonSchema(languageExecutionRequestSchema) },
            },
          },
          responses: {
            "200": {
              description: "Normalized language generation result",
              content: {
                "application/json": { schema: jsonSchema(languageExecutionResponseSchema) },
              },
            },
          },
        },
      },
      "/api/v2/language/stream": {
        post: {
          operationId: "streamLanguage",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: jsonSchema(languageExecutionRequestSchema) },
            },
          },
          responses: {
            "200": {
              description: "Server-sent normalized language stream events",
              content: {
                "text/event-stream": { schema: jsonSchema(languageStreamResponseSchema) },
              },
            },
          },
        },
      },
      "/api/v2/files/upload": {
        post: {
          operationId: "uploadProviderFile",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: jsonSchema(fileExecutionRequestSchema) },
            },
          },
          responses: {
            "200": {
              description: "Provider-scoped file reference",
              content: {
                "application/json": { schema: jsonSchema(fileExecutionResponseSchema) },
              },
            },
          },
        },
      },
      "/api/v2/media-assets/workbench": {
        post: {
          operationId: "ingestWorkbenchAssets",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: jsonSchema(workbenchAssetIngestRequestSchema) },
            },
          },
          responses: {
            "201": {
              description: "Principal-owned content-addressed media assets",
              content: {
                "application/json": { schema: jsonSchema(workbenchAssetIngestResponseSchema) },
              },
            },
          },
        },
      },
      "/api/v2/media-assets/upload": {
        put: {
          operationId: "uploadOwnedMediaAsset",
          parameters: [
            {
              name: "X-Toonflow-Media-Type",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "X-Toonflow-Filename",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/octet-stream": { schema: { type: "string", format: "binary" } },
            },
          },
          responses: {
            "201": {
              description: "Principal-owned content-addressed asset",
              content: {
                "application/json": { schema: jsonSchema(ownedAssetUploadResponseSchema) },
              },
            },
          },
        },
      },
      "/api/v2/media-assets/{id}/content": {
        get: {
          operationId: "getOwnedMediaAssetContent",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Owned media bytes",
              content: {
                "application/octet-stream": { schema: { type: "string", format: "binary" } },
              },
            },
          },
        },
      },
      "/api/v2/jobs": {
        get: {
          operationId: "listGenerationJobs",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            { name: "recovery", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": {
              description: "Durable generation job snapshots",
              content: {
                "application/json": { schema: jsonSchema(generationJobListResponseSchema) },
              },
            },
          },
        },
        post: {
          operationId: "submitGenerationJob",
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(submitGenerationJobSchema) } },
          },
          responses: {
            "202": {
              description: "Idempotently accepted generation job",
              content: { "application/json": { schema: jsonSchema(generationJobResponseSchema) } },
            },
          },
        },
      },
      "/api/v2/jobs/{id}/resume-import": {
        post: {
          operationId: "resumeGenerationJobImport",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Resume an owned-storage import after provider success",
              content: { "application/json": { schema: jsonSchema(generationJobResponseSchema) } },
            },
          },
        },
      },
      "/api/v2/jobs/{id}": {
        get: {
          operationId: "getGenerationJob",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Generation job snapshot",
              content: { "application/json": { schema: jsonSchema(generationJobResponseSchema) } },
            },
          },
        },
      },
      "/api/v2/jobs/{id}/cancel": {
        post: {
          operationId: "cancelGenerationJob",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(cancelGenerationJobSchema) } },
          },
          responses: {
            "200": {
              description: "Job with durable cancellation intent",
              content: { "application/json": { schema: jsonSchema(generationJobResponseSchema) } },
            },
          },
        },
      },
      "/api/v2/jobs/{id}/reconcile": {
        post: {
          operationId: "reconcileGenerationJob",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(reconcileGenerationJobSchema) } },
          },
          responses: {
            "200": {
              description: "Audited reconciliation result",
              content: { "application/json": { schema: jsonSchema(generationJobResponseSchema) } },
            },
          },
        },
      },
      "/api/v2/jobs/{id}/materialize-workbench": {
        post: {
          operationId: "materializeWorkbenchGeneration",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Idempotently projected generated video into Workbench history",
              content: {
                "application/json": {
                  schema: jsonSchema(materializedWorkbenchOutputResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/v2/jobs/{id}/materialize-asset-image": {
        post: {
          operationId: "materializeAssetImageGeneration",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Idempotently project a generated image into asset history",
              content: {
                "application/json": { schema: jsonSchema(materializedAssetImageResponseSchema) },
              },
            },
          },
        },
      },
    },
  };
  const json = `${JSON.stringify(stableValue(document), null, 2)}\n`;
  return {
    document,
    json,
    sha256: sha256Text(json),
  };
}
