import { describe, expect, test } from "bun:test";
import {
  sanitizeLegacyVendorInputResponse,
  validateLegacyVendorInputUpdate,
} from "@/security/credentials/legacyInputPolicy";

const inputs = [
  { key: "apiKey", type: "password" as const },
  { key: "baseUrl", type: "url" as const },
];

describe("legacy vendor credential boundary", () => {
  test("redacts password values from REST and rejects secret writes", () => {
    expect(
      sanitizeLegacyVendorInputResponse(inputs, {
        apiKey: "legacy-canary",
        baseUrl: "https://api.example",
      }),
    ).toEqual({ apiKey: "", baseUrl: "https://api.example" });
    expect(() =>
      validateLegacyVendorInputUpdate(inputs, {
        apiKey: "legacy-canary",
        baseUrl: "https://api.example",
      }),
    ).toThrow("credential.rest_write_forbidden");
    expect(
      validateLegacyVendorInputUpdate(inputs, {
        apiKey: "",
        baseUrl: "https://api.example",
      }),
    ).toEqual({ baseUrl: "https://api.example" });
  });
});
