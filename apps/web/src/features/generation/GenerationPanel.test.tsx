import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { CatalogResult } from "@/api/client";
import { GenerationPanel } from "@/features/generation/GenerationPanel";

const unavailableCatalog = {
  schemaVersion: "2.0.0",
  providers: [],
  models: [],
  priceSnapshots: [],
  offerings: [
    {
      id: "fixture:image",
      canonicalModelId: "fixture:image-v1",
      providerId: "fixture",
      providerModelId: "image-v1",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "image.generate",
          capabilitySchemaId: "fixture:image",
          enabled: true,
        },
      ],
      support: { implementation: "implemented", evidence: ["contract_verified"] },
    },
  ],
  capabilitySchemas: [
    {
      id: "fixture:image",
      schemaVersion: "1.0.0",
      operation: "image.generate",
      fields: [{ path: "prompt", kind: "text", label: "Prompt", required: true }],
      assetModes: [{ id: "text", label: "Text to image", roles: [], maximumTotalAssets: 0 }],
    },
  ],
  availability: [
    {
      offeringId: "fixture:image",
      operation: "image.generate",
      available: false,
      health: "unhealthy",
      reasonCodes: ["provider.credential_missing"],
      requiredEvidence: "contract_verified",
      deploymentRegion: "local",
    },
  ],
} satisfies CatalogResult;

afterEach(cleanup);

describe("generation panel", () => {
  test("renders generated reasonCodes when a provider is unavailable", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GenerationPanel
          operation="image.generate"
          projectId={7}
          catalog={unavailableCatalog}
          token="Bearer fixture"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("provider.credential_missing");
    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });

  test("does not silently replace a saved project offering that is absent from the catalog", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GenerationPanel
          operation="image.generate"
          projectId={7}
          catalog={unavailableCatalog}
          token="Bearer fixture"
          configuredOfferingId="toonflow:legacy-image"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("toonflow:legacy-image");
    expect(screen.getByRole("combobox", { name: "模型服务" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });
});
