import legacyHttp from "@/http/compat";
import { error, success } from "@/lib/responseFormat";
import u from "@/utils";
const router = legacyHttp.Router();

export default router.post("/", async (req, res) => {
  await u.db("memories").del();
  res.status(200).send(success(true));
});
