import legacyHttp from "@/http/compat";
import { error, success } from "@/lib/responseFormat";
import { preflightRequestSchema } from "@/contracts/v2/schemas";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { preflightRequest } from "@/providers/preflight/preflightService";
import {
  getOfferingAvailabilityRuntime,
  offeringAvailabilityKey,
} from "@/providers/availability/offeringAvailability";

const router = legacyHttp.Router();

export default router.post("/", async (req, res) => {
  const parsed = preflightRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      error("参数错误", {
        violations: parsed.error.issues.map((issue) => ({
          code: "contract.invalid_request",
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    );
  }

  const availability = await getOfferingAvailabilityRuntime().resolveAll();
  const result = preflightRequest(
    { ...parsed.data, hasContinuation: Boolean(parsed.data.continuation) },
    {
      catalog: builtinCatalog,
      at: new Date().toISOString(),
      availability: new Map(
        availability.map((candidate) => [
          offeringAvailabilityKey(candidate.offeringId, candidate.operation),
          candidate,
        ]),
      ),
    },
  );
  res.status(200).json(success(result));
});
