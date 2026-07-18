"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { useSaveAiLanguage } from "@/lib/hooks/use-workspace";
import { useT } from "@/lib/i18n/use-translation";
import { useUiStore, type Locale } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type LanguageSectionProps = DragSectionProps & {
  dark: boolean;
};

export function LanguageSection({ dark, shellClass, dragHandlers, onDragStart }: LanguageSectionProps) {
  const t = useT();
  const [languageOpen, setLanguageOpen] = useState(false);
  const saveAiLanguageMutation = useSaveAiLanguage();
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  function changeLanguage(lang: Locale) {
    setLocale(lang);
    saveAiLanguageMutation.mutate(lang, {
      onError: () => toast.error(t("ai.toast.failedSaveLanguage")),
    });
  }

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Languages className="size-4" />}
          title={t("settings.language")}
          open={languageOpen}
          onClick={() => setLanguageOpen(!languageOpen)}
          onDragStart={onDragStart}
        />
        {languageOpen ? (
          <div className={cn("space-y-2 px-4 py-4 text-sm", expandedPanelClass)}>
            <div className={cn("flex overflow-hidden rounded border", dark ? "border-neutral-700" : "border-slate-300")}>
              {(["en", "pt"] as Locale[]).map((lang) => (
                <button
                  key={lang}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold transition-colors",
                    locale === lang
                      ? "bg-violet-700 text-white"
                      : dark ? "bg-neutral-900 text-neutral-400 hover:bg-neutral-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                  )}
                  onClick={() => changeLanguage(lang)}
                >
                  {lang === "en" ? t("settings.language.en") : t("settings.language.pt")}
                </button>
              ))}
            </div>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{t("settings.language.hint")}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
