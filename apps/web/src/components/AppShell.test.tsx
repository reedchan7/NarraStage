import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { AppearanceSync } from "@/state/appearance";
import { usePreferences } from "@/state/preferences";
import { useSession } from "@/state/session";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener(_type: string, listener: EventListener) {
      listeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    removeEventListener(_type: string, listener: EventListener) {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
    onchange: null,
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => media,
  });
  return media;
}

function renderShell() {
  useSession.setState({
    session: { token: "t", name: "admin", id: 1, role: "admin" },
  });
  return render(
    <MemoryRouter>
      <AppearanceSync />
      <AppShell>
        <div>workspace</div>
      </AppShell>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  usePreferences.setState({ locale: "zh-CN", theme: "dark" });
  useSession.setState({ session: null });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  vi.unstubAllGlobals();
});

describe("AppShell appearance", () => {
  test("exposes light, dark, and auto theme choices", () => {
    renderShell();
    expect(screen.getByRole("radiogroup", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "深色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "自动" })).toBeInTheDocument();
  });

  test("switching to light writes the preference and document theme", async () => {
    stubMatchMedia(true);
    renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "浅色" }));
    expect(usePreferences.getState().theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("auto follows a dark operating system", async () => {
    stubMatchMedia(true);
    renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "自动" }));
    expect(usePreferences.getState().theme).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  test("arrow keys move between native theme radios", async () => {
    renderShell();
    const user = userEvent.setup();
    const dark = screen.getByRole("radio", { name: "深色" });
    dark.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "自动" })).toHaveFocus();
    expect(usePreferences.getState().theme).toBe("system");
  });
});
