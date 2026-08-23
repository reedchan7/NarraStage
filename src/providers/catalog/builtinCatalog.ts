import type { ProviderCatalog } from "@/providers/domain/models";
import type { CapabilitySchema } from "@/providers/domain/capabilities";
import { createGoogleVeoCapabilitySchema } from "@/providers/contracts/googleVeo";

const videoCapability = (
  capabilitySchemaId: string,
  outputProfiles: Array<{
    resolution: string;
    delivery: "native" | "regenerated" | "upscaled" | "provider_managed";
    sourceResolution?: string;
  }>,
  cancellable = true,
) => [
  {
    operation: "video.generate" as const,
    capabilitySchemaId,
    enabled: true,
    outputProfiles,
  },
  {
    operation: "video.status" as const,
    capabilitySchemaId: "video-status:v1",
    enabled: true,
  },
  ...(cancellable
    ? [
        {
          operation: "video.cancel" as const,
          capabilitySchemaId: "video-cancel:v1",
          enabled: true,
        },
      ]
    : []),
];

const h3Fields = (input: {
  minimumDuration: number;
  resolutions: string[];
  falOptions: boolean;
}) => [
  {
    path: "prompt",
    kind: "text" as const,
    label: "Prompt",
    required: true,
    maximumLength: 7_000,
  },
  {
    path: "durationSeconds",
    kind: "integer" as const,
    label: "Duration",
    required: true,
    minimum: input.minimumDuration,
    maximum: 15,
    unit: "seconds",
  },
  {
    path: "resolution",
    kind: "enum" as const,
    label: "Resolution",
    required: true,
    enumValues: input.resolutions,
  },
  {
    path: "aspectRatio",
    kind: "enum" as const,
    label: "Aspect ratio",
    required: false,
    enumValues: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  },
  ...(input.falOptions
    ? [
        {
          path: "seed",
          kind: "integer" as const,
          label: "Seed",
          required: false,
          advanced: true,
        },
        {
          path: "enablePromptExpansion",
          kind: "boolean" as const,
          label: "Prompt expansion",
          required: false,
          advanced: true,
        },
        {
          path: "promptExpansionMode",
          kind: "enum" as const,
          label: "Prompt expansion mode",
          required: false,
          enumValues: ["fast", "balanced", "quality"],
          advanced: true,
        },
        {
          path: "enableSafetyChecker",
          kind: "boolean" as const,
          label: "Safety checker",
          required: false,
          advanced: true,
        },
      ]
    : []),
];

const h3AssetModes = (fal: boolean) => [
  {
    id: "text",
    label: "Text to video",
    roles: [],
    maximumTotalAssets: 0,
    fieldRules: [
      {
        path: "aspectRatio",
        required: true,
        enumValues: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
      },
    ],
  },
  {
    id: "keyframes",
    label: "Keyframes to video",
    roles: [
      {
        role: "first_frame",
        kinds: ["image" as const],
        minimum: 1,
        maximum: 1,
      },
      {
        role: "last_frame",
        kinds: ["image" as const],
        minimum: 0,
        maximum: 1,
      },
    ],
    minimumTotalAssets: 1,
    maximumTotalAssets: 2,
    fieldRules: [{ path: "aspectRatio", enumValues: ["adaptive"] }],
  },
  {
    id: "reference",
    label: "Reference to video",
    roles: [
      {
        role: "reference_image",
        kinds: ["image" as const],
        minimum: 0,
        maximum: 9,
      },
      {
        role: "reference_video",
        kinds: ["video" as const],
        minimum: 0,
        maximum: 3,
      },
      {
        role: "reference_audio",
        kinds: ["audio" as const],
        minimum: 0,
        maximum: 3,
      },
    ],
    minimumTotalAssets: 1,
    maximumTotalAssets: 12,
    requiresAnyRole: ["reference_image", "reference_video"],
    durationLimits: [
      {
        kinds: ["video" as const],
        minimumPerAssetSeconds: 2,
        maximumPerAssetSeconds: 15,
        maximumCombinedSeconds: 15,
      },
      {
        kinds: ["audio" as const],
        minimumPerAssetSeconds: 2,
        maximumPerAssetSeconds: 15,
        maximumCombinedSeconds: 15,
      },
    ],
  },
];

const standardImageAspectRatios = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
];

