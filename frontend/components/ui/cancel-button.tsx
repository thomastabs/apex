"use client";

import { StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui-store";

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
  const dark = useUiStore((s) => s.theme) === "dark";
  return (
    <button
      type="button"
      onClick={onCancel}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        dark ? "border-red-800/70 text-red-400 hover:bg-red-950/40" : "border-red-300 text-red-600 hover:bg-red-50",
        className,
      )}
    >
      <StopCircle className="h-4 w-4" /> {label}
    </button>
  );
}
