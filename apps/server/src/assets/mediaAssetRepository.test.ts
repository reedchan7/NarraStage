import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { MediaAssetRepository, OwnedMediaAssetResolver } from "@/assets/mediaAssetRepository";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-media-assets-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "media.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  const repository = new MediaAssetRepository(database, path.join(directory, "content"));
  return { database, repository };
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);

describe("owned media asset repository", () => {
  test("deduplicates bytes while keeping ownership principal-scoped", async () => {
    const { database, repository } = await setup();
    const first = await repository.ingestOwnedBytes({
      bytes: png,
      declaredKind: "image",
      principalId: "user:one",
      projectId: 1,
      sourceKind: "storyboard",
      sourceId: "10",
    });
    const second = await repository.ingestOwnedBytes({
      bytes: png,
      declaredKind: "image",
      principalId: "user:two",
      projectId: 2,
      sourceKind: "storyboard",
      sourceId: "20",
    });

    expect(second.id).toBe(first.id);
    expect(await repository.getOwned(first.id, "user:one")).toMatchObject({
      mimeType: "image/png",
      kind: "image",
    });
    expect(await repository.getOwned(first.id, "user:three")).toBeUndefined();
    expect(
      await database("o_media_assets").count<{ count: number }>("id as count").first(),
    ).toMatchObject({ count: 1 });
    expect(
      await database("o_media_asset_owners").count<{ count: number }>("asset_id as count").first(),
    ).toMatchObject({ count: 2 });
    await database.destroy();
  });

  test("resolver fails closed without the exact principal and rejects spoofed media kind", async () => {
    const { database, repository } = await setup();
    const stored = await repository.ingestOwnedBytes({
      bytes: png,
      declaredKind: "image",
      principalId: "user:one",
      sourceKind: "assets",
    });
    const resolver = new OwnedMediaAssetResolver(repository);
    await expect(
      resolver.resolve({
        assetId: stored.id,
        kind: "image",
        role: "first_frame",
      }),
    ).rejects.toThrow("provider.asset_principal_required");
    await expect(
      resolver.resolve(
        { assetId: stored.id, kind: "video", role: "reference_video" },
        { principalId: "user:one" },
      ),
    ).rejects.toThrow("provider.asset_kind_mismatch");
    const resolved = await resolver.resolve(
      { assetId: stored.id, kind: "image", role: "first_frame" },
      { principalId: "user:one" },
    );
    expect(resolved).toMatchObject({
      assetId: stored.id,
      mimeType: "image/png",
      source: { kind: "blob" },
    });
    expect(resolved.source.kind === "blob" && (await resolved.source.blob.arrayBuffer())).toEqual(
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    );
    await database.destroy();
  });

  test("rejects declared kind that does not match file magic", async () => {
    const { database, repository } = await setup();
    await expect(
      repository.ingestOwnedBytes({
        bytes: png,
        declaredKind: "video",
        principalId: "user:one",
        sourceKind: "assets",
      }),
    ).rejects.toThrow("asset.kind_mismatch");
    await database.destroy();
  });

  test("streams provider files into owned storage without embedding bytes in JSON", async () => {
    const { database, repository } = await setup();
    const pdf = Buffer.from("%PDF-1.7\n%%EOF");
    const stored = await repository.ingestOwnedStream({
      stream: Readable.from([pdf.subarray(0, 5), pdf.subarray(5)]),
      declaredMediaType: "application/pdf",
      byteLength: pdf.byteLength,
      filename: "brief.pdf",
      principalId: "user:one",
    });
    expect(stored).toMatchObject({
      kind: "file",
      mimeType: "application/pdf",
      byteLength: pdf.byteLength,
      metadata: { filename: "brief.pdf" },
    });
    const resolved = await new OwnedMediaAssetResolver(repository).resolveFile(stored.id, {
      principalId: "user:one",
    });
    expect(resolved).toMatchObject({
      assetId: stored.id,
      filename: "brief.pdf",
      source: { kind: "path" },
    });
    await database.destroy();
  });

  test("accepts validated UTF-8 documents and rejects binary payloads declared as text", async () => {
    const { database, repository } = await setup();
    const markdown = Buffer.from("# Story brief\n\nA paper boat crosses the lake.\n", "utf8");
    const stored = await repository.ingestOwnedStream({
      stream: Readable.from([markdown.subarray(0, 9), markdown.subarray(9)]),
      declaredMediaType: "text/markdown",
      byteLength: markdown.byteLength,
      filename: "brief.md",
      principalId: "user:one",
    });
    expect(stored).toMatchObject({
      kind: "file",
      mimeType: "text/markdown",
      byteLength: markdown.byteLength,
    });
    await expect(
      repository.ingestOwnedStream({
        stream: Readable.from([Buffer.from([0xff, 0xfe, 0x00, 0x00])]),
        declaredMediaType: "text/plain",
        byteLength: 4,
        filename: "spoof.txt",
        principalId: "user:one",
      }),
    ).rejects.toThrow("asset.content_type_mismatch");
    await database.destroy();
  });

  test("removes partial streamed uploads when length or content type does not match", async () => {
    const { database, repository } = await setup();
    const pdf = Buffer.from("%PDF-1.7\n%%EOF");
    await expect(
      repository.ingestOwnedStream({
        stream: Readable.from([pdf]),
        declaredMediaType: "image/png",
        byteLength: pdf.byteLength,
        filename: "spoof.png",
        principalId: "user:one",
      }),
    ).rejects.toThrow("asset.content_type_mismatch");
    await expect(
      repository.ingestOwnedStream({
        stream: Readable.from([pdf]),
        declaredMediaType: "application/pdf",
        byteLength: pdf.byteLength + 1,
        filename: "truncated.pdf",
        principalId: "user:one",
      }),
    ).rejects.toThrow("asset.content_length_mismatch");
    expect(
      await database("o_media_assets").count<{ count: number }>("id as count").first(),
    ).toMatchObject({ count: 0 });
    await database.destroy();
  });
});
