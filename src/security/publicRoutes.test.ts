import { describe, expect, test } from "bun:test";
import { isPublicApiPath } from "@/security/publicRoutes";

describe("public API route policy", () => {
  test("allows only login and the read-only compatibility handshake", () => {
    expect(isPublicApiPath("/api/login/login", "POST")).toBe(true);
    expect(isPublicApiPath("/api/meta", "GET")).toBe(true);

    expect(isPublicApiPath("/api/meta", "POST")).toBe(false);
    expect(isPublicApiPath("/api/v2/catalog", "GET")).toBe(false);
    expect(isPublicApiPath("/api/v2/support", "GET")).toBe(false);
    expect(isPublicApiPath("/api/v2/preflight", "POST")).toBe(false);
    expect(isPublicApiPath("/api/meta/anything", "GET")).toBe(false);
  });
});
