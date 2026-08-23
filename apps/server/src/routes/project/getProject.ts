import legacyHttp from "@/http/compat";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = legacyHttp.Router();

// 获取项目
export default router.post("/", async (req, res) => {
  const data = await u.db("o_project").select("*");
  res.status(200).send(success(data));
});
