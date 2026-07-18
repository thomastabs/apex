"use client";
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AdminPhaseStatus } from "@/lib/api/workspace";
import { useAdminSetAllStoryStatus } from "@/lib/hooks/use-workspace";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";

const STATUSES: { value: AdminPhaseStatus; labelKey: TranslationKey }[] = [
  { value: "gherkin_locked", labelKey: "admin.status.gherkinLocked" },
  { value: "design_locked", labelKey: "admin.status.designLocked" },
  { value: "implementation", labelKey: "admin.status.implementation" },
  { value: "qa", labelKey: "admin.status.qa" },
  { value: "qa_passed", labelKey: "admin.status.qaPassed" },
  { value: "deployed", labelKey: "admin.status.deployed" },
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
  const t = useT();
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
    const statusLabelKey = STATUSES.find((s) => s.value === targetStatus)?.labelKey;
    const statusLabel = statusLabelKey ? t(statusLabelKey) : targetStatus;
    if (!window.confirm(t("admin.confirmForce", { status: statusLabel }))) {
      return;
    }
    setAll.mutate(
      { phaseStatus: targetStatus, password },
      {
        onSuccess: (res) => {
          setPassword("");
          toast.success(t(res.updated === 1 ? "admin.toast.updatedOne" : "admin.toast.updatedOther", { n: res.updated, status: statusLabel }));
        },
        onError: (err: Error) => toast.error(err.message || t("admin.toast.failedUpdate")),
      },
    );
  }

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<ShieldAlert className="size-4" />}
          title={t("admin.panelTitle")}
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
              {t("admin.bypassWarning")}
            </div>
            <div className="space-y-1.5">
              <label className={cn("block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                {t("admin.adminPassword")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("admin.passwordPlaceholder")}
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={cn("block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                {t("admin.setAllStoriesTo")}
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as AdminPhaseStatus)}
                className={inputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
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
              {t("admin.applyToAll")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