const imageCapabilitySchema = (input: {
  id: string;
  operation: "image.generate" | "image.edit";
  imageSizes: string[];
  aspectRatios: string[];
  maximumReferences: number;
  grounding: boolean;
}) => ({
  id: input.id,
  schemaVersion: "1.0.0",
  operation: input.operation,
  fields: [
    {
      path: "prompt",
      kind: "text" as const,
      label: "Prompt",
      required: true,
      maximumLength: 32_000,
    },
    {
      path: "aspectRatio",
      kind: "enum" as const,
      label: "Aspect ratio",
      required: false,
      enumValues: input.aspectRatios,
    },
    {
      path: "imageSize",
      kind: "enum" as const,
      label: "Image size",
      required: false,
      enumValues: input.imageSizes,
    },
    ...(input.grounding
      ? [
          {
            path: "grounding",
            kind: "boolean" as const,
            label: "Google Search grounding",
            required: false,
            advanced: true,
          },
        ]
      : []),
    {
      path: "includeText",
      kind: "boolean" as const,
      label: "Include text response",
      required: false,
      advanced: true,
    },
  ],
  assetModes: [
    ...(input.operation === "image.generate"
      ? [{ id: "text", label: "Text to image", roles: [], maximumTotalAssets: 0 }]
      : []),
    ...(input.operation === "image.edit"
      ? [
          {
            id: "reference",
            label: "Edit with references",
            roles: [
              {
                role: "reference_image",
                kinds: ["image" as const],
                minimum: 1,
                maximum: input.maximumReferences,
              },
            ],
            minimumTotalAssets: 1,
            maximumTotalAssets: input.maximumReferences,
          },
        ]
      : []),
  ],
});

