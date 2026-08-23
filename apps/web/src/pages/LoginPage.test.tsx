import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { LoginPage } from "@/pages/LoginPage";

describe("login surface", () => {
  test("is keyboard operable and exposes failed authentication", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 400, data: null, message: "登录失败" }), {
          status: 400,
        }),
      ),
    ) as typeof fetch;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("用户名"), "reed");
    await user.type(screen.getByLabelText("密码"), "wrong");
    await user.click(screen.getByRole("button", { name: "进入工作台" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("登录失败");
  });
});
