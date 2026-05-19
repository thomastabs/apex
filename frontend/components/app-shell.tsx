"use client";

import { ReactNode, useEffect, useRef } from "react";
import { Sidebar } from "./sidebar";
import { PhaseNav } from "./phase-nav";
import { useUiStore } from "@/lib/stores/ui-store";
import { getApiBaseUrl } from "@/lib/api/client";
import { toast } from "sonner";

function useServerWakeup() {
  const didCheck = useRef(false);

  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;

    let toastId: string | number | undefined;
    const timer = setTimeout(() => {
      toastId = toast.loading("Server is waking up — this may take ~30 seconds…", { duration: Infinity });
    }, 3_000);

    fetch(`${getApiBaseUrl()}/api/health`, { signal: AbortSignal.timeout(45_000) })
      .then(() => {
        clearTimeout(timer);
        if (toastId !== undefined) toast.dismiss(toastId);
      })
      .catch(() => {
        clearTimeout(timer);
        if (toastId !== undefined) toast.dismiss(toastId);
      });
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useUiStore((state) => state.theme);
  useServerWakeup();

  return (
    <div className={theme === "dark" ? "min-h-screen bg-[#1b1b1c] text-neutral-100" : "min-h-screen bg-white text-slate-950"}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className={theme === "dark" ? "min-w-0 flex-1" : "apex-main-light min-w-0 flex-1"}>
          <PhaseNav />
          {children}
        </main>
      </div>
    </div>
  );
}
