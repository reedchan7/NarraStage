import { afterEach, describe, expect, test } from "vitest";
import { applyTheme, resolveTheme } from "@/state/appearance";
import { usePreferences } from "@/state/preferences";

afterEach(() => {
  usePreferences.setState({ locale: "zh-CN", theme: "dark" });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("appearance", () => {
  test("resolves explicit light and dark without consulting the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("follows the operating system when the preference is auto", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("writes the resolved theme onto the document for CSS tokens", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  test("persists a theme choice in preferences", () => {
    usePreferences.getState().setTheme("system");
    expect(usePreferences.getState().theme).toBe("system");
    const stored = JSON.parse(String(window.localStorage.getItem("narrastage.preferences.v2")));
    expect(stored.state.theme).toBe("system");
  });
});
