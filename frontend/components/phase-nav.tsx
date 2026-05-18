"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui-store";

const phases = [
  { href: "/phase1", num: "Phase 1", label: "Requirements" },
  { href: "/phase2", num: "Phase 2", label: "Design" },
  { href: "/phase3", num: "Phase 3", label: "Implementation" },
  { href: "/phase4", num: "Phase 4", label: "Testing" },
  { href: "/phase5", num: "Phase 5", label: "Deployment" },
  { href: "/phase6", num: "Phase 6", label: "Maintenance" },
];

export function PhaseNav() {
  const pathname = usePathname();
  const theme = useUiStore((state) => state.theme);
  const dark = theme === "dark";

  return (
    <nav className={cn("sticky top-0 z-40 flex h-[48px] border-b", dark ? "border-neutral-800 bg-[#1b1b1c]" : "border-slate-200 bg-[#fbfbfd]")}>
      <Link
        href="/"
        className={cn(
          "flex w-20 shrink-0 items-center justify-center border-r transition-colors",
          dark ? "border-neutral-800 text-neutral-500 hover:text-violet-300" : "border-slate-200 text-slate-500 hover:text-apex-violet",
          pathname === "/" && (dark ? "text-violet-300" : "text-apex-violet"),
        )}
        aria-label="Home"
      >
        <Home className="size-4" />
      </Link>
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {phases.map((phase) => {
          const active = pathname === phase.href;
          return (
            <Link
              key={phase.href}
              href={phase.href}
              className={cn(
                "group relative flex min-w-36 flex-1 flex-col items-center justify-center px-3 text-center text-sm transition-colors",
                active
                  ? dark ? "bg-violet-950/30 text-neutral-100" : "bg-violet-50 text-slate-800"
                  : dark ? "text-neutral-400 hover:text-neutral-100" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <span className="text-xs font-medium leading-4">{phase.num}</span>
              <span className="leading-5">{phase.label}</span>
              <span
                className={cn(
                  "absolute bottom-0 h-0.5 w-full rounded-t bg-transparent",
                  active && "bg-violet-500",
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
