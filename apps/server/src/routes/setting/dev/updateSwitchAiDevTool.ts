import legacyHttp from "@/http/compat";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = legacyHttp.Router();

export default router.post(
  "/",
  validateFields({
    switchAiDevTool: z.string(),
  }),
  async (req, res) => {
    const { switchAiDevTool } = req.body;
    await u.db("o_setting").where("key", "switchAiDevTool").update({
      value: switchAiDevTool,
    });
    res.status(200).send(success("保存设置成功"));
  },
);
