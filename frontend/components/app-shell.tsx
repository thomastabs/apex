"use client";

import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { PhaseNav } from "./phase-nav";
import { useUiStore } from "@/lib/stores/ui-store";

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useUiStore((state) => state.theme);
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
