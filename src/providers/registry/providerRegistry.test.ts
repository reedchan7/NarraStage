import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { defineProviderAdapter, type VideoGeneratePort } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";

describe("provider registry", () => {
  test("registers a video-only provider without empty modality ports", () => {
    const video: VideoGeneratePort = {
      operation: "video.generate",
      async start() {
        return {
          providerHandle: "fixture-handle",
          providerOutcome: "queued",
        };
      },
    };
    const adapter = defineProviderAdapter({
      providerId: "fixture-video",
      ports: [video],
    });
    const registry = new ProviderRegistry();

    registry.register(adapter);

    expect(registry.getPort("fixture-video", "video.generate")).toBe(video);
    expect(registry.getPort("fixture-video", "language.generate")).toBeUndefined();
  });

  test("keeps provider identities out of registry and policy decisions", async () => {
    const sources = await Promise.all(
      [
        new URL("./providerRegistry.ts", import.meta.url),
        new URL("../policy/offeringPolicy.ts", import.meta.url),
      ].map((path) => readFile(path, "utf8")),
    );

    expect(sources.join("\n")).not.toMatch(/\b(deepseek|minimax|fal|google)\b/i);
  });
});
