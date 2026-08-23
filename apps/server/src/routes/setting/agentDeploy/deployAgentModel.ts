import legacyHttp from "@/http/compat";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import {
  AgentModelSelectionError,
  normalizeAgentModelSelection,
} from "@/providers/catalog/agentModelSelection";
const router = legacyHttp.Router();

interface AgentDeployUpdate {
  id: number;
  name: string;
  model: string;
  modelName: string;
  vendorId: string | null;
  desc: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export default router.post(
  "/",
  validateFields({
    items: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        model: z.string(),
        modelName: z.string(),
        vendorId: z.string().nullable(),
        desc: z.string(),
        temperature: z.number().optional(),
        maxOutputTokens: z.number().optional(),
      }),
    ),
  }),
  async (req, res) => {
    const { items } = req.body;
    let normalizedItems;
    try {
      normalizedItems = (items as AgentDeployUpdate[]).map((item) => ({
        ...item,
        ...normalizeAgentModelSelection(item),
      }));
    } catch (cause) {
      if (cause instanceof AgentModelSelectionError) {
        return res.status(422).send({ message: cause.code });
      }
      throw cause;
    }
    await u.db.transaction(async (transaction) => {
      for (const item of normalizedItems) {
        const { id, name, model, modelName, vendorId, desc, temperature, maxOutputTokens } = item;
        await transaction("o_agentDeploy")
          .where({ id })
          .update({ id, name, model, modelName, vendorId, desc, temperature, maxOutputTokens });
      }
    });
    res.status(200).send(success("批量配置成功"));
  },
);
