"use client";

import { ReactNode, useEffect, useRef } from "react";
import { Sidebar } from "./sidebar";
import { RightSidebar } from "./right-sidebar";
import { CommandPalette } from "./command-palette";
import { DiffModal } from "./ui/diff-modal";
import { useUiStore } from "@/lib/stores/ui-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useAutoSyncStoryIndex } from "@/lib/hooks/use-workspace";
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

/** Rebuild the story index once whenever a project becomes active — sign-in
 *  with a restored project or switching projects in the selector — so badges
 *  and eligibility lists start from a fresh index instead of stale cache. */
function useProjectIndexSync() {
  const context = useApiContext();
  const autoSync = useAutoSyncStoryIndex();
  const lastSyncedProject = useRef<number | null>(null);

  useEffect(() => {
    const pid = context?.projectId ?? null;
    if (pid !== null && pid !== lastSyncedProject.current) {
      lastSyncedProject.current = pid;
      autoSync();
    }
  }, [context?.projectId, autoSync, context]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useUiStore((state) => state.theme);
  useServerWakeup();
  useProjectIndexSync();

  return (
    <div className={theme === "dark" ? "min-h-screen bg-[#1b1b1c] text-neutral-100" : "min-h-screen bg-white text-slate-950"}>
      <CommandPalette />
      <DiffModal />
      <div className="flex min-h-screen">
        <Sidebar />
        <main className={theme === "dark" ? "min-w-0 flex-1" : "apex-main-light min-w-0 flex-1"}>
          {children}
        </main>
        <RightSidebar />
      </div>
    </div>
  );
}
