"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/primitives";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { useUiStore } from "@/lib/stores/ui-store";
import { useDiffStore } from "@/lib/stores/diff-store";
import { lineDiff, diffStats } from "@/lib/diff";
import { cn } from "@/lib/utils";

// Global review gate for regenerations. Shows old-vs-new as a line diff so the
// user accepts (replace) or discards (keep current) instead of a silent swap.
export function DiffModal() {
  const dark = useUiStore((s) => s.theme === "dark");
  const open = useDiffStore((s) => s.open);
  const request = useDiffStore((s) => s.request);
  const accept = useDiffStore((s) => s.accept);
  const discard = useDiffStore((s) => s.discard);

  useEscapeKey(open, discard);

  const lines = useMemo(
    () => (request ? lineDiff(request.oldText, request.newText) : []),
    [request],
  );
  const stats = useMemo(() => diffStats(lines), [lines]);

  if (!open || !request) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Review changes: ${request.title}`}
      className={cn("fixed inset-0 z-[60] grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={discard}
    >
      <div
        className={cn("flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: dark ? "#404040" : "#e2e8f0" }}>
          <div>
            <h3 className={cn("text-sm font-bold", dark ? "text-white" : "text-slate-950")}>Review regeneration — {request.title}</h3>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
              <span className="text-emerald-500">+{stats.added}</span>{" "}
              <span className="text-red-500">−{stats.removed}</span> · Accept replaces the current version; Discard keeps it.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 py-2 font-mono text-xs leading-5">
          {lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap px-3",
                l.type === "add" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                l.type === "del" && "bg-red-500/15 text-red-700 dark:text-red-300",
                l.type === "same" && (dark ? "text-neutral-500" : "text-slate-400"),
              )}
            >
              <span className="select-none opacity-60">{l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}</span>
              {l.text || " "}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: dark ? "#404040" : "#e2e8f0" }}>
          <Button variant="secondary" onClick={discard}>Discard (keep current)</Button>
          <Button onClick={accept}>Accept changes</Button>
        </div>
      </div>
    </div>
  );
}
