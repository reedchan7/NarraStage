import { useEffect, useState } from "react";
import { usePreferences, type ThemePreference } from "@/state/preferences";

export type { ThemePreference };
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES = [
  "light",
  "dark",
  "system",
] as const satisfies readonly ThemePreference[];

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function readSystemDark(
  media: { matches: boolean } = window.matchMedia("(prefers-color-scheme: dark)"),
): boolean {
  return media.matches;
}

export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (colorScheme) colorScheme.setAttribute("content", resolved);

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    const canvas = getComputedStyle(root).getPropertyValue("--canvas").trim();
    if (canvas) themeColor.setAttribute("content", canvas);
  }
}

export function useAppearance() {
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const [systemDark, setSystemDark] = useState(() => readSystemDark());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(theme, systemDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return { theme, setTheme, resolved };
}

export function AppearanceSync() {
  useAppearance();
  return null;
}
