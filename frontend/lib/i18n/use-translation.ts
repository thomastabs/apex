"use client";

import { useUiStore } from "@/lib/stores/ui-store";
import { translations, type TranslationKey } from "./translations";

// Falls back to English on a missing key rather than throwing — a partially
// translated dictionary should never break the app.
export function useT() {
  const locale = useUiStore((s) => s.locale);
  return (key: TranslationKey): string => translations[locale][key] ?? translations.en[key] ?? key;
}
