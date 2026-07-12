"use client";
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AdminPhaseStatus } from "@/lib/api/workspace";
import { useAdminSetAllStoryStatus } from "@/lib/hooks/use-workspace";
import { PanelHeader, type DragSectionProps } from "./shared";

const STATUSES: { value: AdminPhaseStatus; label: string }[] = [
  { value: "gherkin_locked", label: "Gherkin Locked (Phase 1)" },
  { value: "design_locked", label: "Design Locked (Phase 2)" },
  { value: "implementation", label: "Implementation (Phase 3)" },
  { value: "qa", label: "QA (Phase 4 — test plan saved)" },
  { value: "qa_passed", label: "QA Passed (Phase 4 gate)" },
  { value: "deployed", label: "Deployed (Phase 5)" },
];

type AdminSectionProps = DragSectionProps & {
  dark: boolean;
};

/**
 * Testing convenience only — bulk-forces every story's phase_status, bypassing
 * every phase gate. Password-checked server-side (see admin_set_all_story_status);
 * this is NOT a real access-control boundary, just a speed bump against a stray
 * click. Never use on a real project.
 */
export function AdminSection({ dark, shellClass, dragHandlers, onDragStart }: AdminSectionProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [targetStatus, setTargetStatus] = useState<AdminPhaseStatus>("qa_passed");
  const setAll = useAdminSetAllStoryStatus();

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const inputClass = cn(
    "w-full rounded-md border px-3 py-2 text-sm focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/30",
    dark ? "border-neutral-700 bg-neutral-800/60 text-neutral-200 placeholder-neutral-600" : "border-slate-300 bg-white text-slate-800 placeholder-slate-400",
  );

  function handleApply() {
    if (!password.trim()) return;
    const statusLabel = STATUSES.find((s) => s.value === targetStatus)?.label ?? targetStatus;
    if (!window.confirm(
      `Force EVERY story in this project to "${statusLabel}"? This bypasses all phase gates and cannot be undone.`,
    )) {
      return;
    }
    setAll.mutate(
      { phaseStatus: targetStatus, password },
      {
        onSuccess: (res) => {
          setPassword("");
          toast.success(`${res.updated} stor${res.updated === 1 ? "y" : "ies"} set to ${statusLabel}.`);
        },
        onError: (err: Error) => toast.error(err.message || "Failed to update story statuses."),
      },
    );
  }

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<ShieldAlert className="size-4" />}
          title="Admin — Testing Tools"
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open && (
          <div className={cn("space-y-3 px-4 py-4", expandedPanelClass)}>
            <div className={cn(
              "rounded-md border px-3 py-2 text-xs leading-relaxed",
              dark ? "border-red-900/50 bg-red-950/30 text-red-300" : "border-red-300 bg-red-50 text-red-700",
            )}>
              Bypasses every phase gate for every story in this project — for local/manual testing only.
              Never use this on a real project.
            </div>
            <div className="space-y-1.5">
              <label className={cn("block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                Admin password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={cn("block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                Set ALL stories to
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as AdminPhaseStatus)}
                className={inputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={!password.trim() || setAll.isPending}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {setAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
              Apply to ALL stories
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
