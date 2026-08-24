import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { OfferingId } from "@/providers/domain/ids";
import type { Operation } from "@/providers/domain/operations";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface AcceptanceAssetFixture {
  sha256: string;
  mediaType: string;
  kind: "image" | "video" | "audio" | "document";
  filename: string;
  source: { type: "path"; path: string } | { type: "base64"; dataBase64: string };
}

export interface AcceptanceCase {
  id: string;
  group: string;
  deterministicEvaluatorId: "language.v1" | "image.v1" | "video.v1" | "video-cancel.v1";
  operations: readonly Operation[];
  expectedTerminalOutcome: "succeeded" | "cancelled";
  input: {
    prompt: string;
    mode: string;
    options: Readonly<Record<string, JsonValue>>;
    assets: readonly { fixtureId: keyof typeof acceptanceAssetFixtures; role: string }[];
  };
  expectedFacts: readonly string[];
  deterministicAssertions: readonly string[];
  hardFailureDefinitions: readonly string[];
}

export type AcceptanceProfile =
  | {
      kind: "facts";
      cases: readonly AcceptanceCase[];
      groups: readonly { id: string; caseIds: readonly string[] }[];
      minimumFactsRatio: number;
    }
  | {
      kind: "rubric";
      cases: readonly AcceptanceCase[];
      groups: readonly { id: string; caseIds: readonly string[]; minimumAccepted: number }[];
      minimumScore: number;
    };

export const acceptanceAssetFixtures = {
  logo: {
    sha256: "f7dcd68febfad3733a6613b3950123f83edd77718d93aff0ce4a4cec4e957e8b",
    mediaType: "image/png",
    kind: "image",
    filename: "logo.png",
    source: { type: "path", path: "docs/logo.png" },
  },
  applicationScreenshot: {
    sha256: "38a05e1819ffda1493f085a8c802d71c1bc41827c5e36ff6de03a517d17a43e2",
    mediaType: "image/png",
    kind: "image",
    filename: "application-screenshot.png",
    source: { type: "path", path: "docs/screenshot/1.png" },
  },
  videoCover: {
    sha256: "1534fe4b17f0bc57c2020c807b9923da661627522b798a276b6cb1430902b67b",
    mediaType: "image/jpeg",
    kind: "image",
    filename: "video-cover.jpg",
    source: { type: "path", path: "docs/videoCover.jpg" },
  },
  endingVideo: {
    sha256: "007215dfc1b2c07b3cad436e22c990822f86cdb45a6f19cc36159b9d51fcb317",
    mediaType: "video/mp4",
    kind: "video",
    filename: "ending.mp4",
    source: { type: "path", path: "data/assets/ending.mp4" },
  },
  referenceTone: {
    sha256: "ed756608fa5636d9a8a95ce48219ff023bf203b21ffe73f0b09be3e4b7d40d9d",
    mediaType: "audio/wav",
    kind: "audio",
    filename: "reference-tone.wav",
    source: {
      type: "base64",
      dataBase64:
        "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",
    },
  },
  acceptanceDocument: {
    sha256: "30453d800f73705c17c38564890e7d4fe128a4697981d6c867eb0ddf707abe5d",
    mediaType: "application/pdf",
    kind: "document",
    filename: "acceptance-document.pdf",
    source: {
      type: "base64",
      dataBase64:
        "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxNDAgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3MjAgVGQgKFRvb25mbG93IGFjY2VwdGFuY2UgZG9jdW1lbnQpIFRqIDAgLTMwIFRkIC9GMSAxMiBUZiAoSW52b2ljZSBJRDogVEYtMjAyNi0wODIzKSBUaiAwIC0yMCBUZCAoVG90YWw6IENOWSA3NjguMDApIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwNDMyIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNTAyCiUlRU9GCg==",
    },
  },
} as const satisfies Record<string, AcceptanceAssetFixture>;

export async function acceptanceFixtureBytes(
  repositoryRoot: string,
  fixtureId: keyof typeof acceptanceAssetFixtures,
): Promise<Buffer> {
  const fixture = acceptanceAssetFixtures[fixtureId];
  return fixture.source.type === "path"
    ? readFile(path.join(repositoryRoot, fixture.source.path))
    : Buffer.from(fixture.source.dataBase64, "base64");
}

