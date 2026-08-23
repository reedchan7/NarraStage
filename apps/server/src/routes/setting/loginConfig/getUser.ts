import legacyHttp from "@/http/compat";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = legacyHttp.Router();

export default router.get("/", async (req, res) => {
  const data = await u.db("o_user").select("*").first();
  res.status(200).send(success(data));
});
