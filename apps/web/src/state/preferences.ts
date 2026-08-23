import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/messages";

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
      name: "toonflow.preferences.v2",
      version: 2,
      partialize: (state) => ({ locale: state.locale }),
    },
  ),
);
