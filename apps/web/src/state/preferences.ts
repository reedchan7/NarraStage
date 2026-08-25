import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/messages";

const currentLocales = new Set<string>([
  "zh-CN",
  "zh-TW",
  "en",
  "ja-JP",
  "ru-RU",
  "th-TH",
  "vi-VN",
]);

export type ThemePreference = "light" | "dark" | "system";

type PreferenceSnapshot = {
  locale: Locale;
  theme: ThemePreference;
};

interface PreferenceState extends PreferenceSnapshot {
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemePreference) => void;
}

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && currentLocales.has(value);
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function migrateLocale(locale: unknown): Locale {
  if (locale === "en-US") return "en";
  return isLocale(locale) ? locale : "zh-CN";
}

function snapshotFromUnknown(persistedState: unknown): PreferenceSnapshot {
  const state =
    persistedState && typeof persistedState === "object"
      ? (persistedState as Record<string, unknown>)
      : {};
  return {
    locale: migrateLocale(state.locale),
    theme: isThemePreference(state.theme) ? state.theme : "dark",
  };
}

export const usePreferences = create<PreferenceState>()(
  persist(
    (set) => ({
      locale: "zh-CN",
      theme: "dark",
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "narrastage.preferences.v2",
      version: 4,
      migrate: (persistedState) => snapshotFromUnknown(persistedState),
      partialize: (state): PreferenceSnapshot => ({
        locale: state.locale,
        theme: state.theme,
      }),
    },
  ),
);