export const frozenAcceptanceDefinitions = {
  personResponse: {
    name: "person",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        occupation: { type: "string" },
        birthYear: { type: "integer" },
      },
      required: ["name", "occupation", "birthYear"],
      additionalProperties: false,
    },
  },
  addTool: {
    name: "add",
    description: "Add two integers.",
    inputSchema: {
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "integer" } },
      required: ["a", "b"],
      additionalProperties: false,
    },
    strict: true,
  },
  imageKindTool: {
    name: "record_image_kind",
    description: "Record the visual kind of the supplied image.",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["logo", "application_screenshot", "other"] } },
      required: ["kind"],
      additionalProperties: false,
    },
    strict: true,
  },
  imageMetadataResponse: {
    name: "image_metadata",
    schema: {
      type: "object",
      properties: { mediaType: { type: "string" }, hasTransparency: { type: "boolean" } },
      required: ["mediaType", "hasTransparency"],
      additionalProperties: false,
    },
  },
  weatherTool: {
    name: "lookup_weather",
    description: "Look up weather for one city.",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
      additionalProperties: false,
    },
    strict: true,
  },
  comparisonResponse: {
    name: "asset_comparison",
    schema: {
      type: "object",
      properties: {
        imageSubject: { type: "string" },
        finalVideoFrame: { type: "string" },
        relationship: { type: "string" },
      },
      required: ["imageSubject", "finalVideoFrame", "relationship"],
      additionalProperties: false,
    },
  },
  googleSearch: {
    mode: "web_search",
    requiredSourceHost: "ai.google.dev",
    targetUrl: "https://ai.google.dev/gemini-api/docs/google-search",
  },
  omniContinuation: {
    sourceCaseId: "omni-text",
    requiredProviderId: "google",
    requiredTerminalOutcome: "succeeded",
    requireSameOffering: true,
  },
} as const satisfies Record<string, JsonValue>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function acceptanceCaseSha256(acceptanceCase: AcceptanceCase): string {
  return createHash("sha256").update(canonicalJson(acceptanceCase)).digest("hex");
}

function languageCase(
  id: string,
  prompt: string,
  expectedFacts: readonly string[],
  operations: readonly Operation[] = ["language.generate"],
  options: Readonly<Record<string, JsonValue>> = {},
): AcceptanceCase {
  return {
    id,
    group: "language",
    deterministicEvaluatorId: "language.v1",
    operations,
    expectedTerminalOutcome: "succeeded",
    input: { prompt, mode: "text", options, assets: [] },
    expectedFacts,
    deterministicAssertions: [
      "response has a provider request id and resolved model id",
      "all requested structured fields or tool calls validate against the frozen schema",
      "usage and terminal stream markers are internally consistent",
    ],
    hardFailureDefinitions: [
      "invented required fact",
      "missing required structured field or tool argument",
      "stream loses content, tool state, or terminal event",
    ],
  };
}

function mediaCase(input: {
  id: string;
  group: string;
  operations: readonly Operation[];
  prompt: string;
  mode: string;
  options: Readonly<Record<string, JsonValue>>;
  assets?: AcceptanceCase["input"]["assets"];
  expectedFacts: readonly string[];
  expectedTerminalOutcome?: "succeeded" | "cancelled";
  assertions?: readonly string[];
  hardFailures?: readonly string[];
}): AcceptanceCase {
  const languageOperation = input.operations.some((operation) => operation.startsWith("language."));
  return {
    id: input.id,
    group: input.group,
    deterministicEvaluatorId: languageOperation
      ? "language.v1"
      : input.operations.some((operation) => operation.startsWith("image."))
        ? "image.v1"
        : input.expectedTerminalOutcome === "cancelled"
          ? "video-cancel.v1"
          : "video.v1",
    operations: input.operations,
    expectedTerminalOutcome: input.expectedTerminalOutcome ?? "succeeded",
    input: {
      prompt: input.prompt,
      mode: input.mode,
      options: input.options,
      assets: input.assets ?? [],
    },
    expectedFacts: input.expectedFacts,
    deterministicAssertions:
      input.assertions ??
      (languageOperation
        ? [
            "every requested image, file, detail, tool, and response-format control is present in the exact port request evidence",
            "every requested operation returns a provider request id and resolved model id",
            "structured outputs and tool arguments validate against the frozen JSON Schema",
          ]
        : [
            "terminal state and provider request id are recorded",
            "owned artifact MIME, duration, dimensions, and byte length match the offering contract",
            "every requested control is present in the exact port request evidence",
          ]),
    hardFailureDefinitions: input.hardFailures ?? [
      "required subject identity is replaced",
      "required reference or control is ignored",
      "artifact is corrupt, truncated, or outside the declared output contract",
    ],
  };
}

