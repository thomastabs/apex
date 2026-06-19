"use client";

import { StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cancel affordance shown while an AI call is in flight. Aborts the request via
 * the owning hook's `cancel()` (client-abort — see useCancellableMutation).
 */
export function CancelButton({
  onCancel,
  label = "Cancel",
  className,
}: {
  onCancel: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onCancel}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        "border-red-300 text-red-600 hover:bg-red-50",
        "dark:border-red-800/70 dark:text-red-400 dark:hover:bg-red-950/40",
        className,
      )}
    >
      <StopCircle className="h-4 w-4" /> {label}
    </button>
  );
}
