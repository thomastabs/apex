"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIProgressIndicator({
  steps,
  isPending,
  dark,
}: {
  steps: string[];
  isPending: boolean;
  dark: boolean;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isPending) { setStepIdx(0); setDots(""); return; }
    const stepTimer = setInterval(() => setStepIdx((i) => (i + 1) % steps.length), 2200);
    const dotsTimer = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => { clearInterval(stepTimer); clearInterval(dotsTimer); };
  }, [isPending, steps.length]);

  if (!isPending) return null;

  return (
    <div className={cn(
      "space-y-3 rounded-md border p-4",
      dark ? "border-violet-500/20 bg-violet-950/20" : "border-violet-300 bg-violet-50",
    )}>
      <div className="flex items-center gap-2">
        <div className="size-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        <span className={cn("text-sm font-medium", dark ? "text-violet-300" : "text-violet-700")}>
          AI Working{dots}
        </span>
      </div>
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <div
            key={step}
            className={cn(
              "flex items-center gap-2 text-xs transition-all duration-500",
              i < stepIdx
                ? "text-emerald-500"
                : i === stepIdx
                  ? dark ? "text-violet-300" : "text-violet-600"
                  : dark ? "text-neutral-600" : "text-slate-400",
            )}
          >
            {i < stepIdx ? (
              <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
            ) : i === stepIdx ? (
              <span className={cn("shrink-0 animate-pulse", dark ? "text-violet-400" : "text-violet-500")}>›</span>
            ) : (
              <span className={cn("shrink-0", dark ? "text-neutral-700" : "text-slate-300")}>○</span>
            )}
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
