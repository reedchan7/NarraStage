import express from "express";
import { getApiMeta } from "@/contracts/v2/meta";

const router = express.Router();

export default router.get("/", async (_req, res) => {
  res.status(200).json(await getApiMeta());
});
