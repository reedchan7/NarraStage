import { describe, expect, test } from "bun:test";
import { approveOutboundUrl, isPublicAddress } from "@/assets/outboundPolicy";

describe("outbound asset policy", () => {
  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  test.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  test("rejects a hostname if any DNS answer is private", async () => {
    await expect(
      approveOutboundUrl("https://provider.example/output", {
        resolver: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      }),
    ).rejects.toThrow("asset.address_not_public");
  });

  test("allows only declared schemes and strips URL credential attacks", async () => {
    const resolver = async () => [{ address: "8.8.8.8", family: 4 as const }];
    await expect(approveOutboundUrl("http://provider.example/a", { resolver })).rejects.toThrow(
      "asset.scheme_not_allowed",
    );
    await expect(
      approveOutboundUrl("https://token@provider.example/a", { resolver }),
    ).rejects.toThrow("asset.url_credentials_not_allowed");
  });
});
