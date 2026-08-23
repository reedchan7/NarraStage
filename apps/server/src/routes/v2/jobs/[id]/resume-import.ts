import legacyHttp from "@/http/compat";
import { getGenerationRuntime } from "@/generation/runtime";
import { toGenerationJobView } from "@/generation/view";
import { success } from "@/lib/responseFormat";
import { principalIdFromClaims } from "@/security/principal";

const router = legacyHttp.Router({ mergeParams: true });

router.post("/", async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const job = await getGenerationRuntime().resumeImport(id, principalIdFromClaims(req.user));
    return res.status(200).json(success(toGenerationJobView(job)));
  } catch (cause) {
    const message = (cause as Error).message;
    if (message === "generation.job_not_found") return res.status(404).json({ message });
    if (message === "generation.import_not_resumable") {
      return res.status(409).json({ message });
    }
    throw cause;
  }
});

export default router;
