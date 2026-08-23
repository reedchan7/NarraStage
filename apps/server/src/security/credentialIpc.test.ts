import { describe, expect, test } from "bun:test";
import {
  assertTrustedCredentialSender,
  credentialDeleteRequestSchema,
  credentialSetRequestSchema,
} from "@/security/credentialIpc";

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

  test("accepts only the packaged renderer or declared local development origin", () => {
    expect(() =>
      assertTrustedCredentialSender(
        "file:///Applications/ToonFlow/index.html",
        [],
        "/Applications/ToonFlow/index.html",
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
        "/Applications/ToonFlow/index.html",
      ),
    ).toThrow("credential.untrusted_renderer");
  });
});
