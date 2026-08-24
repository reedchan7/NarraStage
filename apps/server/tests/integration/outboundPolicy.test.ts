import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { AssetGateway, type OutboundResponse, type OutboundTransport } from "@/assets/assetGateway";
import type { ApprovedOutboundTarget, OutboundResolver } from "@/assets/outboundPolicy";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

function response(
  statusCode: number,
  headers: OutboundResponse["headers"],
  body: Uint8Array = new Uint8Array(),
): OutboundResponse {
  return {
    statusCode,
    headers,
    body: Readable.from([body]),
    dispose() {},
  };
}

class QueueTransport implements OutboundTransport {
  readonly targets: ApprovedOutboundTarget[] = [];
  readonly requestHeaders: Readonly<Record<string, string>>[] = [];
  readonly #responses: OutboundResponse[];

  constructor(responses: OutboundResponse[]) {
    this.#responses = responses;
  }

  async open(
    target: ApprovedOutboundTarget,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<OutboundResponse> {
    this.targets.push(target);
    this.requestHeaders.push(headers);
    const next = this.#responses.shift();
    if (!next) throw new Error("test.transport_exhausted");
    return next;
  }
}

const publicResolver: OutboundResolver = async () => [{ address: "8.8.8.8", family: 4 }];

describe("secure provider asset import", () => {
  test("imports a decoded response into content-addressed owned storage", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "narrastage-assets-"));
    directories.push(rootDirectory);
    const payload = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const transport = new QueueTransport([
      response(200, { "content-type": "image/png", "content-encoding": "gzip" }, gzipSync(payload)),
    ]);
    const gateway = new AssetGateway({ rootDirectory, resolver: publicResolver, transport });
    const asset = await gateway.import({
      url: "https://cdn.example/output.png?temporary-secret=signed",
      allowedMimePrefixes: ["image/"],
    });
    expect(asset).toMatchObject({
      assetId: `sha256:${asset.sha256}`,
      mimeType: "image/png",
      bytes: payload.byteLength,
      sourceOrigin: "https://cdn.example",
    });
    expect(JSON.stringify(asset)).not.toContain("temporary-secret");
    expect(Buffer.from(await Bun.file(asset.path).arrayBuffer())).toEqual(payload);
  });

  test("revalidates every redirect and refuses private DNS before opening it", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "narrastage-assets-redirect-"));
    directories.push(rootDirectory);
    const transport = new QueueTransport([
      response(302, { location: "https://metadata.internal/latest" }),
    ]);
    const resolver: OutboundResolver = async (hostname) => [
      {
        address: hostname === "metadata.internal" ? "169.254.169.254" : "8.8.8.8",
        family: 4,
      },
    ];
    const gateway = new AssetGateway({ rootDirectory, resolver, transport });
    await expect(
      gateway.import({ url: "https://cdn.example/start", allowedMimePrefixes: ["image/"] }),
    ).rejects.toThrow("asset.address_not_public");
    expect(transport.targets).toHaveLength(1);
  });

  test("injects a referenced credential only for explicitly allowed origins and streams redirects", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "narrastage-assets-auth-"));
    directories.push(rootDirectory);
    const transport = new QueueTransport([
      response(302, { location: "https://storage.googleapis.com/generated/video.mp4" }),
      response(
        200,
        { "content-type": "video/mp4" },
        Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
      ),
    ]);
    const credentialVault = new MemoryCredentialVault();
    await credentialVault.set({ providerId: "google", slot: "apiKey" }, "google-secret");
    const gateway = new AssetGateway({
      rootDirectory,
      resolver: publicResolver,
      transport,
      credentialVault,
    });
    await gateway.import({
      url: "https://generativelanguage.googleapis.com/v1beta/files/video:download",
      allowedMimePrefixes: ["video/"],
      authorization: {
        credentialRef: { providerId: "google", slot: "apiKey" },
        headerName: "x-goog-api-key",
        allowedOrigins: ["https://generativelanguage.googleapis.com"],
      },
    });
    expect(transport.requestHeaders).toEqual([{ "x-goog-api-key": "google-secret" }, {}]);
    expect(transport.targets.map((target) => target.url.origin)).toEqual([
      "https://generativelanguage.googleapis.com",
      "https://storage.googleapis.com",
    ]);
  });

  test("limits decoded bytes and removes partial files after a compression bomb", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "narrastage-assets-bomb-"));
    directories.push(rootDirectory);
    const transport = new QueueTransport([
      response(
        200,
        { "content-type": "video/mp4", "content-encoding": "gzip" },
        gzipSync(Buffer.alloc(64 * 1024, 1)),
      ),
    ]);
    const gateway = new AssetGateway({
      rootDirectory,
      resolver: publicResolver,
      transport,
      maximumCompressedBytes: 4 * 1024,
      maximumDecodedBytes: 1024,
    });
    await expect(
      gateway.import({ url: "https://cdn.example/bomb", allowedMimePrefixes: ["video/"] }),
    ).rejects.toThrow("asset.byte_limit_exceeded");
    expect(await readdir(rootDirectory)).toEqual([]);
  });

  test("blocks loopback literals before the network transport", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "narrastage-assets-loopback-"));
    directories.push(rootDirectory);
    const transport = new QueueTransport([]);
    const gateway = new AssetGateway({
      rootDirectory,
      transport,
      allowedSchemes: ["http:"],
    });
    await expect(
      gateway.import({ url: "http://127.0.0.1/private", allowedMimePrefixes: ["image/"] }),
    ).rejects.toThrow("asset.address_not_public");
    expect(transport.targets).toHaveLength(0);
  });
});
