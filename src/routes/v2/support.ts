import express from "express";
import { success } from "@/lib/responseFormat";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { supportResultSchema } from "@/contracts/v2/schemas";
import { getCredentialVault } from "@/security/credentials/runtime";
import { getOfferingAvailabilityRuntime } from "@/providers/availability/offeringAvailability";

const router = express.Router();

export default router.get("/", async (_req, res) => {
  const availability = await getOfferingAvailabilityRuntime().resolveAll();
  const data = supportResultSchema.parse({
    schemaVersion: "2.0.0",
    providers: await Promise.all(
      builtinCatalog.providers.map(async (provider) => {
        const statuses = await Promise.all(
          provider.credentialSlots.map((descriptor) =>
            getCredentialVault().status({ providerId: provider.id, slot: descriptor.slot }),
          ),
        );
        const configured = statuses.some((status) => status.configured);
        const source = statuses.find((status) => status.configured)?.source;
        return {
          providerId: provider.id,
          credential: {
            configured,
            source:
              source === "environment"
                ? "environment"
                : source === "electron_safe_storage" || source === "memory"
                  ? "vault"
                  : "none",
          },
        };
      }),
    ),
    offerings: builtinCatalog.offerings.map((offering) => ({
      offeringId: offering.id,
      ...offering.support,
      availability: availability.filter((candidate) => candidate.offeringId === offering.id),
    })),
  });

  res.status(200).json(success(data));
});
