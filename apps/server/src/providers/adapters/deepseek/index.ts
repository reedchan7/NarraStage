import { defineProviderAdapter, type ProviderFileAssetResolver } from "@/providers/ports";
import { DeepSeekLanguageAdapter, DeepSeekLanguageStreamAdapter } from "./languageAdapter";
import { DeepSeekFilesAdapter } from "./filesAdapter";
import { DeepSeekTransport, type DeepSeekTransportOptions } from "./transport";
import { DeepSeekLanguageModelBridge } from "./languageModelBridge";

export interface DeepSeekAdapterOptions extends DeepSeekTransportOptions {
  fileAssetResolver?: ProviderFileAssetResolver;
}

export function createDeepSeekAdapter(options: DeepSeekAdapterOptions = {}) {
  const transport = new DeepSeekTransport(options);
  const language = new DeepSeekLanguageAdapter(transport);
  return defineProviderAdapter({
    providerId: "deepseek",
    compatibility: { languageModel: new DeepSeekLanguageModelBridge(transport) },
    ports: [
      language,
      new DeepSeekLanguageStreamAdapter(language),
      new DeepSeekFilesAdapter(transport, options.fileAssetResolver),
    ],
  });
}

export * from "./errors";
export * from "./manifest";
