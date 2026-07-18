"use client";

import { useUiStore } from "@/lib/stores/ui-store";
import { translations, type TranslationKey } from "./translations";

// Falls back to English on a missing key rather than throwing — a partially
// translated dictionary should never break the app. `vars` does simple
// {name} substitution for count/label-bearing strings (e.g. "{n} stories
// converted").
export function useT() {
  const locale = useUiStore((s) => s.locale);
  return (key: TranslationKey, vars?: Record<string, string | number>): string => {
    let str: string = translations[locale][key] ?? translations.en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        str = str.replaceAll(`{${name}}`, String(value));
      }
    }
    return str;
  };
}
