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
  if (phase === 1) return `${total}`;
  if (phase === 2 && stats.phase2_designed > 0) return `${stats.phase2_designed}/${total}`;
  if (phase === 3 && stats.phase3_proposed > 0) return `${stats.phase3_proposed}/${total}`;
  if (phase === 4 && stats.phase4_tested > 0) return `${stats.phase4_tested}/${total}`;
  if (phase === 5 && stats.phase5_deployed > 0) return `${stats.phase5_deployed}/${total}`;
  return "";
}

const phases = [
  { href: "/phase1", label: "Requirements", badgePhase: 1 },
  { href: "/phase2", label: "Design",        badgePhase: 2 },
  { href: "/phase3", label: "Implementation", badgePhase: 3 },
  { href: "/phase4", label: "Testing",        badgePhase: 4 },
  { href: "/phase5", label: "Deployment",     badgePhase: 5 },
  { href: "/phase6", label: "Maintenance",    badgePhase: 0 },
];

export function PhaseNav() {
  const pathname = usePathname();
  const theme = useUiStore((state) => state.theme);
  const dark = theme === "dark";
  const { data: stats } = useStoryIndexStats();

  return (
    <nav className={cn(
      "sticky top-0 z-40 flex h-12 border-b",
      dark ? "border-neutral-800 bg-[#1b1b1c]" : "border-[#d9dce6] bg-[#fbfbfd]",
    )}>
      <Link
        href="/"
        className={cn(
          "flex w-12 shrink-0 items-center justify-center border-r transition-colors",
          dark
            ? "border-neutral-800 text-neutral-500 hover:text-violet-300"
            : "border-slate-200 text-slate-500 hover:text-apex-violet",
          pathname === "/" && (dark ? "text-violet-300" : "text-apex-violet"),
        )}
        aria-label="Home"
      >
        <Home className="size-4" />
      </Link>

      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {phases.map((phase, i) => {
          const active = pathname === phase.href;
          const badge = phaseBadge(stats, phase.badgePhase);
          return (
            <Link
              key={phase.href}
              href={phase.href}
              className={cn(
                "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 text-sm transition-colors",
                active
                  ? dark ? "text-neutral-100" : "text-slate-900"
                  : dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <span className={cn(
                "text-xs font-medium",
                dark ? "text-neutral-600" : "text-slate-400",
              )}>
                {i + 1}
              </span>
              <span className="truncate">{phase.label}</span>
              {badge ? (
                <span className={cn(
                  "shrink-0 rounded px-1 text-[10px] leading-4 font-medium",
                  dark ? "bg-violet-900/60 text-violet-300" : "bg-violet-100 text-violet-600",
                )}>
                  {badge}
                </span>
              ) : null}
              <span className={cn(
                "absolute bottom-0 h-0.5 w-full rounded-t bg-transparent transition-colors",
                active && "bg-violet-500",
              )} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
