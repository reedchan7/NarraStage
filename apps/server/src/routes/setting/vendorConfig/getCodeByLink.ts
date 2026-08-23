import legacyHttp from "@/http/compat";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";
const router = legacyHttp.Router();
export default router.post(
  "/",
  validateFields({
    link: z.string(),
  }),
  async (req, res) => {
    const { link } = req.body;
    const text = await fetch(link).then((res) => res.text());
    res.status(200).send(success(text));
  },
);
