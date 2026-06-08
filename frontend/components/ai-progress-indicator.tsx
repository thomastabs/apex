"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIProgressIndicator({
  steps,
  isPending,
  dark,
  activeStep,
}: {
  steps: string[];
  isPending: boolean;
  dark: boolean;
  activeStep?: number;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dots, setDots] = useState("");
  // progress: 0–100. Asymptotically approaches ~90 while pending, jumps to 100 on done.
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  // Track whether we've ever been pending so the "snap to 100" path only fires after real work.
  const wasPendingRef = useRef(false);

  // Step cycling — advance forward only, stop at last step (no wrap-around).
  useEffect(() => {
    if (!isPending) {
      setStepIdx(0);
      setDots("");
      return;
    }
    if (activeStep !== undefined) {
      setStepIdx(Math.min(activeStep, steps.length - 1));
    }
    const dotsTimer = setInterval(
      () => setDots((d) => (d.length >= 3 ? "" : d + ".")),
      400,
    );
    if (activeStep !== undefined) return () => clearInterval(dotsTimer);

    // Advance only to the last step, then stay there.
    const stepTimer = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, steps.length - 1));
    }, 2200);
    return () => {
      clearInterval(stepTimer);
      clearInterval(dotsTimer);
    };
  }, [isPending, steps.length, activeStep]);

  // Progress bar — easing toward 90% while pending, snap to 100 on complete.
  useEffect(() => {
    if (!isPending) {
      if (!wasPendingRef.current) return; // never ran — skip the "done" flash on mount
      wasPendingRef.current = false;
      setProgress(100);
      const reset = setTimeout(() => { setProgress(0); progressRef.current = 0; }, 600);
      return () => clearTimeout(reset);
    }
    wasPendingRef.current = true;
    progressRef.current = 0;
    setProgress(0);
    const TICK_MS = 250;
    const PULL_RATE = 0.028; // each tick: progress += (90 - progress) * PULL_RATE
    const timer = setInterval(() => {
      const next = progressRef.current + (90 - progressRef.current) * PULL_RATE;
      progressRef.current = next;
      setProgress(next);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [isPending]);

  if (!isPending && progress === 0) return null;

  return (
    <div className={cn(
      "space-y-3 rounded-md border p-4",
      dark ? "border-violet-500/20 bg-violet-950/20" : "border-violet-300 bg-violet-50",
    )}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="size-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        <span className={cn("text-sm font-medium", dark ? "text-violet-300" : "text-violet-700")}>
          AI Working{dots}
        </span>
      </div>

      {/* Progress bar */}
      <div className={cn("h-1 rounded-full overflow-hidden", dark ? "bg-violet-900/40" : "bg-violet-200")}>
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isPending ? "bg-violet-500" : "bg-emerald-500",
          )}
          style={{ width: `${progress}%`, transitionDuration: isPending ? "200ms" : "400ms" }}
        />
      </div>

      {/* Step list */}
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
