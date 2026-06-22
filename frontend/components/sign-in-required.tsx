"use client";

import { AlertCircle } from "lucide-react";

/**
 * Amber "Sign in required" blocker shown on a phase/tool surface when there is no
 * active session + project (mirrors the Phase 1/2/6 guard). Render it when
 * `useApiContext()` is null. `unlocks` names what signing in enables.
 */
export function SignInRequired({ unlocks }: { unlocks: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-4">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <div>
        <p className="text-sm font-semibold text-amber-300">Sign in required</p>
        <p className="mt-0.5 text-xs text-amber-400/80">
          Sign in and select a project in the sidebar to unlock {unlocks}.
        </p>
      </div>
    </div>
  );
}
