import { describe, it, expect } from "vitest";
import { translations } from "@/lib/i18n/translations";

const en = translations.en as Record<string, string>;
const pt = translations.pt as Record<string, string>;

describe("translation dictionary integrity", () => {
  it("has the same keys in en and pt", () => {
    // TranslationKey is derived from `en`, so a key missing from `pt` type-checks
    // fine and silently falls back to English at runtime.
    const enKeys = Object.keys(en).sort();
    const ptKeys = Object.keys(pt).sort();
    expect(ptKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !ptKeys.includes(k))).toEqual([]);
  });

  it("has no untranslated pt values that are byte-identical placeholders", () => {
    // Proper nouns and shared terms legitimately match; this only guards the
    // long sentence-shaped values, where an identical string means "not done".
    const suspicious = Object.keys(en).filter(
      (k) => en[k].length > 40 && en[k] === pt[k],
    );
    expect(suspicious).toEqual([]);
  });

  // Severity is carried by the sonner variant and its icon, never by characters
  // in the string. See the no-emoji rule.
  //
  // Typographic arrows (→ in "Settings → AI Model", ↔ in "spec↔code") are in
  // Unicode's Extended_Pictographic set but are punctuation here, not emoji, so
  // the Arrows block is excluded.
  const EMOJI = /(?![\u2190-\u21FF])\p{Extended_Pictographic}/u;

  it("contains no emoji in any user-facing string", () => {
    const offenders: string[] = [];
    for (const [locale, dict] of [["en", en], ["pt", pt]] as const) {
      for (const [key, value] of Object.entries(dict)) {
        if (EMOJI.test(value)) offenders.push(`${locale}.${key}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives every ErrorKind a title and a hint in both locales", () => {
    const segments = [
      "offline", "timeout", "authExpired", "forbidden", "notFound", "conflict",
      "validation", "rateLimited", "aiRateLimit", "aiTimeout", "aiConfig",
      "upstream", "server", "unknown",
    ];
    const missing: string[] = [];
    for (const segment of segments) {
      for (const suffix of ["title", "hint"]) {
        const key = `errors.${segment}.${suffix}`;
        if (!en[key]) missing.push(`en:${key}`);
        if (!pt[key]) missing.push(`pt:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
