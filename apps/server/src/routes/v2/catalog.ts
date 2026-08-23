import legacyHttp from "@/http/compat";
import { success } from "@/lib/responseFormat";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { catalogResponseSchema } from "@/contracts/v2/schemas";
import { getOfferingAvailabilityRuntime } from "@/providers/availability/offeringAvailability";

const router = legacyHttp.Router();

export default router.get("/", async (_req, res) => {
  const availability = await getOfferingAvailabilityRuntime().resolveAll();
  res.status(200).json(catalogResponseSchema.parse(success({ ...builtinCatalog, availability })));
});
