"use client";

import { ChevronRight } from "lucide-react";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

// Shared across Phase 3/4/5 — they all share the same "select epic and
// story" flow, so the currently-selected story stays visible (with a way
// back to the picker) on every step after selection, not just the first one.
export function StoryBreadcrumb({
  onBack,
  epicTitle,
  storyRef,
  title,
}: {
  onBack: () => void;
  epicTitle?: string;
  storyRef: number | string;
  title?: string;
}) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const t = useT();
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border px-4 py-3",
      dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
    )}>
      <button
        onClick={onBack}
        className={cn("shrink-0 text-xs font-medium transition", dark ? "text-neutral-400 hover:text-violet-400" : "text-slate-500 hover:text-violet-600")}
      >
        {t("phase3.backToStories")}
      </button>
      {epicTitle && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
          <span className={cn("shrink-0 text-xs font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
            {epicTitle}
          </span>
        </>
      )}
      <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
      <span className={cn("shrink-0 inline-flex items-center gap-1.5 text-xs font-mono font-semibold", dark ? "text-violet-400" : "text-violet-700")}>
        US#{storyRef}
      </span>
      <span className={cn("text-sm font-medium truncate", dark ? "text-neutral-300" : "text-slate-700")}>
        {title}
      </span>
    </div>
  );
}
