import { expect, test } from "bun:test";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { LanguageExecutionService } from "@/providers/languageExecutionService";
import type { LanguageGeneratePort } from "@/providers/ports";

test("language execution resolves the exact pinned offering without provider fallback", async () => {
  let calls = 0;
  const language: LanguageGeneratePort = {
    operation: "language.generate",
    async generate() {
      calls += 1;
      return {
        schemaVersion: "1.0.0",
        text: "ok",
        reasoning: "",
        toolCalls: [],
        finishReason: "stop",
        usage: {},
        resolvedModelId: "deepseek-v4-pro",
      };
    },
  };
  const registry = new ProviderRegistry();
  registry.register({ providerId: "deepseek", ports: [language] });
  const service = new LanguageExecutionService(registry);
  const base = {
    schemaVersion: "1.0.0" as const,
    idempotencyKey: "language-case-1",
    canonicalModelId: "deepseek:v4-pro",
    offeringId: "deepseek:v4-pro:official",
    input: {
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "Hi" }] }],
    },
  };

  expect(await service.generate(base)).toMatchObject({ text: "ok" });
  await expect(
    service.generate({ ...base, canonicalModelId: "deepseek:v4-flash" }),
  ).rejects.toMatchObject({
    providerError: {
      category: "invalid_input",
      code: "provider.offering_model_mismatch",
      retryable: false,
    },
  });
  expect(calls).toBe(1);
});
