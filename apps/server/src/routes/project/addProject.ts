import legacyHttp from "@/http/compat";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {
  generationSelectionColumns,
  generationSelectionSchema,
} from "@/providers/catalog/generationSelection";
import { isImageOffering } from "@/providers/catalog/imageGenerationSelection";
const router = legacyHttp.Router();
export const projectModelIdSchema = z.string().regex(/^[a-z0-9_-]+:.+$/i);
export const projectImageQualitySchema = z.enum(["1K", "2K", "4K"]);
export const projectImageOfferingIdSchema = z
  .string()
  .min(1)
  .refine(isImageOffering, "project.image_offering_invalid");
export const optionalProjectImageOfferingIdSchema = projectImageOfferingIdSchema.optional();

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
    imageOfferingId: optionalProjectImageOfferingIdSchema,
    videoModel: projectModelIdSchema,
    imageQuality: projectImageQualitySchema,
    mode: z.string(),
    videoGenerationSelection: generationSelectionSchema.optional(),
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
      imageOfferingId,
      videoModel,
      imageQuality,
      mode,
      videoGenerationSelection,
    } = req.body;

    const id = Date.now();
    await u.db("o_project").insert({
      id,
      projectType,
      name,
      intro,
      type,
      artStyle,
      videoRatio,
      directorManual,
      userId: 1,
      imageModel,
      ...(imageOfferingId ? { imageOfferingId } : {}),
      videoModel,
      createTime: Date.now(),
      imageQuality,
      mode,
      ...(videoGenerationSelection ? generationSelectionColumns(videoGenerationSelection) : {}),
    });

    res.status(200).send(success({ message: "新增项目成功", id }));
  },
);
