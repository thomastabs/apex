import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function PhaseCard({
  href,
  phase,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  phase: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group block h-full rounded-md border border-neutral-800 bg-[#1f1f21] p-5 transition-all duration-200 hover:border-violet-500/60 hover:bg-violet-500/10 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.15)]"
    >
      <div className="mb-6 flex items-start gap-4">
        <Icon className="mt-1 size-5 shrink-0 text-violet-400" />
        <div>
          <div className="text-xs font-bold text-violet-400">{phase}</div>
          <div className="text-base font-bold text-white">{title}</div>
        </div>
      </div>
      <p className="mb-5 text-sm leading-6 text-neutral-500">{description}</p>
      <span className="inline-block text-sm font-medium text-violet-400 transition-transform duration-200 group-hover:translate-x-1">Open →</span>
    </Link>
  );
}
