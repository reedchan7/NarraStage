import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";
import { validateLegacyVendorInputUpdate } from "@/security/credentials/legacyInputPolicy";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.string(),
    inputValues: z.record(z.string(), z.string()),
  }),
  async (req, res) => {
    const { id, inputValues } = req.body;
    const vendor = u.vendor.getVendor(id);
    let safeValues: Record<string, string>;
    try {
      safeValues = validateLegacyVendorInputUpdate(vendor.inputs, inputValues);
    } catch (validationError) {
      if ((validationError as Error).message === "credential.rest_write_forbidden") {
        return res.status(400).send(error("credential.rest_write_forbidden"));
      }
      throw validationError;
    }
    const current = await u.db("o_vendorConfig").where("id", id).first();
    const existingValues = JSON.parse(current?.inputValues ?? "{}") as Record<string, string>;
    await u
      .db("o_vendorConfig")
      .where("id", id)
      .update({
        inputValues: JSON.stringify({ ...existingValues, ...safeValues }),
      });
    res.status(200).send(success("更新成功"));
  },
);