const deepSeekLanguageCases = [
  languageCase(
    "instruction",
    "Return exactly the three prime numbers between 10 and 20 in ascending order.",
    ["11", "13", "17", "no additional number"],
    ["language.generate", "language.stream"],
  ),
  languageCase(
    "structured-output",
    "Extract Ada Lovelace, mathematician, 1815 into the supplied JSON schema.",
    ["name=Ada Lovelace", "occupation=mathematician", "birthYear=1815"],
    ["language.generate"],
    { responseFormat: frozenAcceptanceDefinitions.personResponse },
  ),
  languageCase(
    "tool-call",
    "Use the add tool once to calculate 137 + 905; do not calculate it in prose.",
    ["tool=add", "a=137", "b=905", "result=1042"],
    ["language.generate"],
    { tools: [frozenAcceptanceDefinitions.addTool] },
  ),
  languageCase(
    "reasoning-high",
    "A box has 3 red and 2 blue balls. State the probability of red as a reduced fraction.",
    ["3/5"],
    ["language.generate"],
    { reasoningEffort: "high" },
  ),
  languageCase(
    "reasoning-max",
    "Solve 2x + 7 = 19 and return only the integer x.",
    ["6"],
    ["language.generate"],
    { reasoningEffort: "max" },
  ),
] as const;

const deepSeekVisionCases = [
  mediaCase({
    id: "jpeg-logo",
    group: "vision",
    operations: ["language.generate"],
    prompt: "Identify the product name shown in the image.",
    mode: "inline-image",
    options: { detail: "auto" },
    assets: [{ fixtureId: "videoCover", role: "image" }],
    expectedFacts: ["visible title or product name matches the fixture"],
  }),
  mediaCase({
    id: "png-screenshot",
    group: "vision",
    operations: ["language.generate"],
    prompt: "List the primary UI regions visible in this application screenshot.",
    mode: "inline-image",
    options: { detail: "high" },
    assets: [{ fixtureId: "applicationScreenshot", role: "image" }],
    expectedFacts: ["describes only regions visible in the frozen screenshot"],
  }),
  mediaCase({
    id: "multi-image",
    group: "vision",
    operations: ["language.generate"],
    prompt:
      "Compare the logo image with the application screenshot and state which is a UI capture.",
    mode: "multi-image",
    options: { detail: "auto" },
    assets: [
      { fixtureId: "logo", role: "image" },
      { fixtureId: "applicationScreenshot", role: "image" },
    ],
    expectedFacts: [
      "applicationScreenshot is the UI capture",
      "logo is not described as a UI capture",
    ],
  }),
  mediaCase({
    id: "tool-image",
    group: "vision",
    operations: ["language.generate"],
    prompt: "Call record_image_kind with the best matching kind for this image.",
    mode: "inline-image",
    options: { tools: [frozenAcceptanceDefinitions.imageKindTool] },
    assets: [{ fixtureId: "logo", role: "image" }],
    expectedFacts: ["tool=record_image_kind", "kind=logo"],
  }),
  mediaCase({
    id: "structured-image",
    group: "vision",
    operations: ["language.generate"],
    prompt:
      "Return the image media type and whether it has transparency using the supplied schema.",
    mode: "inline-image",
    options: { responseFormat: frozenAcceptanceDefinitions.imageMetadataResponse },
    assets: [{ fixtureId: "logo", role: "image" }],
    expectedFacts: ["mediaType=image/png"],
  }),
  mediaCase({
    id: "image-reasoning-high",
    group: "vision",
    operations: ["language.generate"],
    prompt: "Count the distinct top-level visual marks in the logo and explain the count briefly.",
    mode: "inline-image",
    options: { reasoningEffort: "high" },
    assets: [{ fixtureId: "logo", role: "image" }],
    expectedFacts: ["count is grounded only in the fixture"],
  }),
  mediaCase({
    id: "file-reference",
    group: "vision",
    operations: ["files.upload", "language.generate"],
    prompt: "Describe the uploaded image in one sentence.",
    mode: "provider-file",
    options: { reuseUploadedFile: true },
    assets: [{ fixtureId: "logo", role: "image" }],
    expectedFacts: ["description matches the uploaded logo", "provider file id is reused"],
  }),
  mediaCase({
    id: "stream-multimodal",
    group: "vision",
    operations: ["language.stream"],
    prompt: "Stream a two-bullet comparison of these images.",
    mode: "multi-image",
    options: { detail: "auto" },
    assets: [
      { fixtureId: "logo", role: "image" },
      { fixtureId: "videoCover", role: "image" },
    ],
    expectedFacts: ["exactly two bullets", "both fixtures are addressed"],
  }),
] as const;

