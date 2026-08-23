import { describe, expect, test } from "bun:test";
import { isRouteEntry } from "@/core";

describe("route generation", () => {
  test("excludes colocated tests from production routing", () => {
    expect(isRouteEntry("apps/server/src/routes/v2/providers.ts")).toBe(true);
    expect(isRouteEntry("apps/server/src/routes/v2/providers.test.ts")).toBe(false);
    expect(isRouteEntry("apps/server/src/routes/v2/providers.spec.ts")).toBe(false);
  });
});
