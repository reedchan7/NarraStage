import { describe, expect, test } from "bun:test";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";

const ref = { providerId: "fal", slot: "apiKey" } as const;

describe("memory credential vault", () => {
  test("exposes status without ever serializing the secret", async () => {
    const vault = new MemoryCredentialVault();
    await vault.set(ref, "fal-canary-secret");

    expect(await vault.get(ref)).toBe("fal-canary-secret");
    const status = await vault.status(ref);
    expect(status).toMatchObject({ configured: true, source: "memory" });
    expect(JSON.stringify(status)).not.toContain("fal-canary-secret");

    await vault.delete(ref);
    expect(await vault.get(ref)).toBeUndefined();
    expect(await vault.status(ref)).toMatchObject({ configured: false, source: "none" });
  });
});