const h3Cases = [
  ...[
    ["text-landscape", "16:9"],
    ["text-portrait", "9:16"],
    ["text-square", "1:1"],
  ].map(([id, aspectRatio]) =>
    mediaCase({
      id: id!,
      group: "text",
      operations: ["video.generate", "video.status"],
      prompt:
        "A red paper boat travels across a still blue pond, locked camera, continuous motion.",
      mode: "text",
      options: { durationSeconds: 5, resolution: "768P", aspectRatio: aspectRatio! },
      expectedFacts: ["red paper boat remains the primary subject", "continuous forward travel"],
    }),
  ),
  mediaCase({
    id: "keyframe-first",
    group: "keyframes",
    operations: ["video.generate", "video.status"],
    prompt: "Animate the supplied first frame with a slow camera push.",
    mode: "keyframes",
    options: { durationSeconds: 5, resolution: "768P", aspectRatio: "adaptive" },
    assets: [{ fixtureId: "videoCover", role: "first_frame" }],
    expectedFacts: ["opening frame preserves the supplied composition"],
  }),
  mediaCase({
    id: "keyframe-first-last",
    group: "keyframes",
    operations: ["video.generate", "video.status"],
    prompt: "Transition smoothly from the first frame to the last frame.",
    mode: "keyframes",
    options: { durationSeconds: 5, resolution: "768P", aspectRatio: "adaptive" },
    assets: [
      { fixtureId: "videoCover", role: "first_frame" },
      { fixtureId: "logo", role: "last_frame" },
    ],
    expectedFacts: ["starts from videoCover", "ends on logo"],
  }),
  mediaCase({
    id: "keyframe-adaptive",
    group: "keyframes",
    operations: ["video.generate", "video.status"],
    prompt: "Animate subtle parallax while preserving the source aspect ratio.",
    mode: "keyframes",
    options: { durationSeconds: 10, resolution: "2K", aspectRatio: "adaptive" },
    assets: [{ fixtureId: "applicationScreenshot", role: "first_frame" }],
    expectedFacts: ["source aspect ratio is preserved"],
  }),
  mediaCase({
    id: "reference-image",
    group: "reference",
    operations: ["video.generate", "video.status"],
    prompt: "Create a short scene that preserves the supplied logo identity.",
    mode: "reference",
    options: { durationSeconds: 5, resolution: "768P" },
    assets: [{ fixtureId: "logo", role: "reference_image" }],
    expectedFacts: ["logo identity is recognizable"],
  }),
  mediaCase({
    id: "reference-video",
    group: "reference",
    operations: ["video.generate", "video.status"],
    prompt: "Create a new shot with motion rhythm matching the reference video.",
    mode: "reference",
    options: { durationSeconds: 5, resolution: "768P" },
    assets: [{ fixtureId: "endingVideo", role: "reference_video" }],
    expectedFacts: ["motion rhythm follows the reference"],
  }),
  mediaCase({
    id: "reference-mixed",
    group: "reference",
    operations: ["video.generate", "video.status"],
    prompt: "Use the image identity and the video motion as separate references.",
    mode: "reference",
    options: { durationSeconds: 5, resolution: "2K" },
    assets: [
      { fixtureId: "logo", role: "reference_image" },
      { fixtureId: "endingVideo", role: "reference_video" },
    ],
    expectedFacts: ["image identity is preserved", "video motion is reflected"],
  }),
  mediaCase({
    id: "protocol-cancel",
    group: "protocol",
    operations: ["video.generate", "video.cancel"],
    prompt: "A minimal cancellation probe.",
    mode: "text",
    options: { durationSeconds: 5, resolution: "768P", cancelImmediatelyAfterAccepted: true },
    expectedFacts: ["provider accepted then cancelled the exact request id"],
    expectedTerminalOutcome: "cancelled",
    assertions: [
      "submit returns a provider request id",
      "cancel targets that exact request id",
      "terminal state is cancelled without an imported artifact",
    ],
    hardFailures: [
      "cancel targets a different request",
      "generation reaches succeeded after cancellation acknowledgement",
    ],
  }),
] as const;

