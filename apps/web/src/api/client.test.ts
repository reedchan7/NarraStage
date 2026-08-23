import { afterEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "@/api/client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("typed API client", () => {
  test("attaches authentication and unwraps successful envelopes", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: 200, data: [{ id: 7, name: "Night Ferry" }], message: "ok" }),
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(api.projects("Bearer signed")).resolves.toEqual([{ id: 7, name: "Night Ferry" }]);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer signed");
  });

  test("keeps provider secrets off the HTTP surface", () => {
    expect(api).not.toHaveProperty("setCredential");
    expect(api).not.toHaveProperty("deleteCredential");
    expect(JSON.stringify(api)).not.toContain("apiKey");
  });

  test("preserves visible server failures", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 400, data: null, message: "用户名或密码错误" }), {
          status: 400,
        }),
      ),
    ) as typeof fetch;
    await expect(api.login("reed", "wrong")).rejects.toEqual(new ApiError("用户名或密码错误", 400));
  });
});
