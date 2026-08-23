import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { migrateLegacyCredentials } from "@/security/credentials/legacyCredentialMigration";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("legacy credential migration", () => {
  test("is restart-safe across vault-write interruption and removes plaintext from SQLite", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "toonflow-migration-"));
    directories.push(directory);
    const databasePath = path.join(directory, "copied.sqlite");
    const database = knex({
      client: "sqlite3",
      connection: { filename: databasePath },
      useNullAsDefault: true,
    });
    await database.schema.createTable("o_vendorConfig", (table) => {
      table.string("id").primary();
      table.text("inputValues");
    });
    await database("o_vendorConfig").insert({
      id: "fal",
      inputValues: JSON.stringify({
        apiKey: "migration-canary-secret",
        baseUrl: "https://fal.run",
      }),
    });
    await runProviderPlatformMigrations(database);

    const vault = new MemoryCredentialVault();
    await expect(
      migrateLegacyCredentials(database, vault, [{ providerId: "fal", slots: ["apiKey"] }], {
        afterVaultWrite: () => {
          throw new Error("fault.after_vault_write");
        },
      }),
    ).rejects.toThrow("fault.after_vault_write");
    expect(
      JSON.parse((await database("o_vendorConfig").where({ id: "fal" }).first()).inputValues),
    ).toHaveProperty("apiKey", "migration-canary-secret");

    const result = await migrateLegacyCredentials(database, vault, [
      { providerId: "fal", slots: ["apiKey"] },
    ]);
    expect(result).toEqual({ migrated: 1, skipped: 0 });
    expect(await vault.get({ providerId: "fal", slot: "apiKey" })).toBe("migration-canary-secret");
    expect(
      JSON.parse((await database("o_vendorConfig").where({ id: "fal" }).first()).inputValues),
    ).toEqual({ baseUrl: "https://fal.run" });
    expect(
      await database("o_provider_credential_refs")
        .where({ provider_id: "fal", slot: "apiKey" })
        .first(),
    ).toMatchObject({ source: "vault" });

    await database.destroy();
    expect((await readFile(databasePath)).includes(Buffer.from("migration-canary-secret"))).toBe(
      false,
    );
  });
});
