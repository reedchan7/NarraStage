import { describe, expect, test } from "bun:test";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { buildProviderCredentialStatus } from "@/routes/v2/providers";

describe("provider credential status API", () => {
  test("returns slot metadata without credential values", async () => {
    const vault = new MemoryCredentialVault();
    await vault.set({ providerId: "fal", slot: "apiKey" }, "status-canary-secret");

    const result = await buildProviderCredentialStatus(vault);
    expect(
      result.providers.find((provider) => provider.providerId === "fal")?.slots[0],
    ).toMatchObject({ configured: true, source: "memory", writable: true });
    expect(result.providers.find((provider) => provider.providerId === "fal")?.health).toBe(
      "unknown",
    );
    expect(JSON.stringify(result)).not.toContain("status-canary-secret");
  });
});