export const builtinCapabilitySchemas = [
  {
    id: "video-status:v1",
    schemaVersion: "1.0.0",
    operation: "video.status",
    fields: [
      {
        path: "providerHandle",
        kind: "text",
        label: "Provider handle",
        required: true,
      },
    ],
  },
  {
    id: "video-cancel:v1",
    schemaVersion: "1.0.0",
    operation: "video.cancel",
    fields: [
      {
        path: "providerHandle",
        kind: "text",
        label: "Provider handle",
        required: true,
      },
    ],
  },
  {
    id: "language:v1",
    schemaVersion: "1.0.0",
    operation: "language.generate",
    fields: [
      {
        path: "prompt",
        kind: "text",
        label: "Prompt",
        required: true,
      },
    ],
  },
  {
    id: "language-stream:v1",
    schemaVersion: "1.0.0",
    operation: "language.stream",
    fields: [
      {
        path: "prompt",
        kind: "text",
        label: "Prompt",
        required: true,
      },
    ],
  },
  {
    id: "vision-language:v1",
    schemaVersion: "1.0.0",
    operation: "language.generate",
    fields: [
      {
        path: "prompt",
        kind: "text",
        label: "Prompt",
        required: true,
      },
      {
        path: "detail",
        kind: "enum",
        label: "Image detail",
        required: false,
        enumValues: ["auto", "low", "high", "original"],
      },
    ],
    assetModes: [
      {
        id: "images",
        label: "Image attachments",
        roles: [
          {
            role: "user_image",
            kinds: ["image"],
            minimum: 1,
            maximum: 8,
          },
        ],
        minimumTotalAssets: 1,
        maximumTotalAssets: 8,
      },
    ],
  },
  {
    id: "vision-language-stream:v1",
    schemaVersion: "1.0.0",
    operation: "language.stream",
    fields: [
      {
        path: "prompt",
        kind: "text",
        label: "Prompt",
        required: true,
      },
      {
        path: "detail",
        kind: "enum",
        label: "Image detail",
        required: false,
        enumValues: ["auto", "low", "high", "original"],
      },
    ],
    assetModes: [
      {
        id: "images",
        label: "Image attachments",
        roles: [
          {
            role: "user_image",
            kinds: ["image"],
            minimum: 1,
            maximum: 8,
          },
        ],
      },
    ],
  },
  {
    id: "vision-files:v1",
    schemaVersion: "1.0.0",
    operation: "files.upload",
    fields: [],
    assetModes: [
      {
        id: "images",
        label: "Image files",
        roles: [
          {
            role: "user_image",
            kinds: ["image"],
            minimum: 1,
            maximum: 8,
          },
        ],
      },
    ],
  },
  {
    id: "google-files:v1",
    schemaVersion: "1.0.0",
    operation: "files.upload",
    fields: [],
  },
  {
    id: "minimax:h3:official:v1",
    schemaVersion: "1.0.0",
    operation: "video.generate",
    fields: h3Fields({ minimumDuration: 4, resolutions: ["768P", "2K"], falOptions: false }),
    assetModes: h3AssetModes(false),
  },
  {
    id: "minimax:h3:fal:v1",
    schemaVersion: "1.0.0",
    operation: "video.generate",
    fields: h3Fields({
      minimumDuration: 5,
      resolutions: ["480P", "768P", "2K", "4K"],
      falOptions: true,
    }),
    assetModes: h3AssetModes(true),
  },
  imageCapabilitySchema({
    id: "google:nano-banana-2-lite:generate:v1",
    operation: "image.generate",
    imageSizes: ["1K"],
    aspectRatios: standardImageAspectRatios,
    maximumReferences: 14,
    grounding: false,
  }),
  imageCapabilitySchema({
    id: "google:nano-banana-2-lite:edit:v1",
    operation: "image.edit",
    imageSizes: ["1K"],
    aspectRatios: standardImageAspectRatios,
    maximumReferences: 14,
    grounding: false,
  }),
  imageCapabilitySchema({
    id: "google:nano-banana-2:generate:v1",
    operation: "image.generate",
    imageSizes: ["512", "1K", "2K", "4K"],
    aspectRatios: [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
    ],
    maximumReferences: 14,
    grounding: true,
  }),
  imageCapabilitySchema({
    id: "google:nano-banana-2:edit:v1",
    operation: "image.edit",
    imageSizes: ["512", "1K", "2K", "4K"],
    aspectRatios: [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
    ],
    maximumReferences: 14,
    grounding: true,
  }),
  imageCapabilitySchema({
    id: "google:nano-banana-pro:generate:v1",
    operation: "image.generate",
    imageSizes: ["1K", "2K", "4K"],
    aspectRatios: standardImageAspectRatios,
    maximumReferences: 14,
    grounding: true,
  }),
  imageCapabilitySchema({
    id: "google:nano-banana-pro:edit:v1",
    operation: "image.edit",
    imageSizes: ["1K", "2K", "4K"],
    aspectRatios: standardImageAspectRatios,
    maximumReferences: 14,
    grounding: true,
  }),
  createGoogleVeoCapabilitySchema({
    id: "google:veo-3.1:v1",
    resolutions: ["720P", "1080P", "4K"],
    advanced: true,
  }),
  createGoogleVeoCapabilitySchema({
    id: "google:veo-3.1-lite:v1",
    resolutions: ["720P", "1080P"],
    advanced: false,
  }),
  {
    id: "google:omni-video:v1",
    schemaVersion: "1.0.0",
    operation: "video.generate",
    fields: [
      {
        path: "prompt",
        kind: "text",
        label: "Prompt",
        required: true,
        maximumLength: 32_000,
      },
      {
        path: "durationSeconds",
        kind: "integer",
        label: "Duration",
        required: false,
        minimum: 3,
        maximum: 10,
        unit: "seconds",
      },
      {
        path: "resolution",
        kind: "enum",
        label: "Resolution",
        required: false,
        enumValues: ["720P"],
      },
      {
        path: "aspectRatio",
        kind: "enum",
        label: "Aspect ratio",
        required: false,
        enumValues: ["16:9", "9:16"],
      },
    ],
    assetModes: [
      { id: "text", label: "Text to video", roles: [], maximumTotalAssets: 0 },
      {
        id: "images",
        label: "Images to video",
        roles: [
          { role: "first_frame", kinds: ["image"], minimum: 0, maximum: 1 },
          { role: "reference_image", kinds: ["image"], minimum: 0, maximum: 6 },
        ],
        minimumTotalAssets: 1,
        maximumTotalAssets: 6,
      },
      {
        id: "edit",
        label: "Continue editing",
        roles: [],
        maximumTotalAssets: 0,
        requiresContinuation: true,
      },
    ],
  },
] satisfies CapabilitySchema[];

