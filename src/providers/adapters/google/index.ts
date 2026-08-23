import {
  defineProviderAdapter,
  type ProviderAssetResolver,
  type ProviderFileAssetResolver,
} from "@/providers/ports";
import { GoogleFilesAdapter } from "@/providers/adapters/google/filesAdapter";
import {
  GoogleImageEditAdapter,
  GoogleImageGenerateAdapter,
} from "@/providers/adapters/google/imageAdapter";
import {
  GoogleLanguageAdapter,
  GoogleLanguageStreamAdapter,
} from "@/providers/adapters/google/languageAdapter";
import { GoogleLanguageModelBridge } from "@/providers/adapters/google/languageModelBridge";
import { GoogleOmniAdapter } from "@/providers/adapters/google/omniAdapter";
import {
  GoogleTransport,
  type GoogleTransportOptions,
} from "@/providers/adapters/google/transport";
import { GoogleVeoAdapter } from "@/providers/adapters/google/veoAdapter";
import {
  GoogleVideoCancelRouter,
  GoogleVideoGenerateRouter,
  GoogleVideoStatusRouter,
} from "@/providers/adapters/google/videoRouter";

export interface GoogleAdapterOptions extends GoogleTransportOptions {
  transport?: GoogleTransport;
  assetResolver?: ProviderAssetResolver;
  fileAssetResolver?: ProviderFileAssetResolver;
}

export function createGoogleAdapter(options: GoogleAdapterOptions = {}) {
  const transport = options.transport ?? new GoogleTransport(options);
  const language = new GoogleLanguageAdapter(transport);
  const veo = new GoogleVeoAdapter(transport, options.assetResolver);
  const omni = new GoogleOmniAdapter(transport, options.assetResolver);
  return defineProviderAdapter({
    providerId: "google",
    compatibility: { languageModel: new GoogleLanguageModelBridge(transport) },
    ports: [
      language,
      new GoogleLanguageStreamAdapter(language),
      new GoogleFilesAdapter(transport, options.fileAssetResolver),
      new GoogleImageGenerateAdapter(transport, { assetResolver: options.assetResolver }),
      new GoogleImageEditAdapter(transport, { assetResolver: options.assetResolver }),
      new GoogleVideoGenerateRouter(veo, omni),
      new GoogleVideoStatusRouter(veo, omni),
      new GoogleVideoCancelRouter(veo, omni),
    ],
  });
}

export * from "@/providers/adapters/google/errors";
export * from "@/providers/adapters/google/handle";
export * from "@/providers/adapters/google/manifest";
export * from "@/providers/adapters/google/nativeClient";
