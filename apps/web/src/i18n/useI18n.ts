import { useCallback, useEffect } from "react";
import { localeLabels, messages, type Locale, type MessageKey } from "@/i18n/messages";
import { usePreferences } from "@/state/preferences";

export function useI18n() {
  const locale = usePreferences((state) => state.locale);
  const setLocale = usePreferences((state) => state.setLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return {
    locale,
    localeLabels,
    setLocale: useCallback((nextLocale: Locale) => setLocale(nextLocale), [setLocale]),
    t: useCallback((key: MessageKey) => messages[locale][key], [locale]),
  };
}
