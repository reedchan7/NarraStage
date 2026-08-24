import type { Knex } from "knex";

export async function migrateLegacyBrandData(knex: Knex): Promise<void> {
  const legacyVendor = await knex("o_vendorConfig").where("id", "toonflow").first();
  if (!legacyVendor) return;

  const currentVendor = await knex("o_vendorConfig").where("id", "narrastage").first();
  if (!currentVendor) {
    const inputValues = JSON.parse(legacyVendor.inputValues ?? "{}");
    try {
      if (new URL(inputValues.baseUrl).hostname.endsWith("toonflow.net")) {
        inputValues.baseUrl = "";
      }
    } catch {
      inputValues.baseUrl = inputValues.baseUrl ?? "";
    }
    await knex("o_vendorConfig").insert({
      ...legacyVendor,
      id: "narrastage",
      inputValues: JSON.stringify(inputValues),
      models: String(legacyVendor.models ?? "[]").replaceAll("toonflow:", "narrastage:"),
    });
  }

  for (const row of await knex("o_agentDeploy")
    .where("vendorId", "toonflow")
    .select("key", "modelName")) {
    await knex("o_agentDeploy")
      .where("key", row.key)
      .update({
        vendorId: "narrastage",
        modelName: String(row.modelName ?? "").replace(/^toonflow:/, "narrastage:"),
      });
  }
  for (const row of await knex("o_project").select("id", "imageModel", "videoModel")) {
    const updates: Record<string, string> = {};
    if (typeof row.imageModel === "string" && row.imageModel.startsWith("toonflow:")) {
      updates.imageModel = row.imageModel.replace(/^toonflow:/, "narrastage:");
    }
    if (typeof row.videoModel === "string" && row.videoModel.startsWith("toonflow:")) {
      updates.videoModel = row.videoModel.replace(/^toonflow:/, "narrastage:");
    }
    if (Object.keys(updates).length > 0)
      await knex("o_project").where("id", row.id).update(updates);
  }
  await knex("o_modelPrompt").where("vendorId", "toonflow").update({ vendorId: "narrastage" });
  await knex("o_vendorConfig").where("id", "toonflow").delete();
}
