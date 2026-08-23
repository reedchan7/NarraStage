import legacyHttp from "@/http/compat";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
const router = legacyHttp.Router();

export default router.post("/", async (req, res) => {
  const allData = await u
    .db("o_agentDeploy")
    .leftJoin("o_vendorConfig", "o_vendorConfig.id", "o_agentDeploy.vendorId")
    .select("o_agentDeploy.*");
  const qrdinaryData = allData.filter((item: any) => !item.key?.includes(":"));
  const advancedData = allData.filter(
    (item: any) => item.key?.includes(":") || item.key == "universalAi",
  );
  res.status(200).send(success({ qrdinaryData, advancedData }));
});
