import { describe, expect, test } from "bun:test";
import { EnvironmentCredentialVault } from "@/security/credentials/environmentVault";

describe("environment credential vault", () => {
  test("resolves declared provider slots read-only without exposing values in status", async () => {
    const vault = new EnvironmentCredentialVault(
      { "fal:apiKey": ["FAL_KEY", "FAL_API_KEY"] },
      { FAL_KEY: "environment-canary" },
    );
    const ref = { providerId: "fal", slot: "apiKey" } as const;

    expect(await vault.get(ref)).toBe("environment-canary");
    expect(await vault.status(ref)).toEqual({
      configured: true,
      source: "environment",
      writable: false,
    });
    await expect(vault.set(ref, "replacement")).rejects.toThrow("credential.vault_read_only");
  });

  test("uses declared aliases in order", async () => {
    const vault = new EnvironmentCredentialVault(
      { "fal:apiKey": ["FAL_KEY", "FAL_API_KEY"] },
      { FAL_API_KEY: "alias-canary" },
    );
    expect(await vault.get({ providerId: "fal", slot: "apiKey" })).toBe("alias-canary");
  });
});