const geminiCases = [
  {
    ...languageCase(
      "tool-call-weather",
      "Call lookup_weather exactly once for city Hangzhou and return its structured result.",
      ["tool=lookup_weather", "city=Hangzhou"],
      ["language.generate"],
      { tools: [frozenAcceptanceDefinitions.weatherTool] },
    ),
    group: "language-multimodal",
  },
  {
    ...languageCase(
      "search-grounding",
      "Use Google Search grounding to identify the title of the official Google Search grounding documentation at ai.google.dev and cite the returned source metadata.",
      ["grounding metadata is present", "at least one source URI is returned"],
      ["language.stream"],
      { grounding: frozenAcceptanceDefinitions.googleSearch },
    ),
    group: "language-multimodal",
  },
  mediaCase({
    id: "image-understanding",
    group: "language-multimodal",
    operations: ["files.upload", "language.generate"],
    prompt: "Identify this image as a logo or application screenshot.",
    mode: "provider-file",
    options: {},
    assets: [{ fixtureId: "logo", role: "image" }],
    expectedFacts: ["classification=logo"],
  }),
  mediaCase({
    id: "video-understanding",
    group: "language-multimodal",
    operations: ["files.upload", "language.generate"],
    prompt: "Describe the main motion in the video without inventing off-screen events.",
    mode: "provider-file",
    options: {},
    assets: [{ fixtureId: "endingVideo", role: "video" }],
    expectedFacts: ["description is grounded in endingVideo"],
  }),
  mediaCase({
    id: "multi-file-reasoning",
    group: "language-multimodal",
    operations: ["files.upload", "language.generate"],
    prompt: "Compare the image subject with the final video frame using only supplied files.",
    mode: "provider-files",
    options: { responseFormat: frozenAcceptanceDefinitions.comparisonResponse },
    assets: [
      { fixtureId: "logo", role: "image" },
      { fixtureId: "endingVideo", role: "video" },
    ],
    expectedFacts: ["both files are referenced", "comparison schema validates"],
  }),
  mediaCase({
    id: "audio-understanding",
    group: "language-multimodal",
    operations: ["files.upload", "language.generate"],
    prompt: "Classify the uploaded audio as speech, music, or a steady pure tone.",
    mode: "provider-file",
    options: {},
    assets: [{ fixtureId: "referenceTone", role: "audio" }],
    expectedFacts: ["classification=steady pure tone", "no intelligible speech"],
  }),
  mediaCase({
    id: "pdf-understanding",
    group: "language-multimodal",
    operations: ["files.upload", "language.generate"],
    prompt: "Extract the invoice ID and total from the uploaded PDF.",
    mode: "provider-file",
    options: {},
    assets: [{ fixtureId: "acceptanceDocument", role: "document" }],
    expectedFacts: ["invoiceId=TF-2026-0823", "total=CNY 768.00"],
  }),
] as const;

