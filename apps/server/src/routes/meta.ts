import legacyHttp from "@/http/compat";
import { getApiMeta } from "@/contracts/v2/meta";

const router = legacyHttp.Router();

export default router.get("/", async (_req, res) => {
  res.status(200).json(await getApiMeta());
});
