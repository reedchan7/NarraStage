import legacyHttp from "@/http/compat";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = legacyHttp.Router();
export const projectModelIdSchema = z.string().regex(/^[a-z0-9_-]+:.+$/i);
export const projectImageQualitySchema = z.enum(["1K", "2K", "4K"]);

// 新增项目
export default router.post(
  "/",
  validateFields({
    projectType: z.string(),
    name: z.string(),
    intro: z.string(),
    type: z.string(),
    artStyle: z.string(),
    directorManual: z.string(),
    videoRatio: z.string(),
    imageModel: projectModelIdSchema,
    videoModel: projectModelIdSchema,
    imageQuality: projectImageQualitySchema,
    mode: z.string(),
  }),
  async (req, res) => {
    const {
      projectType,
      name,
      intro,
      type,
      directorManual,
      artStyle,
      videoRatio,
      imageModel,
      videoModel,
      imageQuality,
      mode,
    } = req.body;

    await u.db("o_project").insert({
      id: Date.now(),
      projectType,
      name,
      intro,
      type,
      artStyle,
      videoRatio,
      directorManual,
      userId: 1,
      imageModel,
      videoModel,
      createTime: Date.now(),
      imageQuality,
      mode,
    });

    res.status(200).send(success({ message: "新增项目成功" }));
  },
);
