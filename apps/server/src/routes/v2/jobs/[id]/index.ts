import legacyHttp from "@/http/compat";
import { getGenerationRuntime } from "@/generation/runtime";
import { toGenerationJobView } from "@/generation/view";
import { success } from "@/lib/responseFormat";
import { principalIdFromClaims } from "@/security/principal";

const router = legacyHttp.Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const { id } = req.params as { id: string };
  const job = await getGenerationRuntime().get(id, principalIdFromClaims(req.user));
  if (!job) return res.status(404).json({ message: "generation.job_not_found" });
  res.status(200).json(success(toGenerationJobView(job)));
});

export default router;
