import legacyHttp from "@/http/compat";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = legacyHttp.Router();

// 获取单个项目
export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;

    const data = await u.db("o_project").where("id", id).select("*");

    res.status(200).send(success(data));
  },
);