function imageCases(): readonly AcceptanceCase[] {
  return [
    mediaCase({
      id: "generate-square",
      group: "generate",
      operations: ["image.generate"],
      prompt: "A red paper boat centered on a blue pond, no text.",
      mode: "text",
      options: { aspectRatio: "1:1", imageSize: "1K" },
      expectedFacts: ["red paper boat", "blue pond", "no visible text"],
    }),
    mediaCase({
      id: "generate-portrait",
      group: "generate",
      operations: ["image.generate"],
      prompt: "A vertical editorial poster with the exact text NARRASTAGE and a black background.",
      mode: "text",
      options: { aspectRatio: "9:16", imageSize: "1K" },
      expectedFacts: ["NARRASTAGE text", "black background"],
    }),
    mediaCase({
      id: "generate-landscape",
      group: "generate",
      operations: ["image.generate"],
      prompt: "A wide sunrise landscape with three wind turbines.",
      mode: "text",
      options: { aspectRatio: "16:9", imageSize: "1K" },
      expectedFacts: ["sunrise", "exactly three wind turbines"],
    }),
    mediaCase({
      id: "edit-single-reference",
      group: "edit",
      operations: ["image.edit"],
      prompt: "Keep the logo geometry and change only the background to cobalt blue.",
      mode: "reference",
      options: { imageSize: "1K" },
      assets: [{ fixtureId: "logo", role: "reference_image" }],
      expectedFacts: ["logo geometry preserved", "cobalt blue background"],
    }),
    mediaCase({
      id: "edit-multi-reference",
      group: "edit",
      operations: ["image.edit"],
      prompt:
        "Place the supplied logo into the supplied application screenshot without changing other UI regions.",
      mode: "reference",
      options: { imageSize: "1K" },
      assets: [
        { fixtureId: "applicationScreenshot", role: "reference_image" },
        { fixtureId: "logo", role: "reference_image" },
      ],
      expectedFacts: ["logo inserted", "unrelated UI remains stable"],
    }),
    mediaCase({
      id: "edit-text-control",
      group: "edit",
      operations: ["image.edit"],
      prompt: "Replace visible title text with exactly NARRASTAGE while preserving composition.",
      mode: "reference",
      options: { imageSize: "1K" },
      assets: [{ fixtureId: "videoCover", role: "reference_image" }],
      expectedFacts: ["exact text NARRASTAGE", "composition preserved"],
    }),
  ];
}

function cancellationCase(): AcceptanceCase {
  return mediaCase({
    id: "protocol-cancel",
    group: "protocol",
    operations: ["video.generate", "video.cancel"],
    prompt: "A minimal cancellation probe.",
    mode: "text",
    options: { durationSeconds: 4, cancelImmediatelyAfterAccepted: true },
    expectedFacts: ["cancel targets the accepted provider request id"],
    expectedTerminalOutcome: "cancelled",
    assertions: [
      "submit returns a provider request id",
      "cancel targets that exact request id",
      "terminal state is cancelled",
    ],
    hardFailures: [
      "cancel targets a different request",
      "artifact is imported after cancellation acknowledgement",
    ],
  });
}

const omniCases = [
  mediaCase({
    id: "omni-text",
    group: "generate",
    operations: ["video.generate", "video.status"],
    prompt: "A red paper boat crosses a blue pond, 5 seconds.",
    mode: "text",
    options: { durationSeconds: 5, resolution: "720P", aspectRatio: "16:9" },
    expectedFacts: ["red paper boat", "continuous crossing motion"],
  }),
  mediaCase({
    id: "omni-multimodal-images",
    group: "generate",
    operations: ["video.generate", "video.status"],
    prompt: "Animate the first frame while preserving the logo reference identity.",
    mode: "images",
    options: { durationSeconds: 5, resolution: "720P" },
    assets: [
      { fixtureId: "videoCover", role: "first_frame" },
      { fixtureId: "logo", role: "reference_image" },
    ],
    expectedFacts: ["opening frame follows videoCover", "logo identity remains visible"],
  }),
  mediaCase({
    id: "omni-conversational-edit",
    group: "generate",
    operations: ["video.generate", "video.status"],
    prompt: "Continue the accepted parent interaction and change only the sky to sunset orange.",
    mode: "edit",
    options: {
      continuation: frozenAcceptanceDefinitions.omniContinuation,
      durationSeconds: 5,
    },
    expectedFacts: ["same interaction lineage", "only requested sky edit"],
  }),
  cancellationCase(),
] as const;

