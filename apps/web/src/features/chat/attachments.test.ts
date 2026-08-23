import { describe, expect, it, vi } from "vitest";
import {
  chatAttachmentDisplayType,
  inlineChatAttachmentLimit,
  prepareChatAttachment,
  type AgentModelDetails,
  uploadChatProviderFile,
} from "./attachments";

const { axiosMock } = vi.hoisted(() => ({
  axiosMock: { put: vi.fn(), post: vi.fn() },
}));

vi.mock("@/utils/axios", () => ({ default: axiosMock }));

const target: AgentModelDetails = {
  canonicalModelId: "deepseek:v4-flash-vision-exp",
  offeringId: "deepseek:v4-flash-vision-exp:official",
  providerId: "deepseek",
  available: true,
  acceptsAttachments: true,
  acceptsImages: true,
  supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  supportsGrounding: false,
  filesUpload: true,
  maximumAttachments: 20,
  maximumAttachmentBytes: 64 * 1024 * 1024,
  lifecycle: "experimental",
};

describe("chat attachment transport", () => {
  it("keeps small images inline with explicit detail", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "pixel.png", {
      type: "image/png",
    });
    const upload = vi.fn();
    const attachment = await prepareChatAttachment(file, target, upload);
    expect(attachment).toMatchObject({
      filename: "pixel.png",
      mediaType: "image/png",
      byteLength: 4,
      detail: "auto",
      source: { type: "inline", byteLength: 4, dataBase64: "iVBORw==" },
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads large images once and retains only the provider reference", async () => {
    const file = new File([new Uint8Array(inlineChatAttachmentLimit + 1)], "large.webp", {
      type: "image/webp",
    });
    const upload = vi.fn(async () => ({
      type: "provider_file" as const,
      providerId: "deepseek",
      fileId: "file-123",
      expiresAt: "2026-08-24T00:00:00.000Z",
    }));
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const attachment = await prepareChatAttachment(file, target, upload);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(file, target);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(attachment.source).toEqual({
      type: "provider_file",
      providerId: "deepseek",
      fileId: "file-123",
      expiresAt: "2026-08-24T00:00:00.000Z",
    });
    expect(attachment).not.toHaveProperty("detail");
    expect(JSON.stringify(attachment)).not.toContain("AAAA");
  });

  it("fails closed for media outside the selected model contract", async () => {
    await expect(prepareChatAttachment(new File(["pdf"], "file.pdf", { type: "application/pdf" }), target)).rejects.toThrow(
      "chat.attachments.format_unsupported",
    );
    await expect(
      prepareChatAttachment(new File(["png"], "file.png", { type: "image/png" }), {
        ...target,
        acceptsAttachments: false,
        acceptsImages: false,
      }),
    ).rejects.toThrow("chat.attachments.model_not_supported");
  });

  it("streams large files into owned storage before creating a provider file", async () => {
    const file = new File([new Uint8Array(inlineChatAttachmentLimit + 1)], "reference.pdf", {
      type: "application/pdf",
    });
    axiosMock.put.mockResolvedValueOnce({
      data: { assetId: `sha256:${"a".repeat(64)}`, byteLength: file.size },
    });
    axiosMock.post.mockResolvedValueOnce({
      data: { providerId: "google", fileId: "files/provider-owned" },
    });

    await expect(
      uploadChatProviderFile(file, {
        ...target,
        canonicalModelId: "google:gemini-3.7-flash",
        offeringId: "google:gemini-3.7-flash:official",
        providerId: "google",
      }),
    ).resolves.toEqual({
      type: "provider_file",
      providerId: "google",
      fileId: "files/provider-owned",
    });
    expect(axiosMock.put).toHaveBeenCalledWith(
      "/v2/media-assets/upload",
      file,
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/octet-stream",
          "X-Toonflow-Media-Type": "application/pdf",
        }),
      }),
    );
    expect(axiosMock.post).toHaveBeenCalledWith(
      "/v2/files/upload",
      expect.objectContaining({
        input: {
          source: "owned_asset",
          assetId: `sha256:${"a".repeat(64)}`,
          filename: "reference.pdf",
        },
      }),
    );
  });

  it("accepts Gemini audio, video and PDF without image detail", async () => {
    const geminiTarget: AgentModelDetails = {
      ...target,
      canonicalModelId: "google:gemini-3.7-flash",
      offeringId: "google:gemini-3.7-flash:official",
      providerId: "google",
      supportedMediaTypes: ["image/png", "audio/mpeg", "video/mp4", "application/pdf"],
      supportsGrounding: true,
    };
    for (const [name, mediaType] of [
      ["audio.mp3", "audio/mpeg"],
      ["video.mp4", "video/mp4"],
      ["source.pdf", "application/pdf"],
    ] as const) {
      const attachment = await prepareChatAttachment(new File(["data"], name, { type: mediaType }), geminiTarget);
      expect(attachment.mediaType).toBe(mediaType);
      expect(attachment).not.toHaveProperty("detail");
      expect(chatAttachmentDisplayType(attachment.mediaType)).toBe(
        mediaType.startsWith("audio/") ? "audio" : mediaType.startsWith("video/") ? "video" : "pdf",
      );
    }
  });
});
