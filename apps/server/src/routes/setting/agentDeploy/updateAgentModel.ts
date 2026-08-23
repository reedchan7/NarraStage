import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import {
  AgentModelSelectionError,
  normalizeAgentModelSelection,
} from "@/providers/catalog/agentModelSelection";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
    name: z.string(),
    model: z.string(),
    modelName: z.string(),
    vendorId: z.string().nullable(),
    desc: z.string(),
    temperature: z.number().optional(),
    maxOutputTokens: z.number().optional(),
  }),
  async (req, res) => {
    const { id, name, model, modelName, vendorId, desc, temperature, maxOutputTokens } = req.body;
    let normalized;
    try {
      normalized = normalizeAgentModelSelection({ model, modelName, vendorId });
    } catch (cause) {
      if (cause instanceof AgentModelSelectionError) {
        return res.status(422).send({ message: cause.code });
      }
      throw cause;
    }
    await u
      .db("o_agentDeploy")
      .where({ id })
      .update({ id, name, ...normalized, desc, temperature, maxOutputTokens });
    res.status(200).send(success("配置成功"));
  },
);
