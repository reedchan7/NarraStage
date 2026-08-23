import { describe, expect, test } from "bun:test";
import { EnvironmentCredentialVault } from "@/security/credentials/environmentVault";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { LayeredCredentialVault } from "@/security/credentials/runtime";

describe("runtime credential resolution", () => {
  test("gives environment credentials precedence and keeps writes out of the shadowed vault", async () => {
    const environment = new EnvironmentCredentialVault(
      { "fal:apiKey": ["FAL_KEY"] },
      { FAL_KEY: "environment-value" },
    );
    const persisted = new MemoryCredentialVault();
    const ref = { providerId: "fal", slot: "apiKey" } as const;
    await persisted.set(ref, "persisted-value");
    const vault = new LayeredCredentialVault(environment, persisted);

    expect(await vault.get(ref)).toBe("environment-value");
    expect(await vault.status(ref)).toEqual({
      configured: true,
      source: "environment",
      writable: false,
    });
    await expect(vault.set(ref, "replacement")).rejects.toThrow("credential.environment_override");
    expect(await persisted.get(ref)).toBe("persisted-value");
  });
});
