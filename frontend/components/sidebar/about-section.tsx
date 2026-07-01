"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

const PHASES = [
  { n: 1, label: "Requirements", desc: "Epics, stories, Gherkin acceptance criteria" },
  { n: 2, label: "Design", desc: "UX brief, API surface, ER diagram, data model" },
  { n: 3, label: "Implementation", desc: "Task decomposition, dev packs, Taiga push" },
  { n: 4, label: "Testing", desc: "BDD test generation and validation" },
  { n: 5, label: "Deployment", desc: "Deployment pipeline and configuration" },
  { n: 6, label: "Maintenance", desc: "Monitoring, incident response, iteration" },
];

type AboutSectionProps = DragSectionProps & { dark: boolean };

export function AboutSection({ dark, shellClass, dragHandlers, onDragStart }: AboutSectionProps) {
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
          title="About Apex"
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open && (
          <div className={cn("px-4 py-4 space-y-4", expandedPanelClass)}>
            <p className={cn("text-xs leading-relaxed", textClass)}>
              Apex is a Spec-Anchored AI collaboration framework for the full software development lifecycle.
              It guides teams from requirements through deployment using structured AI assistance at every phase.
            </p>

            <div>
              <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-wider", subduedTextClass)}>
                The 6 Phases
              </p>
              <div className="space-y-2">
                {PHASES.map(({ n, label, desc }) => (
                  <div key={n} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold text-white">
                      {n}
                    </span>
                    <div>
                      <p className={cn("text-xs font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>
                        {label}
                      </p>
                      <p className={cn("text-[11px]", subduedTextClass)}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn("rounded-lg border px-3 py-2.5 space-y-0.5", dark ? "border-neutral-700" : "border-slate-200")}>
              <p className={cn("text-[11px] font-semibold uppercase tracking-wider", subduedTextClass)}>Author</p>
              <p className={cn("text-xs font-semibold", dark ? "text-neutral-100" : "text-slate-900")}>
                Tomás Taborda
              </p>
              <p className={cn("text-[11px]", subduedTextClass)}>
                MEIC-T MSc Thesis · Human–AI Collaboration in Software Development
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
