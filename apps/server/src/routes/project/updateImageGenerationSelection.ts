import type { Knex } from "knex";
import { z } from "zod";
import legacyHttp from "@/http/compat";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import u from "@/utils";

const router = legacyHttp.Router();

export function isImageOffering(offeringId: string): boolean {
  return builtinCatalog.offerings.some(
    (offering) =>
      offering.id === offeringId &&
      offering.support.implementation === "implemented" &&
      offering.operations.some(
        (operation) => operation.operation === "image.generate" && operation.enabled,
      ),
  );
}

export async function persistProjectImageOffering(
  database: Knex,
  projectId: number,
  userId: number,
  offeringId: string,
): Promise<boolean> {
  if (!isImageOffering(offeringId)) throw new Error("project.image_offering_invalid");
  const updated = await database("o_project")
    .where({ id: projectId, userId })
    .update({ imageModel: offeringId });
  return updated > 0;
}

export default router.post(
  "/",
  validateFields({ id: z.number().int().positive(), offeringId: z.string().min(1) }),
  async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(403).send({ message: "project.owner_required" });
    }
    try {
      const updated = await persistProjectImageOffering(
        u.db as unknown as Knex,
        req.body.id,
        userId,
        req.body.offeringId,
      );
      if (!updated) return res.status(404).send({ message: "project.not_found" });
      return res.status(200).send(success({ offeringId: req.body.offeringId }));
    } catch (cause) {
      if (cause instanceof Error && cause.message === "project.image_offering_invalid") {
        return res.status(400).send({ message: cause.message });
      }
      throw cause;
    }
  },
);
