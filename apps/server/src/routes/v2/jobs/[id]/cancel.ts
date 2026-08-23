import legacyHttp from "@/http/compat";
import { cancelGenerationJobSchema } from "@/contracts/v2/schemas";
import { getGenerationRuntime } from "@/generation/runtime";
import { toGenerationJobView } from "@/generation/view";
import { success } from "@/lib/responseFormat";
import { principalIdFromClaims } from "@/security/principal";

const router = legacyHttp.Router({ mergeParams: true });

router.post("/", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = cancelGenerationJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  try {
    const job = await getGenerationRuntime().cancel(
      id,
      principalIdFromClaims(req.user),
      parsed.data.reason,
    );
    return res.status(200).json(success(toGenerationJobView(job)));
  } catch (cause) {
    if ((cause as Error).message === "generation.job_not_found") {
      return res.status(404).json({ message: "generation.job_not_found" });
    }
    throw cause;
  }
});

export default router;
