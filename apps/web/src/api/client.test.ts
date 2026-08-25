import { afterEach, describe, expect, test, vi } from "vitest";
import contractSource from "@narrastage/contracts/source";
import { api, ApiError, contractRangeIncludes } from "@/api/client";

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

  test("pings a stored provider without sending the secret over HTTP", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 200,
            message: "ok",
            data: {
              schemaVersion: "2.0.0",
              providerId: "deepseek",
              health: "healthy",
              offerings: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(api.healthCheck("Bearer signed", "deepseek")).resolves.toMatchObject({
      providerId: "deepseek",
      health: "healthy",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v2/providers/deepseek/health-check");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toContain("sk-");
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toContain("apiKey");
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

  test("reads and writes simple-mode agent model bindings over the setting contract", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("getAgentDeploy")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 200,
              message: "ok",
              data: {
                qrdinaryData: [
                  {
                    id: 1,
                    key: "scriptAgent",
                    name: "剧本Agent",
                    desc: "决策",
                    model: "",
                    modelName: "",
                    vendorId: null,
                    disabled: 0,
                  },
                ],
                advancedData: [],
              },
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ code: 200, message: "配置成功", data: "配置成功" })),
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(api.agentDeploy("Bearer signed")).resolves.toMatchObject({
      qrdinaryData: [{ key: "scriptAgent", modelName: "" }],
    });
    await expect(
      api.updateAgentModel("Bearer signed", {
        id: 1,
        name: "剧本Agent",
        desc: "决策",
        model: "DeepSeek V4 Flash",
        modelName: "deepseek:v4-flash:official",
        vendorId: "deepseek",
      }),
    ).resolves.toBe("配置成功");
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/setting/agentDeploy/getAgentDeploy",
      "/api/setting/agentDeploy/updateAgentModel",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      id: 1,
      modelName: "deepseek:v4-flash:official",
      vendorId: "deepseek",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  test("uses the server-owned scriptAgent memory contract for history and clearing", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ code: 200, data: [], message: "成功" }))),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await api.conversationHistory("Bearer signed", 42);
    await api.clearConversation("Bearer signed", 42);

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/agents/getMemory",
      "/api/agents/clearMemory",
    ]);
    expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(String(request?.body)))).toEqual([
      { projectId: 42, agentType: "scriptAgent" },
      { projectId: 42, agentType: "scriptAgent", type: "all" },
    ]);
  });

  test("accepts only versions inside the generated client contract range", () => {
    expect(contractRangeIncludes("^2.3.4", "2.3.4")).toBe(true);
    expect(contractRangeIncludes("^2.3.4", "2.9.0")).toBe(true);
    expect(contractRangeIncludes("^2.3.4", "3.0.0")).toBe(false);
    expect(contractRangeIncludes("^0.3.4", "0.4.0")).toBe(false);
    expect(contractRangeIncludes("2.3.4", "2.3.4")).toBe(false);
  });

  test("checks server compatibility before submitting a paid generation job", async () => {
    const job = {
      id: "job-1",
      schemaVersion: "2.0.0",
      idempotencyKey: "web-image.generate-00000001",
      canonicalModelId: "fixture:image-v1",
      offeringId: "fixture:image",
      providerId: "fixture",
      operation: "image.generate",
      input: { values: { prompt: "moon harbor" }, assets: [] },
      state: "queued",
      nextRunAt: 0,
      pollAttemptCount: 0,
      version: 1,
      createdAt: 0,
      updatedAt: 0,
      requiresReconciliation: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contractVersion: contractSource.contractVersion,
            openapiSha256: contractSource.openapiSha256,
            backendRevision: "fixture-backend",
            webRevision: "fixture-web",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: job, message: "任务已接受" }), {
          status: 202,
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      api.submitJob("Bearer signed", {
        schemaVersion: "2.0.0",
        idempotencyKey: job.idempotencyKey,
        canonicalModelId: job.canonicalModelId,
        offeringId: job.offeringId,
        operation: "image.generate",
        input: job.input,
      }),
    ).resolves.toEqual(job);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/meta", "/api/v2/jobs"]);
  });

  test("rejects an incompatible server before the paid endpoint is called", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            contractVersion: "3.0.0",
            openapiSha256: "0".repeat(64),
            backendRevision: "future-backend",
            webRevision: "future-web",
          }),
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      api.submitJob("Bearer signed", {
        schemaVersion: "2.0.0",
        idempotencyKey: "web-image.generate-00000001",
        canonicalModelId: "fixture:image-v1",
        offeringId: "fixture:image",
        operation: "image.generate",
        input: { values: { prompt: "moon harbor" }, assets: [] },
      }),
    ).rejects.toEqual(new ApiError("客户端 API 契约与服务端不兼容，请更新 NarraStage 客户端", 426));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/meta");
  });
});
