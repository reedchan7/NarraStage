import legacyHttp from "@/http/compat";
import { success } from "@/lib/responseFormat";
const router = legacyHttp.Router();

export default router.post("/", async (req, res) => {
  res.status(200).send(success("123"));
});
