"use client";

import { useUiStore } from "@/lib/stores/ui-store";
import { translations, type TranslationKey } from "./translations";

/**
 * Non-hook translator for code that runs outside React's render tree — the
 * global QueryCache/MutationCache error handlers, the `unhandledrejection`
 * listener, and anything else that cannot call `useT()`.
 *
 * Reads the locale from the Zustand store imperatively, so it always reflects
 * the current language even though it never subscribes. Components must keep
 * using `useT()` — it re-renders on a language switch, this does not.
 */
export function translate(key: TranslationKey, vars?: Record<string, string | number>): string {
  const locale = useUiStore.getState().locale;
  const dictionary = translations[locale] ?? translations.en;
  let str: string = dictionary[key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}
