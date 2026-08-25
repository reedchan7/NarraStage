import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { useSession } from "@/state/session";

const providerPayload = {
  schemaVersion: "2.0.0",
  providers: [
    {
      providerId: "deepseek",
      health: "unknown",
      slots: [
        {
          slot: "apiKey",
          configured: false,
          source: "none",
          writable: true,
        },
      ],
    },
  ],
};

const catalogPayload = {
  schemaVersion: "2.0.0",
  providers: [],
  models: [
    {
      id: "deepseek:v4-flash",
      owner: "deepseek",
      family: "v4",
      name: "DeepSeek V4 Flash",
      lifecycle: "stable",
    },
  ],
  priceSnapshots: [],
  offerings: [
    {
      id: "deepseek:v4-flash:official",
      canonicalModelId: "deepseek:v4-flash",
      providerId: "deepseek",
      providerModelId: "deepseek-v4-flash",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        { operation: "language.generate", capabilitySchemaId: "language:v1", enabled: true },
      ],
      support: { implementation: "implemented", evidence: ["implemented"] },
    },
  ],
  capabilitySchemas: [],
  availability: [],
};

const agentDeployPayload = {
  qrdinaryData: [
    {
      id: 1,
      key: "scriptAgent",
      name: "剧本Agent",
      desc: "用于读取原文生成故事骨架",
      model: "",
      modelName: "",
      vendorId: null,
      disabled: 0,
    },
    {
      id: 4,
      key: "ttsDubbing",
      name: "TTS配音",
      desc: "配音",
      model: "",
      modelName: "",
      vendorId: null,
      disabled: 1,
    },
  ],
  advancedData: [],
};

function envelope(data: unknown) {
  return { code: 200, message: "ok", data };
}

function renderProviders() {
  useSession.setState({
    session: { token: "Bearer signed", name: "reed", id: 1, role: "admin" },
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProvidersPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  useSession.setState({ session: null });
  window.localStorage.clear();
  delete window.narrastageCredentials;
  vi.restoreAllMocks();
});

describe("providers credentials surface", () => {
  test("saves through the desktop bridge, reveals the typed secret, and pings the platform", async () => {
    const set = vi.fn(async () => ({
      configured: true,
      source: "electron_safe_storage" as const,
      writable: true,
    }));
    window.narrastageCredentials = {
      status: vi.fn(),
      set,
      delete: vi.fn(),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/health-check")) {
        return new Response(
          JSON.stringify(
            envelope({
              schemaVersion: "2.0.0",
              providerId: "deepseek",
              health: "healthy",
              offerings: [],
            }),
          ),
          { status: 200 },
        );
      }
      if (path.includes("/api/v2/catalog")) {
        return new Response(JSON.stringify(envelope(catalogPayload)), { status: 200 });
      }
      if (path.includes("/api/setting/agentDeploy/getAgentDeploy")) {
        return new Response(JSON.stringify(envelope(agentDeployPayload)), { status: 200 });
      }
      if (path.includes("/api/setting/agentDeploy/updateAgentModel")) {
        return new Response(JSON.stringify(envelope("配置成功")), { status: 200 });
      }
      if (path.includes("/api/v2/providers")) {
        const configured = Boolean(init?.method === "POST" ? false : set.mock.calls.length > 0);
        return new Response(
          JSON.stringify(
            envelope({
              ...providerPayload,
              providers: [
                {
                  ...providerPayload.providers[0],
                  health: configured ? "healthy" : "unknown",
                  slots: [
                    {
                      slot: "apiKey",
                      configured,
                      source: configured ? "electron_safe_storage" : "none",
                      writable: true,
                    },
                  ],
                },
              ],
            }),
          ),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: 400, message: path, data: null }), {
        status: 400,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderProviders();
    const secret = await screen.findByLabelText("API 密钥");
    const user = userEvent.setup();
    await user.type(secret, "sk-live-canary");
    expect(secret).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "显示密钥" }));
    expect(secret).toHaveAttribute("type", "text");
    expect(secret).toHaveValue("sk-live-canary");
    await user.click(screen.getByRole("button", { name: "隐藏密钥" }));
    expect(secret).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(set).toHaveBeenCalledWith({
      providerId: "deepseek",
      slot: "apiKey",
      value: "sk-live-canary",
    });
    expect(secret).toHaveValue("");
    expect(secret).toHaveAttribute("type", "password");
    expect(await screen.findByText("可用")).toBeInTheDocument();
    const healthCheck = fetchMock.mock.calls.find(([path]) =>
      String(path).includes("/health-check"),
    );
    expect(healthCheck?.[0]).toBe("/api/v2/providers/deepseek/health-check");
    expect(healthCheck?.[1]).toMatchObject({ method: "POST" });
    expect(healthCheck?.[1]?.body).toBeUndefined();
    const headers = new Headers(healthCheck?.[1]?.headers);
    expect([...headers.values()].join(" ")).not.toContain("sk-live-canary");
  });

  test("assigns a language offering to the script agent through the deploy contract", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/v2/catalog")) {
        return new Response(JSON.stringify(envelope(catalogPayload)), { status: 200 });
      }
      if (path.includes("/api/setting/agentDeploy/getAgentDeploy")) {
        return new Response(JSON.stringify(envelope(agentDeployPayload)), { status: 200 });
      }
      if (path.includes("/api/setting/agentDeploy/updateAgentModel")) {
        return new Response(JSON.stringify(envelope("配置成功")), { status: 200 });
      }
      if (path.includes("/api/v2/providers")) {
        return new Response(JSON.stringify(envelope(providerPayload)), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 400, message: path, data: null }), {
        status: 400,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderProviders();
    const picker = await screen.findByLabelText("剧本Agent");
    expect(screen.queryByLabelText("TTS配音")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(picker, "deepseek:v4-flash:official");
    expect(picker).toHaveValue("deepseek:v4-flash:official");
    await vi.waitFor(() => {
      const update = fetchMock.mock.calls.find(([path]) =>
        String(path).includes("/api/setting/agentDeploy/updateAgentModel"),
      );
      expect(update?.[1]).toMatchObject({ method: "POST" });
      expect(JSON.parse(String(update?.[1]?.body))).toMatchObject({
        id: 1,
        modelName: "deepseek:v4-flash:official",
        vendorId: "deepseek",
      });
    });
  });
});
