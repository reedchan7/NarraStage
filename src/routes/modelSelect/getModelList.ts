import u from "@/utils";
import { createModelListRouter } from "@/providers/legacy/modelListApi";

export default createModelListRouter({
  listEnabledVendors: async () => {
    const rows = await u.db("o_vendorConfig").select("id").where("enable", 1);
    return rows.flatMap(({ id }) => (id ? [{ id }] : []));
  },
  getModels: (id) => u.vendor.getModelList(id),
  getVendor: (id) => u.vendor.getVendor(id),
});
