import { describe, expect, test } from "bun:test";
import {
  applyCredentialSet,
  assertTrustedCredentialSender,
  credentialDeleteRequestSchema,
  credentialSetRequestSchema,
} from "@/security/credentialIpc";
import { MemoryCredentialVault } from "@/security/credentials/memoryVault";
import { credentialRefSchema } from "@/security/credentials/types";

describe("credential IPC boundary", () => {
  test("uses strict schemas that reject spoofed fields and empty secrets", () => {
    expect(
      credentialSetRequestSchema.safeParse({
        providerId: "fal",
        slot: "apiKey",
        value: "",
      }).success,
    ).toBe(false);
    expect(
      credentialDeleteRequestSchema.safeParse({
        providerId: "fal",
        slot: "apiKey",
        value: "smuggled-secret",
      }).success,
    ).toBe(false);
  });

  test("stores a secret then returns status without revalidating the secret field", async () => {
    const vault = new MemoryCredentialVault();
    const request = {
      providerId: "deepseek",
      slot: "apiKey",
      value: "sk-live-canary",
    };
    const parsed = credentialSetRequestSchema.parse(request);
    expect(credentialRefSchema.safeParse(parsed).success).toBe(false);
    await expect(vault.status(parsed)).rejects.toMatchObject({
      issues: [{ code: "unrecognized_keys", keys: ["value"] }],
    });

    const status = await applyCredentialSet(vault, request);
    expect(status).toMatchObject({ configured: true, source: "memory", writable: true });
    expect(JSON.stringify(status)).not.toContain("sk-live-canary");
    expect(await vault.get({ providerId: "deepseek", slot: "apiKey" })).toBe("sk-live-canary");
  });

  test("accepts only the packaged renderer or declared local development origin", () => {
    expect(() =>
      assertTrustedCredentialSender(
        "file:///Applications/NarraStage/index.html",
        [],
        "/Applications/NarraStage/index.html",
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedCredentialSender("http://localhost:50188/settings", ["http://localhost:50188"]),
    ).not.toThrow();
    expect(() => assertTrustedCredentialSender("https://attacker.example/settings")).toThrow(
      "credential.untrusted_renderer",
    );
    expect(() =>
      assertTrustedCredentialSender(
        "file:///tmp/attacker.html",
        [],
        "/Applications/NarraStage/index.html",
      ),
    ).toThrow("credential.untrusted_renderer");
  });
});
