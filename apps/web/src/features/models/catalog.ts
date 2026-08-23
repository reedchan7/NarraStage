import axios from "@/utils/axios";
import type { paths } from "/contracts";

type CatalogEnvelope =
  paths["/api/v2/catalog"]["get"]["responses"][200]["content"]["application/json"];
type PreflightOperation = paths["/api/v2/preflight"]["post"];
type PreflightRequest = PreflightOperation["requestBody"]["content"]["application/json"];
type PreflightEnvelope = PreflightOperation["responses"][200]["content"]["application/json"];
type SupportEnvelope =
  paths["/api/v2/support"]["get"]["responses"][200]["content"]["application/json"];

export type ProviderCatalog = CatalogEnvelope["data"];
export type CatalogModel = ProviderCatalog["models"][number];
export type CatalogOffering = ProviderCatalog["offerings"][number];
export type CatalogCapability = ProviderCatalog["capabilitySchemas"][number];
export type ModelOperation = CatalogOffering["operations"][number]["operation"];
export type CapabilityInput = PreflightRequest["input"];
export type PreflightResult = PreflightEnvelope["data"];
export type CapabilityViolation = PreflightResult["offerings"][number]["violations"][number];
export type CapabilityWarning = PreflightResult["offerings"][number]["warnings"][number];
export type ModelOfferingSelection = {
  canonicalModelId: string;
  offeringId: string;
  providerId?: string;
  label?: string;
};

export async function getProviderCatalog(): Promise<ProviderCatalog> {
  const response = (await axios.get("/v2/catalog")) as CatalogEnvelope;
  return response.data;
}

export async function preflightProviderRequest(
  request: PreflightRequest,
): Promise<PreflightEnvelope["data"]> {
  const response = (await axios.post("/v2/preflight", request)) as PreflightEnvelope;
  return response.data;
}

export async function getProviderSupport(): Promise<SupportEnvelope["data"]> {
  const response = (await axios.get("/v2/support")) as SupportEnvelope;
  return response.data;
}
