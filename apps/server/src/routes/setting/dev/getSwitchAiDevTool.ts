import legacyHttp from "@/http/compat";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import initDB from "@/lib/initDB";

const router = legacyHttp.Router();

export default router.get("/", async (req, res) => {
  const switchAiDevTool = await u.db("o_setting").where("key", "switchAiDevTool").first();
  res.status(200).send(success(switchAiDevTool?.value || "0"));
});
