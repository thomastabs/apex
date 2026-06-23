"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Optional free-text "Guide the AI" input (advisory). Mirrors the Phase 4/5
 * pattern so Phases 1–3 steer generation consistently. Collapsed by default;
 * shows a "notes added" badge when there is content. Capped at 2000 chars —
 * advisory only, it never licenses output the inputs don't ground.
 */
export function GuideTheAI({
  value,
  onChange,
  dark,
  placeholder = "Optional notes to steer this generation — conventions, naming, emphases, things to favour or avoid. The spec still drives what gets produced.",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  dark: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("overflow-hidden rounded-lg border", dark ? "border-neutral-700 bg-neutral-900/40" : "border-slate-200 bg-slate-50/60")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors",
          dark ? "text-neutral-300 hover:text-neutral-100" : "text-slate-600 hover:text-slate-800",
        )}
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
        Guide the AI <span className={cn("font-normal", dark ? "text-neutral-500" : "text-slate-400")}>(optional)</span>
        {value.trim() && !open ? (
          <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[10px]", dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700")}>
            notes added
          </span>
        ) : null}
      </button>
      {open && (
        <div className={cn("border-t px-4 py-3", dark ? "border-neutral-700" : "border-slate-200")}>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, 2000))}
            maxLength={2000}
            disabled={disabled}
            placeholder={placeholder}
            className="h-28 resize-y text-xs"
          />
          <p className={cn("mt-1 text-[11px]", dark ? "text-neutral-500" : "text-slate-400")}>
            Advisory only — steers emphasis and conventions, never invents requirements. {value.length}/2000
          </p>
        </div>
      )}
    </div>
  );
}
