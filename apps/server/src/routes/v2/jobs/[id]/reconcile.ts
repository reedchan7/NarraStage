import legacyHttp from "@/http/compat";
import { reconcileGenerationJobSchema } from "@/contracts/v2/schemas";
import { getGenerationRuntime } from "@/generation/runtime";
import { toGenerationJobView } from "@/generation/view";
import { success } from "@/lib/responseFormat";
import { assertOperatorClaims, principalIdFromClaims } from "@/security/principal";

const router = legacyHttp.Router({ mergeParams: true });

router.post("/", async (req, res) => {
  const { id } = req.params as { id: string };
  const claims = req.user;
  try {
    assertOperatorClaims(claims);
  } catch {
    return res.status(403).json({ message: "authorization.operator_required" });
  }
  const parsed = reconcileGenerationJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  const principalId = principalIdFromClaims(claims);
  try {
    const job = await getGenerationRuntime().reconcile({
      id,
      principalId,
      actor: principalId,
      ...parsed.data,
    });
    return res.status(200).json(success(toGenerationJobView(job)));
  } catch (cause) {
    const message = (cause as Error).message;
    if (message === "generation.job_not_found") return res.status(404).json({ message });
    if (message.startsWith("generation.reconcile_")) return res.status(409).json({ message });
    throw cause;
  }
});

export default router;
