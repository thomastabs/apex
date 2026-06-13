"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/stores/session-store";

/** Clear the session token after this much inactivity. The bearer token lives
 *  in sessionStorage (readable by JS), so bounding its lifetime shrinks the
 *  window in which a stolen token is useful (security gap #3). */
const IDLE_MS = 30 * 60 * 1000; // 30 minutes

// Discrete activity signals — enough to detect a live user without the churn
// of resetting the timer on every mousemove.
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export function useIdleLogout(): void {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const { taigaToken, clearSession } = useSessionStore.getState();
        if (!taigaToken) return; // already signed out — nothing to clear
        clearSession();
        queryClient.clear();
        toast.message("Signed out after 30 minutes of inactivity.");
      }, IDLE_MS);
    };

    reset();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true });
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
    };
  }, [queryClient]);
}
