import { describe, expect, test } from "vitest";
import { localeLabels, messages } from "@/i18n/messages";

describe("localization contract", () => {
  test("keeps all seven locales complete", () => {
    const expected = Object.keys(messages["zh-CN"]).toSorted();
    expect(Object.keys(messages)).toEqual([
      "zh-CN",
      "en-US",
      "ja-JP",
      "ko-KR",
      "es-ES",
      "fr-FR",
      "de-DE",
    ]);
    for (const [locale, dictionary] of Object.entries(messages)) {
      expect(Object.keys(dictionary).toSorted(), locale).toEqual(expected);
      expect(localeLabels[locale as keyof typeof localeLabels]).toBeTruthy();
    }
  });
});
