import legacyHttp from "@/http/compat";
import initDB from "@/lib/initDB";
import { db } from "@/utils/db";
import { success } from "@/lib/responseFormat";
const router = legacyHttp.Router();

// 清空数据表
export default router.post("/", async (req, res) => {
  await initDB(db, true);
  res.status(200).send(success({ message: "清空数据表成功" }));
});