function veoCases(advanced: boolean): readonly AcceptanceCase[] {
  return [
    mediaCase({
      id: "veo-text",
      group: "generate",
      operations: ["video.generate", "video.status"],
      prompt: "A red paper boat crosses a still blue pond, locked camera.",
      mode: "text",
      options: { durationSeconds: 4, resolution: "720P", aspectRatio: "16:9", seed: 101 },
      expectedFacts: ["red paper boat", "locked camera"],
    }),
    mediaCase({
      id: "veo-first-frame",
      group: "generate",
      operations: ["video.generate", "video.status"],
      prompt: "Animate a slow push from the supplied first frame.",
      mode: "keyframes",
      options: { durationSeconds: 4, resolution: "720P", aspectRatio: "16:9", seed: 102 },
      assets: [{ fixtureId: "videoCover", role: "first_frame" }],
      expectedFacts: ["first frame preserved"],
    }),
    mediaCase({
      id: "veo-first-last",
      group: "generate",
      operations: ["video.generate", "video.status"],
      prompt: "Transition from the supplied first frame to the supplied last frame.",
      mode: "keyframes",
      options: { durationSeconds: 4, resolution: "720P", aspectRatio: "16:9", seed: 103 },
      assets: [
        { fixtureId: "videoCover", role: "first_frame" },
        { fixtureId: "logo", role: "last_frame" },
      ],
      expectedFacts: ["starts at videoCover", "ends at logo"],
    }),
    ...(advanced
      ? [
          mediaCase({
            id: "veo-reference",
            group: "generate",
            operations: ["video.generate", "video.status"],
            prompt: "Preserve the identity of the supplied logo reference.",
            mode: "reference",
            options: { durationSeconds: 8, resolution: "720P", aspectRatio: "16:9", seed: 104 },
            assets: [{ fixtureId: "logo", role: "reference_image" }],
            expectedFacts: ["logo identity preserved"],
          }),
          mediaCase({
            id: "veo-extend",
            group: "generate",
            operations: ["video.generate", "video.status"],
            prompt: "Extend the source video with continuous motion and no visual cut.",
            mode: "extend",
            options: { durationSeconds: 8, resolution: "720P", aspectRatio: "16:9", seed: 105 },
            assets: [{ fixtureId: "endingVideo", role: "source_video" }],
            expectedFacts: ["continuity with source video", "no visible cut at extension boundary"],
          }),
        ]
      : []),
  ];
}

function factsProfile(cases: readonly AcceptanceCase[], group: string): AcceptanceProfile {
  return {
    kind: "facts",
    cases,
    groups: [
      {
        id: group,
        caseIds: cases.filter((entry) => entry.group === group).map((entry) => entry.id),
      },
    ],
    minimumFactsRatio: 0.9,
  };
}

function rubricProfile(
  cases: readonly AcceptanceCase[],
  groups: readonly { id: string; minimumAccepted: number }[],
): AcceptanceProfile {
  return {
    kind: "rubric",
    cases,
    groups: groups.map((group) => ({
      id: group.id,
      minimumAccepted: group.minimumAccepted,
      caseIds: cases.filter((entry) => entry.group === group.id).map((entry) => entry.id),
    })),
    minimumScore: 3,
  };
}

const nanoCases = imageCases();
const veoAdvancedCases = veoCases(true);
const veoLiteCases = veoCases(false);

export const acceptanceProfiles: Readonly<Record<OfferingId, AcceptanceProfile>> = {
  "deepseek:v4-pro:official": factsProfile(deepSeekLanguageCases, "language"),
  "deepseek:v4-flash:official": factsProfile(deepSeekLanguageCases, "language"),
  "deepseek:v4-flash-vision-exp:official": rubricProfile(deepSeekVisionCases, [
    { id: "vision", minimumAccepted: 6 },
  ]),
  "minimax:h3:fal": rubricProfile(h3Cases, [
    { id: "text", minimumAccepted: 2 },
    { id: "keyframes", minimumAccepted: 2 },
    { id: "reference", minimumAccepted: 2 },
  ]),
  "google:gemini-3.7-flash:official": rubricProfile(geminiCases, [
    { id: "language-multimodal", minimumAccepted: 6 },
  ]),
  "google:nano-banana-2-lite:official": rubricProfile(nanoCases, [
    { id: "generate", minimumAccepted: 2 },
    { id: "edit", minimumAccepted: 2 },
  ]),
  "google:nano-banana-2:official": rubricProfile(nanoCases, [
    { id: "generate", minimumAccepted: 2 },
    { id: "edit", minimumAccepted: 2 },
  ]),
  "google:nano-banana-pro:official": rubricProfile(nanoCases, [
    { id: "generate", minimumAccepted: 2 },
    { id: "edit", minimumAccepted: 2 },
  ]),
  "google:gemini-omni-flash:official": rubricProfile(omniCases, [
    { id: "generate", minimumAccepted: 2 },
  ]),
  "google:veo-3.1:official": rubricProfile(veoAdvancedCases, [
    { id: "generate", minimumAccepted: 4 },
  ]),
  "google:veo-3.1-fast:official": rubricProfile(veoAdvancedCases, [
    { id: "generate", minimumAccepted: 4 },
  ]),
  "google:veo-3.1-lite:official": rubricProfile(veoLiteCases, [
    { id: "generate", minimumAccepted: 2 },
  ]),
};
