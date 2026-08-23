import express from "express";
import { z } from "zod";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {
  generationSelectionColumns,
  generationSelectionSchema,
} from "@/providers/catalog/generationSelection";
import type { Knex } from "knex";

const router = express.Router();

export async function persistProjectGenerationSelection(
  database: Knex,
  projectId: number,
  userId: number,
  selection: z.infer<typeof generationSelectionSchema>,
): Promise<boolean> {
  const columns = generationSelectionColumns(selection);
  const updated = await database("o_project")
    .where({ id: projectId, userId })
    .update(columns as any);
  return updated > 0;
}

export default router.post(
  "/",
  validateFields({ id: z.number().int().positive(), selection: generationSelectionSchema }),
  async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(403).send({ message: "project.owner_required" });
    }
    try {
      generationSelectionColumns(req.body.selection);
    } catch {
      return res.status(400).send({ message: "project.generation_selection_invalid" });
    }
    const updated = await persistProjectGenerationSelection(
      u.db as unknown as Knex,
      req.body.id,
      userId,
      req.body.selection,
    );
    if (!updated) return res.status(404).send({ message: "project.not_found" });
    return res.status(200).send(success({ selection: req.body.selection }));
  },
);
