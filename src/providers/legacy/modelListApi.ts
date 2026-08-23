import express from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

type ModelType = "text" | "image" | "video" | "all";

export interface ModelListDependencies {
  listEnabledVendors(): Promise<Array<{ id: string }>>;
  getModels(id: string): Promise<Array<{ name: string; modelName: string; type: string }>>;
  getVendor(id: string): Promise<{ name: string }>;
}

export function createModelListRouter(dependencies: ModelListDependencies): express.Router {
  const router = express.Router();
  router.post(
    "/",
    validateFields({
      type: z.enum(["text", "image", "video", "all"]),
    }),
    async (req, res) => {
      const type = req.body.type as ModelType;
      const dataList = await dependencies.listEnabledVendors();
      if (dataList.length === 0) return res.status(200).send(success([]));

      const modelList = await Promise.all(
        dataList.map((vendor) => dependencies.getModels(vendor.id)),
      );
      const result = await Promise.all(
        dataList.map(async (data, index) => {
          const vendorData = await dependencies.getVendor(data.id);
          const models = modelList[index];
          const filtered =
            type === "all"
              ? models.filter((item) => item.type !== "video")
              : models.filter((item) => item.type === type);
          return filtered.map((item) => ({
            id: data.id,
            label: item.name,
            value: item.modelName,
            type: item.type,
            name: vendorData.name,
          }));
        }),
      );
      return res.status(200).send(success(result.flat()));
    },
  );
  return router;
}
