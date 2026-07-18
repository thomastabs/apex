"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";

const PHASES: { n: number; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { n: 1, labelKey: "nav.phase1", descKey: "about.phase1Desc" },
  { n: 2, labelKey: "nav.phase2", descKey: "about.phase2Desc" },
  { n: 3, labelKey: "nav.phase3", descKey: "about.phase3Desc" },
  { n: 4, labelKey: "nav.phase4", descKey: "about.phase4Desc" },
  { n: 5, labelKey: "nav.phase5", descKey: "about.phase5Desc" },
  { n: 6, labelKey: "nav.phase6", descKey: "about.phase6Desc" },
];

type AboutSectionProps = DragSectionProps & { dark: boolean };

export function AboutSection({ dark, shellClass, dragHandlers, onDragStart }: AboutSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";
  const textClass = dark ? "text-neutral-300" : "text-slate-700";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Info className="size-4" />}
          title={t("about.panelTitle")}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open && (
          <div className={cn("px-4 py-4 space-y-4", expandedPanelClass)}>
            <p className={cn("text-xs leading-relaxed", textClass)}>
              {t("about.description")}
            </p>

            <div>
              <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-wider", subduedTextClass)}>
                {t("about.the6Phases")}
              </p>
              <div className="space-y-2">
                {PHASES.map(({ n, labelKey, descKey }) => (
                  <div key={n} className="flex items-start gap-2">
	                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                      {n}
                    </span>
                    <div>
                      <p className={cn("text-xs font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>
                        {t(labelKey)}
                      </p>
                      <p className={cn("text-[11px]", subduedTextClass)}>{t(descKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn("rounded-lg border px-3 py-2.5 space-y-0.5", dark ? "border-neutral-700" : "border-slate-200")}>
              <p className={cn("text-[11px] font-semibold uppercase tracking-wider", subduedTextClass)}>{t("about.author")}</p>
              <p className={cn("text-xs font-semibold", dark ? "text-neutral-100" : "text-slate-900")}>
                Tomás Taborda
              </p>
              <p className={cn("text-[11px]", subduedTextClass)}>
                {t("about.thesisLine")}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
