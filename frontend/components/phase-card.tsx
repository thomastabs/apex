import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PhaseStatus = "done" | "active" | "pending";

export function PhaseCard({
  href,
  phase,
  title,
  description,
  icon: Icon,
  badge,
  status = "pending",
  dark = true,
}: {
  href: string;
  phase: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  status?: PhaseStatus;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative block rounded-lg border p-4 transition-all duration-150",
        dark
          ? "border-neutral-800 bg-neutral-900/40 hover:border-violet-500/40 hover:bg-neutral-800/60"
          : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40 shadow-sm",
      )}
    >
      {/* Status indicator — top right */}
      <div className="absolute right-3 top-3">
        {status === "done" ? (
          <CheckCircle2 className="size-4 text-emerald-400" />
        ) : status === "active" ? (
          <span className="block size-2 rounded-full bg-violet-400" />
        ) : (
          <span className={cn("block size-2 rounded-full", dark ? "bg-neutral-700" : "bg-slate-200")} />
        )}
      </div>

      {/* Icon + phase label */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md",
          dark ? "bg-neutral-800" : "bg-slate-100",
        )}>
          <Icon className={cn(
            "size-4",
            status === "pending"
              ? dark ? "text-neutral-600" : "text-slate-300"
              : "text-violet-400",
          )} />
        </div>
        <span className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          dark ? "text-neutral-600" : "text-slate-400",
        )}>
          {phase}
        </span>
        {badge && (
          <span className={cn(
            "ml-auto rounded border px-1.5 py-0.5 text-[10px] font-medium",
            status === "done"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-violet-500/30 bg-violet-500/10 text-violet-400",
          )}>
            {badge}
          </span>
        )}
      </div>

      {/* Title */}
      <div className={cn(
        "mb-1.5 text-sm font-semibold transition-colors",
        status === "pending"
          ? dark ? "text-neutral-500" : "text-slate-400"
          : dark ? "text-neutral-100 group-hover:text-violet-300" : "text-slate-900 group-hover:text-violet-600",
      )}>
        {title}
      </div>

      {/* Description */}
      <p className={cn(
        "text-xs leading-5",
        dark ? "text-neutral-600" : "text-slate-400",
      )}>
        {description}
      </p>
    </Link>
  );
}
