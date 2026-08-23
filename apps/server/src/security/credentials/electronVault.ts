import { chmod, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  assertCredentialValue,
  credentialRefKey,
  type CredentialRef,
  type CredentialStatus,
  type CredentialVault,
} from "@/security/credentials/types";

export interface SafeStorageCodec {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ElectronVaultPersistenceOperations {
  rename(from: string, to: string): Promise<void>;
  syncDirectory(directory: string): Promise<void>;
}

const vaultFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    records: z.record(
      z.string(),
      z
        .object({
          ciphertext: z.string().min(1),
          updatedAt: z.string().datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict();

type VaultFile = z.infer<typeof vaultFileSchema>;

function emptyVault(): VaultFile {
  return { schemaVersion: 1, revision: 0, records: {} };
}

async function unlinkIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export class ElectronCredentialVault implements CredentialVault {
  private writeChain: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly codec: SafeStorageCodec;
  private readonly platform: NodeJS.Platform;
  private readonly persistenceOperations: Partial<ElectronVaultPersistenceOperations>;

  constructor(
    filePath: string,
    codec: SafeStorageCodec,
    platform: NodeJS.Platform = process.platform,
    persistenceOperations: Partial<ElectronVaultPersistenceOperations> = {},
  ) {
    this.filePath = filePath;
    this.codec = codec;
    this.platform = platform;
    this.persistenceOperations = persistenceOperations;
  }

  private assertAvailable(): void {
    if (!this.codec.isEncryptionAvailable()) {
      throw new Error("credential.safe_storage_unavailable");
    }
    if (
      this.platform === "linux" &&
      (this.codec.getSelectedStorageBackend?.() ?? "basic_text") === "basic_text"
    ) {
      throw new Error("credential.safe_storage_unprotected");
    }
  }

  private async readCandidate(filePath: string): Promise<VaultFile | undefined> {
    try {
      return vaultFileSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("credential.vault_corrupt", { cause: error });
    }
  }

  private async readVault(): Promise<VaultFile> {
    const directory = path.dirname(this.filePath);
    const temporaryPrefix = `${path.basename(this.filePath)}.tmp-`;
    const temporaryCandidates = await readdir(directory)
      .then((entries) =>
        entries
          .filter((entry) => entry.startsWith(temporaryPrefix))
          .map((entry) => path.join(directory, entry)),
      )
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    const candidates = [this.filePath, `${this.filePath}.bak`, ...temporaryCandidates];
    const valid: VaultFile[] = [];
    let corrupt = false;
    for (const candidate of candidates) {
      try {
        const value = await this.readCandidate(candidate);
        if (value) valid.push(value);
      } catch (error) {
        if ((error as Error).message !== "credential.vault_corrupt") throw error;
        corrupt = true;
      }
    }
    valid.sort((left, right) => right.revision - left.revision);
    if (valid[0]) return valid[0];
    if (corrupt) throw new Error("credential.vault_corrupt");
    return emptyVault();
  }

  private async syncDirectory(directory: string): Promise<void> {
    if (this.persistenceOperations.syncDirectory) {
      await this.persistenceOperations.syncDirectory(directory);
      return;
    }
    if (this.platform === "win32") return;
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private rename(from: string, to: string): Promise<void> {
    return (this.persistenceOperations.rename ?? rename)(from, to);
  }

  private async persist(vault: VaultFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    const backupPath = `${this.filePath}.bak`;
    const file = await open(temporaryPath, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(vault)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    try {
      await this.syncDirectory(directory);
    } catch (error) {
      await unlinkIfPresent(temporaryPath);
      throw new Error("credential.vault_write_failed", { cause: error });
    }
    await unlinkIfPresent(backupPath);
    try {
      await this.rename(this.filePath, backupPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        await unlinkIfPresent(temporaryPath);
        throw error;
      }
    }
    try {
      await this.rename(temporaryPath, this.filePath);
      await chmod(this.filePath, 0o600);
      await this.syncDirectory(directory);
      await unlinkIfPresent(backupPath);
      await this.syncDirectory(directory);
    } catch (error) {
      try {
        await this.rename(backupPath, this.filePath);
      } catch {}
      await unlinkIfPresent(temporaryPath);
      throw new Error("credential.vault_write_failed", { cause: error });
    }
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(action, action);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async get(ref: CredentialRef): Promise<string | undefined> {
    this.assertAvailable();
    const record = (await this.readVault()).records[credentialRefKey(ref)];
    return record ? this.codec.decryptString(Buffer.from(record.ciphertext, "base64")) : undefined;
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    this.assertAvailable();
    assertCredentialValue(value);
    await this.enqueue(async () => {
      const vault = await this.readVault();
      vault.records[credentialRefKey(ref)] = {
        ciphertext: this.codec.encryptString(value).toString("base64"),
        updatedAt: new Date().toISOString(),
      };
      vault.revision += 1;
      await this.persist(vault);
    });
  }

  async delete(ref: CredentialRef): Promise<void> {
    this.assertAvailable();
    await this.enqueue(async () => {
      const vault = await this.readVault();
      if (!vault.records[credentialRefKey(ref)]) return;
      delete vault.records[credentialRefKey(ref)];
      vault.revision += 1;
      await this.persist(vault);
    });
  }

  async status(ref: CredentialRef): Promise<CredentialStatus> {
    this.assertAvailable();
    const record = (await this.readVault()).records[credentialRefKey(ref)];
    return record
      ? {
          configured: true,
          source: "electron_safe_storage",
          writable: true,
          updatedAt: record.updatedAt,
        }
      : { configured: false, source: "none", writable: true };
  }
}