export const builtinCatalog = {
  schemaVersion: "2.0.0",
  providers: [
    {
      id: "deepseek",
      name: "DeepSeek",
      regions: ["CN", "global"],
      credentialSlots: [{ slot: "apiKey", environmentVariables: ["DEEPSEEK_API_KEY"] }],
    },
    {
      id: "minimax",
      name: "MiniMax",
      regions: ["CN"],
      credentialSlots: [{ slot: "apiKey", environmentVariables: ["MINIMAX_API_KEY"] }],
    },
    {
      id: "fal",
      name: "fal.ai",
      regions: ["global"],
      credentialSlots: [{ slot: "apiKey", environmentVariables: ["FAL_KEY", "FAL_API_KEY"] }],
    },
    {
      id: "google",
      name: "Google AI",
      regions: ["global"],
      credentialSlots: [
        {
          slot: "apiKey",
          environmentVariables: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
        },
      ],
    },
  ],
  models: [
    {
      id: "deepseek:v4-pro",
      owner: "deepseek",
      family: "v4",
      name: "DeepSeek V4 Pro",
      lifecycle: "stable",
    },
    {
      id: "deepseek:v4-flash",
      owner: "deepseek",
      family: "v4",
      name: "DeepSeek V4 Flash",
      lifecycle: "stable",
    },
    {
      id: "deepseek:v4-flash-vision-exp",
      owner: "deepseek",
      family: "v4",
      name: "DeepSeek V4 Flash Vision Experimental",
      lifecycle: "experimental",
    },
    {
      id: "minimax:h3",
      owner: "minimax",
      family: "h3",
      name: "MiniMax H3",
      lifecycle: "stable",
    },
    {
      id: "google:gemini-3.7-flash",
      owner: "google",
      family: "gemini-3.7",
      name: "Gemini 3.7 Flash",
      lifecycle: "stable",
    },
    {
      id: "google:nano-banana-2",
      owner: "google",
      family: "nano-banana",
      name: "Nano Banana 2",
      lifecycle: "stable",
    },
    {
      id: "google:nano-banana-2-lite",
      owner: "google",
      family: "nano-banana",
      name: "Nano Banana 2 Lite",
      lifecycle: "stable",
    },
    {
      id: "google:nano-banana-pro",
      owner: "google",
      family: "nano-banana",
      name: "Nano Banana Pro",
      lifecycle: "stable",
    },
    {
      id: "google:gemini-omni-flash",
      owner: "google",
      family: "gemini-omni",
      name: "Gemini Omni Flash",
      lifecycle: "preview",
    },
    {
      id: "google:veo-3.1",
      owner: "google",
      family: "veo-3.1",
      name: "Veo 3.1",
      lifecycle: "preview",
    },
    {
      id: "google:veo-3.1-fast",
      owner: "google",
      family: "veo-3.1",
      name: "Veo 3.1 Fast",
      lifecycle: "preview",
    },
    {
      id: "google:veo-3.1-lite",
      owner: "google",
      family: "veo-3.1",
      name: "Veo 3.1 Lite",
      lifecycle: "preview",
    },
  ],
  offerings: [
    {
      id: "deepseek:v4-pro:official",
      canonicalModelId: "deepseek:v4-pro",
      providerId: "deepseek",
      providerModelId: "deepseek-v4-pro",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "language.generate",
          capabilitySchemaId: "language:v1",
          enabled: true,
          features: ["tools", "thinking", "structured_output"],
        },
        {
          operation: "language.stream",
          capabilitySchemaId: "language-stream:v1",
          enabled: true,
          features: ["streaming", "tools", "thinking", "structured_output"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T15:45:00+08:00",
      },
    },
    {
      id: "deepseek:v4-flash:official",
      canonicalModelId: "deepseek:v4-flash",
      providerId: "deepseek",
      providerModelId: "deepseek-v4-flash",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "language.generate",
          capabilitySchemaId: "language:v1",
          enabled: true,
          features: ["tools", "thinking", "structured_output"],
        },
        {
          operation: "language.stream",
          capabilitySchemaId: "language-stream:v1",
          enabled: true,
          features: ["streaming", "tools", "thinking", "structured_output"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T15:45:00+08:00",
      },
    },
    {
      id: "deepseek:v4-flash-vision-exp:official",
      canonicalModelId: "deepseek:v4-flash-vision-exp",
      providerId: "deepseek",
      providerModelId: "deepseek-v4-flash-vision-exp",
      accessChannel: "official",
      lifecycle: "experimental",
      operations: [
        {
          operation: "language.generate",
          capabilitySchemaId: "vision-language:v1",
          enabled: true,
          features: ["tools", "thinking", "structured_output", "image_input"],
        },
        {
          operation: "language.stream",
          capabilitySchemaId: "vision-language-stream:v1",
          enabled: true,
          features: ["streaming", "tools", "thinking", "structured_output", "image_input"],
        },
        {
          operation: "files.upload",
          capabilitySchemaId: "vision-files:v1",
          enabled: true,
          features: ["provider_files", "image_input"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T15:45:00+08:00",
      },
    },
    {
      id: "minimax:h3:official",
      canonicalModelId: "minimax:h3",
      providerId: "minimax",
      providerModelId: "MiniMax-H3",
      accessChannel: "official",
      lifecycle: "stable",
      operations: videoCapability("minimax:h3:official:v1", [
        { resolution: "768P", delivery: "native" },
        { resolution: "2K", delivery: "native" },
      ]),
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T18:30:00+08:00",
      },
      priceSnapshotId: "minimax:h3:cn:2026-08-23",
    },
    {
      id: "minimax:h3:fal",
      canonicalModelId: "minimax:h3",
      providerId: "fal",
      providerModelId: "minimax/h3",
      accessChannel: "aggregator",
      lifecycle: "stable",
      operations: videoCapability("minimax:h3:fal:v1", [
        { resolution: "480P", delivery: "native" },
        { resolution: "768P", delivery: "native" },
        { resolution: "2K", delivery: "upscaled", sourceResolution: "768P" },
        { resolution: "4K", delivery: "upscaled", sourceResolution: "768P" },
      ]),
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T18:30:00+08:00",
      },
      priceSnapshotId: "fal:minimax:h3:public:2026-08-23",
    },
    {
      id: "google:gemini-3.7-flash:official",
      canonicalModelId: "google:gemini-3.7-flash",
      providerId: "google",
      providerModelId: "gemini-3.7-flash",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "language.generate",
          capabilitySchemaId: "language:v1",
          enabled: true,
          features: [
            "tools",
            "thinking",
            "structured_output",
            "image_input",
            "video_input",
            "audio_input",
            "pdf_input",
            "provider_files",
            "grounding",
          ],
        },
        {
          operation: "language.stream",
          capabilitySchemaId: "language-stream:v1",
          enabled: true,
          features: [
            "streaming",
            "tools",
            "thinking",
            "structured_output",
            "image_input",
            "video_input",
            "audio_input",
            "pdf_input",
            "provider_files",
            "grounding",
          ],
        },
        {
          operation: "files.upload",
          capabilitySchemaId: "google-files:v1",
          enabled: true,
          features: ["provider_files", "image_input", "video_input", "audio_input", "pdf_input"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:nano-banana-2-lite:official",
      canonicalModelId: "google:nano-banana-2-lite",
      providerId: "google",
      providerModelId: "gemini-3.1-flash-lite-image",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "image.generate",
          capabilitySchemaId: "google:nano-banana-2-lite:generate:v1",
          enabled: true,
        },
        {
          operation: "image.edit",
          capabilitySchemaId: "google:nano-banana-2-lite:edit:v1",
          enabled: true,
          features: ["image_input"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:nano-banana-2:official",
      canonicalModelId: "google:nano-banana-2",
      providerId: "google",
      providerModelId: "gemini-3.1-flash-image",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "image.generate",
          capabilitySchemaId: "google:nano-banana-2:generate:v1",
          enabled: true,
          features: ["grounding"],
        },
        {
          operation: "image.edit",
          capabilitySchemaId: "google:nano-banana-2:edit:v1",
          enabled: true,
          features: ["image_input", "grounding"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:nano-banana-pro:official",
      canonicalModelId: "google:nano-banana-pro",
      providerId: "google",
      providerModelId: "gemini-3-pro-image",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        {
          operation: "image.generate",
          capabilitySchemaId: "google:nano-banana-pro:generate:v1",
          enabled: true,
          features: ["grounding"],
        },
        {
          operation: "image.edit",
          capabilitySchemaId: "google:nano-banana-pro:edit:v1",
          enabled: true,
          features: ["image_input", "grounding"],
        },
      ],
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:gemini-omni-flash:official",
      canonicalModelId: "google:gemini-omni-flash",
      providerId: "google",
      providerModelId: "gemini-omni-flash-preview",
      accessChannel: "official",
      lifecycle: "preview",
      operations: videoCapability("google:omni-video:v1", [
        { resolution: "720P", delivery: "native" },
      ]),
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:veo-3.1:official",
      canonicalModelId: "google:veo-3.1",
      providerId: "google",
      providerModelId: "veo-3.1-generate-preview",
      accessChannel: "official",
      lifecycle: "preview",
      operations: videoCapability(
        "google:veo-3.1:v1",
        [
          { resolution: "720P", delivery: "native" },
          { resolution: "1080P", delivery: "native" },
          { resolution: "4K", delivery: "native" },
        ],
        false,
      ),
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:veo-3.1-fast:official",
      canonicalModelId: "google:veo-3.1-fast",
      providerId: "google",
      providerModelId: "veo-3.1-fast-generate-preview",
      accessChannel: "official",
      lifecycle: "preview",
      operations: videoCapability(
        "google:veo-3.1:v1",
        [
          { resolution: "720P", delivery: "native" },
          { resolution: "1080P", delivery: "native" },
          { resolution: "4K", delivery: "native" },
        ],
        false,
      ),
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
    {
      id: "google:veo-3.1-lite:official",
      canonicalModelId: "google:veo-3.1-lite",
      providerId: "google",
      providerModelId: "veo-3.1-lite-generate-preview",
      accessChannel: "official",
      lifecycle: "preview",
      operations: videoCapability(
        "google:veo-3.1-lite:v1",
        [
          { resolution: "720P", delivery: "native" },
          { resolution: "1080P", delivery: "native" },
        ],
        false,
      ),
      support: {
        implementation: "implemented",
        evidence: ["implemented", "contract_verified"],
        lastVerifiedAt: "2026-08-23T22:30:00+08:00",
      },
    },
  ],
  capabilitySchemas: builtinCapabilitySchemas,
  priceSnapshots: [
    {
      id: "minimax:h3:cn:2026-08-23",
      offeringId: "minimax:h3:official",
      operation: "video.generate",
      currency: "CNY",
      pricingModel: "request_meters",
      rates: [
        {
          meter: "output_video_second",
          unitPrice: "0.50",
          selector: { resolution: "768P" },
        },
        {
          meter: "output_video_second",
          unitPrice: "0.80",
          selector: { resolution: "2K" },
        },
        {
          meter: "input_image",
          unitPrice: "0.20",
          includedUnits: 5,
        },
        {
          meter: "input_reference_video_second",
          unitPrice: "0.50",
          selector: { resolution: "768P" },
        },
        {
          meter: "input_reference_video_second",
          unitPrice: "0.80",
          selector: { resolution: "2K" },
        },
        {
          meter: "input_audio_second",
          unitPrice: "0.00",
        },
      ],
      coverage: {
        inputImage: "metered",
        referenceVideo: "metered",
        inputAudio: "metered",
      },
      comparisonBasisByResolution: {
        "768P": "minimax-h3:768P:native",
        "2K": "minimax-h3:2K:native",
      },
      sourceUrl: "https://platform.minimaxi.com/docs/guides/pricing-paygo",
      sourceScope: "public",
      asOf: "2026-08-23",
      expiresAt: "2026-09-23T00:00:00+08:00",
    },
    {
      id: "fal:minimax:h3:public:2026-08-23",
      offeringId: "minimax:h3:fal",
      operation: "video.generate",
      currency: "USD",
      pricingModel: "request_meters",
      rates: [
        {
          meter: "output_video_second",
          unitPrice: "0.05",
          selector: { resolution: "480P" },
        },
        {
          meter: "output_video_second",
          unitPrice: "0.06",
          selector: { resolution: "768P" },
        },
        {
          meter: "output_video_second",
          unitPrice: "0.13",
          selector: { resolution: "2K" },
        },
        {
          meter: "output_video_second",
          unitPrice: "0.16",
          selector: { resolution: "4K" },
        },
        {
          meter: "input_image",
          unitPrice: "0.08",
          includedUnits: 5,
        },
      ],
      coverage: {
        inputImage: "metered",
        referenceVideo: "unknown",
        inputAudio: "unknown",
      },
      comparisonBasisByResolution: {
        "480P": "minimax-h3:480P:native",
        "768P": "minimax-h3:768P:native",
        "2K": "minimax-h3:768P:upscaled-to-2K",
        "4K": "minimax-h3:768P:upscaled-to-4K",
      },
      sourceUrl: "https://fal.ai/models/minimax/h3/reference-to-video",
      sourceScope: "public",
      asOf: "2026-08-23",
      expiresAt: "2026-09-23T00:00:00+08:00",
    },
  ],
} satisfies ProviderCatalog;
