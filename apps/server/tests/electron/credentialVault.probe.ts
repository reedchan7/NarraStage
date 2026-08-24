import { app, safeStorage } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ElectronCredentialVault } from "@/security/credentials/electronVault";

async function run(): Promise<void> {
  const probeDirectory = process.env.NARRASTAGE_ELECTRON_VAULT_PROBE_DIR;
  if (
    !probeDirectory ||
    !path.isAbsolute(probeDirectory) ||
    !path.basename(path.dirname(probeDirectory)).startsWith("narrastage-electron-vault-probe.")
  ) {
    throw new Error("credential.probe_temp_directory_required");
  }
  await app.whenReady();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("credential.safe_storage_unavailable");
  }

  const vaultPath = path.join(probeDirectory, "credentials.v1.json");
  const vault = new ElectronCredentialVault(vaultPath, safeStorage);
  const ref = { providerId: "fal", slot: "apiKey" } as const;
  const canary = `electron-probe-${crypto.randomUUID()}`;
  await vault.set(ref, canary);
  if ((await vault.get(ref)) !== canary) throw new Error("credential.probe_round_trip_failed");
  if ((await readFile(vaultPath, "utf8")).includes(canary)) {
    throw new Error("credential.probe_plaintext_detected");
  }
  await vault.delete(ref);
  const status = await vault.status(ref);
  if (status.configured) throw new Error("credential.probe_delete_failed");
  console.log(
    JSON.stringify({ safeStorage: true, roundTrip: true, plaintext: false, deleted: true }),
  );
}

run()
  .then(() => app.quit())
  .catch((error) => {
    console.error((error as Error).message);
    app.exit(1);
  });
