import type { CapabilitySchema } from "@/providers/domain/capabilities";
import type { CapabilitySchemaId } from "@/providers/domain/ids";

export const googleVeoDurationSeconds = [4, 6, 8] as const;

export function createGoogleVeoCapabilitySchema(input: {
  id: CapabilitySchemaId;
  resolutions: string[];
  advanced: boolean;
}): CapabilitySchema {
  return {
    id: input.id,
    schemaVersion: "1.0.0",
    operation: "video.generate",
    fields: [
      {
        path: "prompt",
        kind: "text",
        label: "Prompt",
        required: true,
        maximumLength: 7_000,
      },
      {
        path: "durationSeconds",
        kind: "integer",
        label: "Duration",
        required: true,
        allowedValues: [...googleVeoDurationSeconds],
        unit: "seconds",
      },
      {
        path: "resolution",
        kind: "enum",
        label: "Resolution",
        required: true,
        enumValues: input.resolutions,
      },
      {
        path: "aspectRatio",
        kind: "enum",
        label: "Aspect ratio",
        required: true,
        enumValues: ["16:9", "9:16"],
      },
      {
        path: "seed",
        kind: "integer",
        label: "Seed",
        required: false,
        advanced: true,
      },
      {
        path: "negativePrompt",
        kind: "text",
        label: "Negative prompt",
        required: false,
        maximumLength: 7_000,
        advanced: true,
      },
      {
        path: "enhancePrompt",
        kind: "boolean",
        label: "Enhance prompt",
        required: false,
        advanced: true,
      },
    ],
    assetModes: [
      { id: "text", label: "Text to video", roles: [], maximumTotalAssets: 0 },
      {
        id: "keyframes",
        label: "Keyframes to video",
        roles: [
          { role: "first_frame", kinds: ["image"], minimum: 1, maximum: 1 },
          { role: "last_frame", kinds: ["image"], minimum: 0, maximum: 1 },
        ],
        minimumTotalAssets: 1,
        maximumTotalAssets: 2,
      },
      ...(input.advanced
        ? [
            {
              id: "reference",
              label: "Reference images to video",
              roles: [
                {
                  role: "reference_image",
                  kinds: ["image" as const],
                  minimum: 1,
                  maximum: 3,
                },
              ],
              minimumTotalAssets: 1,
              maximumTotalAssets: 3,
              fieldRules: [{ path: "durationSeconds", allowedValues: [8] }],
            },
            {
              id: "extend",
              label: "Extend Veo video",
              roles: [{ role: "source_video", kinds: ["video" as const], minimum: 1, maximum: 1 }],
              minimumTotalAssets: 1,
              maximumTotalAssets: 1,
              fieldRules: [
                { path: "durationSeconds", allowedValues: [8] },
                { path: "resolution", allowedValues: ["720P"] },
              ],
            },
          ]
        : []),
    ],
    valueConstraints: [
      {
        when: { path: "resolution", values: ["1080P", "4K"] },
        require: [{ path: "durationSeconds", allowedValues: [8] }],
      },
    ],
  };
}
