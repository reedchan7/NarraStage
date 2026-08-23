import { createGoogleGenerativeAI, type GoogleProvider } from "@ai-sdk/google";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { getCredentialVault } from "@/security/credentials/runtime";
import type { CredentialVault } from "@/security/credentials/types";
import { googleManifest } from "@/providers/adapters/google/manifest";
import {
  createGoogleNativeClient,
  type GoogleNativeClientFactory,
} from "@/providers/adapters/google/nativeClient";

export interface GoogleTransportOptions {
  credentialVault?: CredentialVault;
  fetch?: FetchFunction;
  baseURL?: string;
  nativeClientFactory?: GoogleNativeClientFactory;
}

export class GoogleTransport {
  readonly #credentialVault: CredentialVault;
  readonly #fetch: FetchFunction;
  readonly #baseURL: string;
  readonly #nativeClientFactory: GoogleNativeClientFactory;

  constructor(options: GoogleTransportOptions = {}) {
    this.#credentialVault = options.credentialVault ?? getCredentialVault();
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#baseURL = options.baseURL ?? googleManifest.apiBaseUrl;
    this.#nativeClientFactory = options.nativeClientFactory ?? createGoogleNativeClient;
  }

  async provider(): Promise<GoogleProvider> {
    const apiKey = await this.#apiKey();
    return createGoogleGenerativeAI({
      apiKey,
      baseURL: this.#baseURL,
      fetch: this.#fetch,
    });
  }

  async nativeClient() {
    const apiKey = await this.#apiKey();
    return this.#nativeClientFactory({
      apiKey,
      ...(this.#baseURL === googleManifest.apiBaseUrl ? {} : { baseUrl: this.#baseURL }),
    });
  }

  async #apiKey(): Promise<string> {
    const apiKey = await this.#credentialVault.get({
      providerId: "google",
      slot: "apiKey",
    });
    if (!apiKey) throw new Error("google.credential_missing");
    return apiKey;
  }
}
