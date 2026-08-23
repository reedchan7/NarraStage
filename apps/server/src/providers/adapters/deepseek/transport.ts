import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { getCredentialVault } from "@/security/credentials/runtime";
import type { CredentialVault } from "@/security/credentials/types";
import type { LanguageInput } from "@/providers/ports/language";
import { deepSeekManifest } from "@/providers/adapters/deepseek/manifest";
import {
  collectWireImageDetails,
  withDeepSeekImageDetail,
} from "@/providers/adapters/deepseek/visionAdapter";

type FetchLike = FetchFunction;

export interface DeepSeekTransportOptions {
  credentialVault?: CredentialVault;
  fetch?: FetchLike;
  baseURL?: string;
}

export class DeepSeekTransport {
  readonly #credentialVault: CredentialVault;
  readonly #fetch: FetchLike;
  readonly #baseURL: string;

  constructor(options: DeepSeekTransportOptions = {}) {
    this.#credentialVault = options.credentialVault ?? getCredentialVault();
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseURL = options.baseURL ?? deepSeekManifest.apiBaseUrl;
  }

  async languageModel(modelId: string, input: LanguageInput): Promise<LanguageModelV4> {
    return this.languageModelWithImageDetails(modelId, collectWireImageDetails(input));
  }

  async languageModelWithImageDetails(
    modelId: string,
    details: readonly ("auto" | "low" | "high" | "original" | undefined)[],
  ): Promise<LanguageModelV4> {
    const provider = await this.#provider(withDeepSeekImageDetail(this.#fetch, details));
    return provider(modelId);
  }

  async files(abortSignal?: AbortSignal) {
    const fetch = abortSignal
      ? Object.assign(
          async (input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]) =>
            this.#fetch(input, { ...init, signal: abortSignal }),
          { preconnect: this.#fetch.preconnect },
        )
      : this.#fetch;
    return (await this.#provider(fetch)).files();
  }

  async #provider(fetch: FetchLike) {
    const apiKey = await this.#credentialVault.get({ providerId: "deepseek", slot: "apiKey" });
    if (!apiKey) throw new Error("deepseek.credential_missing");
    return createDeepSeek({ apiKey, baseURL: this.#baseURL, fetch });
  }
}
