import { describe, expect, test } from "bun:test";
import { normalizeAgentModelSelection } from "@/providers/catalog/agentModelSelection";

describe("agent model selection", () => {
  test("derives built-in provider identity instead of trusting split client fields", () => {
    expect(
      normalizeAgentModelSelection({
        modelName: "deepseek:v4-flash-vision-exp:official",
        model: "forged label",
        vendorId: "forged-provider",
      }),
    ).toEqual({
      modelName: "deepseek:v4-flash-vision-exp:official",
      model: "DeepSeek V4 Flash Vision Experimental",
      vendorId: "deepseek",
    });
  });

  test("preserves legacy vendor selections and rejects non-language catalog offerings", () => {
    const legacy = { modelName: "42:custom-model", model: "Custom", vendorId: "42" };
    expect(normalizeAgentModelSelection(legacy)).toEqual(legacy);
    expect(() =>
      normalizeAgentModelSelection({
        modelName: "minimax:h3:fal",
        model: "H3",
        vendorId: "fal",
      }),
    ).toThrow("agent.model_operation_unsupported");
  });
});
