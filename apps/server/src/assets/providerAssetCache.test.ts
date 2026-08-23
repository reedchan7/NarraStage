import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { ProviderAssetCache } from "@/assets/providerAssetCache";
import { runProviderPlatformMigrations } from "@/lib/migrations";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("provider asset reuse is scoped by provider, credential version, hash, and expiry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-provider-assets-"));
  directories.push(directory);
  const database = knex({
    client: "sqlite3",
    connection: { filename: path.join(directory, "cache.sqlite") },
    useNullAsDefault: true,
  });
  await runProviderPlatformMigrations(database);
  const cache = new ProviderAssetCache(database);
  await cache.put({
    providerId: "google",
    credentialScope: "apiKey:v2",
    assetSha256: "a".repeat(64),
    providerAssetId: "files/123",
    expiresAt: 2_000,
  });
  expect(
    await cache.get({
      providerId: "google",
      credentialScope: "apiKey:v2",
      assetSha256: "a".repeat(64),
      now: 1_000,
      minimumRemainingTtlMs: 500,
    }),
  ).toMatchObject({ providerAssetId: "files/123" });
  expect(
    await cache.get({
      providerId: "google",
      credentialScope: "apiKey:v1",
      assetSha256: "a".repeat(64),
      now: 1_000,
    }),
  ).toBeUndefined();
  expect(await cache.invalidateExpired(2_000)).toBe(1);
  await database.destroy();
});
