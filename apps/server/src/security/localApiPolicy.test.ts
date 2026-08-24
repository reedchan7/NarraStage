import { describe, expect, test } from "bun:test";
import { resolveLocalApiPolicy } from "@/security/localApiPolicy";

describe("local API network policy", () => {
  test("binds desktop to loopback and accepts only built-in or development origins", () => {
    const policy = resolveLocalApiPolicy({ runtime: "desktop", nodeEnv: "prod", env: {} });

    expect(policy.host).toBe("127.0.0.1");
    expect(policy.isOriginAllowed(undefined)).toBe(true);
    expect(policy.isOriginAllowed("null")).toBe(true);
    expect(policy.isOriginAllowed("https://attacker.example")).toBe(false);
  });

  test("requires explicit origins before standalone binds beyond loopback", () => {
    expect(() =>
      resolveLocalApiPolicy({
        runtime: "standalone",
        nodeEnv: "prod",
        env: { NARRASTAGE_HOST: "0.0.0.0" },
      }),
    ).toThrow("local_api.allowed_origins_required");

    const policy = resolveLocalApiPolicy({
      runtime: "standalone",
      nodeEnv: "prod",
      env: {
        NARRASTAGE_HOST: "0.0.0.0",
        NARRASTAGE_ALLOWED_ORIGINS: "https://narrastage.example",
      },
    });
    expect(policy.isOriginAllowed("https://narrastage.example")).toBe(true);
    expect(policy.isOriginAllowed("https://attacker.example")).toBe(false);
  });

  test("accepts only the active same-port standalone renderer on loopback", () => {
    const policy = resolveLocalApiPolicy({ runtime: "standalone", nodeEnv: "prod", env: {} });

    expect(policy.isOriginAllowed("http://localhost:10588")).toBe(false);
    policy.registerListeningPort(10588);

    expect(policy.isOriginAllowed("http://localhost:10588")).toBe(true);
    expect(policy.isOriginAllowed("http://127.0.0.1:10588")).toBe(true);
    expect(policy.isOriginAllowed("http://localhost:50188")).toBe(false);
    expect(policy.isOriginAllowed("https://localhost:10588")).toBe(false);
    expect(policy.isOriginAllowed("https://attacker.example")).toBe(false);

    const developmentPolicy = resolveLocalApiPolicy({
      runtime: "standalone",
      nodeEnv: "dev",
      env: {},
    });
    expect(developmentPolicy.isOriginAllowed("http://localhost:50188")).toBe(true);
    expect(developmentPolicy.isOriginAllowed("https://attacker.example")).toBe(false);
  });
});
