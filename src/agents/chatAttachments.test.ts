import { describe, expect, test } from "bun:test";
import {
  agentChatInputSchema,
  agentSourceReference,
  agentUserContent,
  type ChatAttachment,
} from "@/agents/chatAttachments";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXsAAAAASUVORK5CYII=";

function inlineAttachment(): ChatAttachment {
  const byteLength = Buffer.from(onePixelPng, "base64").byteLength;
  return {
    schemaVersion: "1.0.0",
    id: "0198d6e8-3d9f-7e91-94df-7ea12177330b",
    filename: "pixel.png",
    mediaType: "image/png",
    byteLength,
    width: 1,
    height: 1,
    detail: "original",
    source: { type: "inline", dataBase64: onePixelPng, byteLength },
  };
}

describe("agent chat attachments", () => {
  test("keeps inline detail as internal provider metadata for the compatibility bridge", () => {
    const attachment = inlineAttachment();
    expect(agentChatInputSchema.parse({ content: "Inspect", attachments: [attachment] })).toEqual({
      content: "Inspect",
      attachments: [attachment],
    });
    expect(agentUserContent("Inspect", [attachment])).toEqual([
      { type: "text", text: "Inspect" },
      {
        type: "file",
        data: { type: "data", data: onePixelPng },
        mediaType: "image/png",
        filename: "pixel.png",
        providerOptions: { toonflow: { imageDetail: "original" } },
      },
    ]);
  });

  test("uses provider references without copying Files payloads into Socket messages", () => {
    const attachment: ChatAttachment = {
      schemaVersion: "1.0.0",
      id: "0198d6e8-3d9f-7e91-94df-7ea12177330c",
      filename: "large.png",
      mediaType: "image/png",
      byteLength: 2_000_000,
      source: {
        type: "provider_file",
        providerId: "deepseek",
        fileId: "file-123",
      },
    };
    expect(agentUserContent("", [attachment])).toEqual([
      {
        type: "file",
        data: { type: "reference", reference: { deepseek: "file-123" } },
        mediaType: "image/png",
        filename: "large.png",
      },
    ]);
  });

  test("rejects inconsistent inline bytes and detail on provider Files", () => {
    expect(
      agentChatInputSchema.safeParse({
        content: "Inspect",
        attachments: [
          {
            ...inlineAttachment(),
            source: { ...inlineAttachment().source, byteLength: 1 },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      agentChatInputSchema.safeParse({
        content: "Inspect",
        attachments: [
          {
            ...inlineAttachment(),
            detail: "high",
            source: { type: "provider_file", providerId: "deepseek", fileId: "file-123" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      agentChatInputSchema.safeParse({
        content: "Listen",
        attachments: [
          {
            ...inlineAttachment(),
            filename: "clip.mp3",
            mediaType: "audio/mpeg",
            detail: "high",
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("accepts audio, video and PDF attachments plus grounding intent", () => {
    for (const [filename, mediaType] of [
      ["clip.mp3", "audio/mpeg"],
      ["clip.mp4", "video/mp4"],
      ["source.pdf", "application/pdf"],
    ] as const) {
      const attachment = {
        ...inlineAttachment(),
        filename,
        mediaType,
        detail: undefined,
      };
      expect(
        agentChatInputSchema.safeParse({
          content: "Analyze",
          attachments: [attachment],
          grounding: true,
        }).success,
      ).toBe(true);
    }
  });

  test("normalizes grounded URL sources for the existing Search UI", () => {
    expect(
      agentSourceReference({
        type: "source",
        sourceType: "url",
        id: "source-1",
        url: "https://example.com/report",
        title: "Report",
      }),
    ).toEqual({
      id: "source-1",
      reference: {
        title: "Report",
        type: "web",
        url: "https://example.com/report",
        site: "example.com",
      },
    });
    expect(
      agentSourceReference({
        type: "source",
        sourceType: "url",
        id: "source-2",
        url: "not-a-url",
      }),
    ).toBeUndefined();
  });
});
