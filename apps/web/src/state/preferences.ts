import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/messages";

const currentLocales = new Set<Locale>([
  "zh-CN",
  "zh-TW",
  "en",
  "ja-JP",
  "ru-RU",
  "th-TH",
  "vi-VN",
]);

interface PreferenceState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const usePreferences = create<PreferenceState>()(
  persist(
    (set) => ({
      locale: "zh-CN",
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "narrastage.preferences.v2",
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PreferenceState>;
        const locale = state.locale as string | undefined;
        if (locale === "en-US") return { ...state, locale: "en" } as PreferenceState;
        if (locale && currentLocales.has(locale as Locale)) return state as PreferenceState;
        return { ...state, locale: "zh-CN" } as PreferenceState;
      },
      partialize: (state) => ({ locale: state.locale }),
    },
  ),
);
