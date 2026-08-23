import express from "express";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import type { Offering } from "@/providers/domain/models";
import { getOfferingAvailabilityRuntime } from "@/providers/availability/offeringAvailability";
const router = express.Router();

const mediaTypesByFeature = {
  image_input: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video_input: ["video/mp4", "video/mpeg", "video/quicktime", "video/webm"],
  audio_input: ["audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/flac", "audio/webm"],
  pdf_input: ["application/pdf"],
} as const;

export function agentModelDetailsForOffering(offering: Offering, available = true) {
  const canonicalModel = builtinCatalog.models.find(
    (candidate) => candidate.id === offering.canonicalModelId,
  );
  const languageOperation = offering.operations.find(
    (operation) => operation.operation === "language.generate" && operation.enabled,
  );
  const languageFeatures = new Set(languageOperation?.features ?? []);
  const supportedMediaTypes = Object.entries(mediaTypesByFeature).flatMap(
    ([feature, mediaTypes]) =>
      languageFeatures.has(feature as keyof typeof mediaTypesByFeature) ? [...mediaTypes] : [],
  );
  return {
    modelName: offering.id,
    model: canonicalModel?.name ?? offering.id,
    think: languageFeatures.has("thinking"),
    canonicalModelId: offering.canonicalModelId,
    offeringId: offering.id,
    providerId: offering.providerId,
    available,
    acceptsAttachments: supportedMediaTypes.length > 0,
    acceptsImages: languageFeatures.has("image_input"),
    supportedMediaTypes,
    supportsGrounding: languageFeatures.has("grounding"),
    filesUpload: offering.operations.some(
      (operation) => operation.operation === "files.upload" && operation.enabled,
    ),
    maximumAttachments: 20,
    maximumAttachmentBytes: 64 * 1024 * 1024,
    lifecycle: offering.lifecycle,
  };
}

export default router.post(
  "/",
  validateFields({
    key: z.enum(["scriptAgent", "productionAgent"]),
  }),
  async (req, res) => {
    const { key } = req.body;
    const data = await u
      .db("o_agentDeploy")
      .select("o_agentDeploy.*")
      .where("o_agentDeploy.key", key)
      .first();
    const offering = data
      ? builtinCatalog.offerings.find((candidate) => candidate.id === data.modelName)
      : undefined;
    if (offering) {
      const availability = await getOfferingAvailabilityRuntime().resolve(
        offering.id,
        "language.generate",
      );
      return res
        .status(200)
        .send(success(agentModelDetailsForOffering(offering, availability.available)));
    }
    const [id, modelName] = data ? data.modelName.split(/:(.+)/) : [];
    const models = await u.vendor.getModelList(id);
    const model = models.find((m) => m.modelName === modelName);
    if (!model) return res.status(400).send(error("未找到模型"));
    const acceptsImages = Boolean(model.acceptsImages);
    res.status(200).send(
      success({
        ...model,
        canonicalModelId: data.modelName,
        offeringId: data.modelName,
        providerId: id,
        available: true,
        acceptsAttachments: acceptsImages,
        acceptsImages,
        supportedMediaTypes: acceptsImages ? [...mediaTypesByFeature.image_input] : [],
        supportsGrounding: false,
        filesUpload: false,
        maximumAttachments: 20,
        maximumAttachmentBytes: 64 * 1024 * 1024,
      }),
    );
  },
);
