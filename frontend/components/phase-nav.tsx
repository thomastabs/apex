"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui-store";
import { useStoryIndexStats } from "@/lib/hooks/use-workspace";

function phaseBadge(stats: ReturnType<typeof useStoryIndexStats>["data"], phase: number): string {
  if (!stats || stats.total === 0) return "";
  const total = stats.total;
  if (phase === 2 && stats.phase2_designed > 0) return `${stats.phase2_designed}/${total} designed`;
  if (phase === 3 && stats.phase3_proposed > 0) return `${stats.phase3_proposed}/${total} proposed`;
  if (phase === 4 && stats.phase4_tested > 0) return `${stats.phase4_tested}/${total} tested`;
  if (phase === 5 && stats.phase5_deployed > 0) return `${stats.phase5_deployed}/${total} deployed`;
  return "";
}

const phases = [
  { href: "/phase1", num: "Phase 1", label: "Requirements", badgePhase: 1 },
  { href: "/phase2", num: "Phase 2", label: "Design", badgePhase: 2 },
  { href: "/phase3", num: "Phase 3", label: "Implementation", badgePhase: 3 },
  { href: "/phase4", num: "Phase 4", label: "Testing", badgePhase: 4 },
  { href: "/phase5", num: "Phase 5", label: "Deployment", badgePhase: 5 },
  { href: "/phase6", num: "Phase 6", label: "Maintenance", badgePhase: 0 },
];

export function PhaseNav() {
  const pathname = usePathname();
  const theme = useUiStore((state) => state.theme);
  const dark = theme === "dark";
  const { data: stats } = useStoryIndexStats();

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
          const badge = phaseBadge(stats, phase.badgePhase);
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
              {badge ? (
                <span className="mt-0.5 rounded bg-violet-900/60 px-1.5 py-0.5 text-[10px] leading-none text-violet-300">
                  {badge}
                </span>
              ) : null}
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
