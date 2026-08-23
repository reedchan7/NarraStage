import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { inspectMediaMetadata } from "@/assets/metadata";

describe("media metadata inspection", () => {
  test("reads dimensions from frozen PNG and JPEG fixtures", async () => {
    expect(inspectMediaMetadata(await readFile("docs/logo.png"))).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(inspectMediaMetadata(await readFile("docs/videoCover.jpg"))).toMatchObject({
      kind: "image",
      mimeType: "image/jpeg",
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });

  test("reads MP4 dimensions and movie duration without an external binary", async () => {
    const metadata = inspectMediaMetadata(await readFile("data/assets/ending.mp4"));
    expect(metadata).toMatchObject({
      kind: "video",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
    });
    expect(metadata?.durationSeconds).toBeGreaterThan(4.7);
    expect(metadata?.durationSeconds).toBeLessThan(4.9);
  });
});
