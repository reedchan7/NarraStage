import express from "express";
import { success } from "@/lib/responseFormat";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { providerCredentialsResultSchema } from "@/contracts/v2/schemas";
import { getCredentialVault } from "@/security/credentials/runtime";
import type { CredentialVault } from "@/security/credentials/types";
import {
  getOfferingAvailabilityRuntime,
  type OfferingAvailabilityService,
} from "@/providers/availability/offeringAvailability";
import { providerIdSchema } from "@/providers/domain/ids";
import { getProviderConnectionProbeRuntime } from "@/providers/availability/connectionProbe";

const router = express.Router();

export async function buildProviderCredentialStatus(
  vault: CredentialVault,
  availability?: OfferingAvailabilityService,
) {
  const runtimeAvailability = availability ? await availability.resolveAll() : [];
  const aggregateHealth = (providerId: string) => {
    const values = runtimeAvailability.flatMap((candidate) => {
      const offering = builtinCatalog.offerings.find((entry) => entry.id === candidate.offeringId);
      return offering?.providerId === providerId ? [candidate.health] : [];
    });
    if (values.every((health) => health === "unknown")) return "unknown";
    if (values.every((health) => health === "healthy")) return "healthy";
    if (values.every((health) => health === "unhealthy")) return "unhealthy";
    return "degraded";
  };
  return providerCredentialsResultSchema.parse({
    schemaVersion: "2.0.0",
    providers: await Promise.all(
      builtinCatalog.providers.map(async (provider) => ({
        providerId: provider.id,
        health: aggregateHealth(provider.id),
        slots: await Promise.all(
          provider.credentialSlots.map(async (descriptor) => ({
            slot: descriptor.slot,
            ...(await vault.status({ providerId: provider.id, slot: descriptor.slot })),
          })),
        ),
      })),
    ),
  });
}

export default router.get("/", async (_req, res) => {
  res
    .status(200)
    .json(
      success(
        await buildProviderCredentialStatus(getCredentialVault(), getOfferingAvailabilityRuntime()),
      ),
    );
});

router.post("/:providerId/health-check", async (req, res) => {
  const providerId = providerIdSchema.parse(req.params.providerId);
  if (!builtinCatalog.providers.some((provider) => provider.id === providerId)) {
    return res.status(404).json({ message: "provider.not_found" });
  }
  const snapshot = await getProviderConnectionProbeRuntime().check(providerId);
  return res.status(200).json(success({ schemaVersion: "2.0.0", ...snapshot }));
});
