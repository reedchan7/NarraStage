import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DesktopTitlebar } from "./DesktopTitlebar";

afterEach(() => {
  delete window.toonflowWindow;
});

describe("DesktopTitlebar", () => {
  test("exposes all frameless-window controls through the preload bridge", async () => {
    const minimize = vi.fn(async () => undefined);
    const toggleMaximize = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    window.toonflowWindow = { minimize, toggleMaximize, close };
    const user = userEvent.setup();

    render(<DesktopTitlebar />);
    await user.click(screen.getByRole("button", { name: "最小化窗口" }));
    await user.click(screen.getByRole("button", { name: "最大化或还原窗口" }));
    await user.click(screen.getByRole("button", { name: "关闭窗口" }));

    expect(minimize).toHaveBeenCalledOnce();
    expect(toggleMaximize).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
