import legacyHttp from "@/http/compat";
import { languageExecutionRequestSchema } from "@/contracts/v2/schemas";
import { success } from "@/lib/responseFormat";
import { getLanguageExecutionRuntime } from "@/providers/languageExecutionService";
import { ProviderExecutionError, providerErrorHttpStatus } from "@/providers/domain/executionError";
import { principalIdFromClaims } from "@/security/principal";

const router = legacyHttp.Router();

export default router.post("/", async (req, res) => {
  const parsed = languageExecutionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  try {
    const result = await getLanguageExecutionRuntime().generate(parsed.data, {
      principalId: principalIdFromClaims(req.user),
    });
    return res.status(200).json(success(result));
  } catch (cause) {
    if (cause instanceof ProviderExecutionError) {
      return res
        .status(providerErrorHttpStatus(cause.providerError))
        .json({ message: cause.providerError.code, error: cause.providerError });
    }
    throw cause;
  }
});
