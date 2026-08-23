import legacyHttp from "@/http/compat";
import { success } from "@/lib/responseFormat";
import { getVersion } from "@/utils/writeVersion";

const router = legacyHttp.Router();

export default router.get("/", async (req, res) => {
  const version = await getVersion();
  res.status(200).send(success(version));
});
