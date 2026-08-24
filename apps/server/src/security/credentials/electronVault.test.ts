import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, open, readFile, rename, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ElectronCredentialVault } from "@/security/credentials/electronVault";

const directories: string[] = [];
const ref = { providerId: "deepseek", slot: "apiKey" } as const;
const codec = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8").replace(/^encrypted:/, ""),
};

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Electron credential vault", () => {
  test("persists only encrypted values with owner-only permissions and survives reload", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const filePath = path.join(directory, "credentials.v1.json");
    const vault = new ElectronCredentialVault(filePath, codec);

    await vault.set(ref, "electron-canary-secret");
    const raw = await readFile(filePath, "utf8");
    expect(raw).not.toContain("electron-canary-secret");
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);

    const reloaded = new ElectronCredentialVault(filePath, codec);
    expect(await reloaded.get(ref)).toBe("electron-canary-secret");
    expect(await reloaded.status(ref)).toMatchObject({
      configured: true,
      source: "electron_safe_storage",
      writable: true,
    });
  });

  test("fails closed before touching disk when OS encryption is unavailable", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const vault = new ElectronCredentialVault(path.join(directory, "credentials.v1.json"), {
      ...codec,
      isEncryptionAvailable: () => false,
    });

    await expect(vault.set(ref, "must-not-persist")).rejects.toThrow(
      "credential.safe_storage_unavailable",
    );
  });

  test("rejects Electron's unprotected Linux basic_text backend", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const vault = new ElectronCredentialVault(
      path.join(directory, "credentials.v1.json"),
      {
        ...codec,
        getSelectedStorageBackend: () => "basic_text",
      },
      "linux",
    );

    await expect(vault.set(ref, "must-not-persist")).rejects.toThrow(
      "credential.safe_storage_unprotected",
    );
  });

  test("persists the temporary directory entry before moving the primary to backup", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const filePath = path.join(directory, "credentials.v1.json");
    const events: string[] = [];
    const vault = new ElectronCredentialVault(filePath, codec, process.platform, {
      async rename(from, to) {
        events.push(`rename:${path.basename(from)}:${path.basename(to)}`);
        await rename(from, to);
      },
      async syncDirectory(directoryPath) {
        events.push("sync-directory");
        if (process.platform === "win32") return;
        const handle = await open(directoryPath, "r");
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      },
    });
    await vault.set(ref, "old-secret");
    events.length = 0;

    await vault.set(ref, "new-secret");

    const firstDirectorySync = events.indexOf("sync-directory");
    const primaryBackupRename = events.findIndex((event) =>
      event.endsWith("credentials.v1.json:credentials.v1.json.bak"),
    );
    expect(firstDirectorySync).toBeGreaterThanOrEqual(0);
    expect(primaryBackupRename).toBeGreaterThan(firstDirectorySync);
  });

  test("does not expose a rejected mutation when the first directory sync fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const filePath = path.join(directory, "credentials.v1.json");
    const vault = new ElectronCredentialVault(filePath, codec, process.platform, {
      async syncDirectory() {
        throw new Error("injected-dir-sync-failure");
      },
    });

    await expect(vault.set(ref, "must-not-be-visible")).rejects.toThrow(
      "credential.vault_write_failed",
    );

    const reloaded = new ElectronCredentialVault(filePath, codec);
    expect(await reloaded.get(ref)).toBeUndefined();
  });

  test("recovers the highest revision after a crash between backup and primary renames", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const filePath = path.join(directory, "credentials.v1.json");
    await Bun.write(
      `${filePath}.bak`,
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        records: {
          "deepseek:apiKey": {
            ciphertext: Buffer.from("encrypted:old-secret").toString("base64"),
            updatedAt: "2026-08-23T00:00:00.000Z",
          },
        },
      }),
    );
    await Bun.write(
      `${filePath}.tmp-123-crash`,
      JSON.stringify({
        schemaVersion: 1,
        revision: 2,
        records: {
          "deepseek:apiKey": {
            ciphertext: Buffer.from("encrypted:new-secret").toString("base64"),
            updatedAt: "2026-08-23T00:01:00.000Z",
          },
        },
      }),
    );

    const recovered = new ElectronCredentialVault(filePath, codec);
    expect(await recovered.get(ref)).toBe("new-secret");
  });

  test("does not resurrect a deleted secret from an older backup", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "narrastage-vault-"));
    directories.push(directory);
    const filePath = path.join(directory, "credentials.v1.json");
    await Bun.write(
      `${filePath}.bak`,
      JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        records: {
          "deepseek:apiKey": {
            ciphertext: Buffer.from("encrypted:deleted-secret").toString("base64"),
            updatedAt: "2026-08-23T00:00:00.000Z",
          },
        },
      }),
    );
    await Bun.write(
      `${filePath}.tmp-123-delete-crash`,
      JSON.stringify({ schemaVersion: 1, revision: 5, records: {} }),
    );

    const recovered = new ElectronCredentialVault(filePath, codec);
    expect(await recovered.get(ref)).toBeUndefined();
  });
});
