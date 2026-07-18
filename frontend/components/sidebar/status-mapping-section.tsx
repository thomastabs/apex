"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { toast } from "sonner";
import { useSaveStatusMapping, useStatusMapping } from "@/lib/hooks/use-workspace";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ApexPhaseStatus } from "@/lib/api/workspace";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type StatusMappingSectionProps = DragSectionProps & {
  dark: boolean;
};

const APEX_STATUS_OPTIONS: Array<{ value: Exclude<ApexPhaseStatus, "new">; labelKey: TranslationKey }> = [
  { value: "gherkin_locked", labelKey: "board.apexStatus.gherkinLocked" },
  { value: "design_locked", labelKey: "board.apexStatus.designLocked" },
  { value: "implementation", labelKey: "board.apexStatus.implementation" },
  { value: "qa", labelKey: "board.apexStatus.qa" },
  { value: "qa_passed", labelKey: "board.apexStatus.qaPassed" },
  { value: "deployed", labelKey: "board.apexStatus.deployed" },
];

export function StatusMappingSection({ dark, shellClass, dragHandlers, onDragStart }: StatusMappingSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const statusMapping = useStatusMapping();
  const saveStatusMapping = useSaveStatusMapping();
  const [draft, setDraft] = useState<Record<string, Exclude<ApexPhaseStatus, "new">>>({});

  useEffect(() => {
    const next: Record<string, Exclude<ApexPhaseStatus, "new">> = {};
    for (const status of statusMapping.data?.statuses ?? []) {
      if (status.mapped_status !== "new") {
        next[status.id] = status.mapped_status;
      }
    }
    setDraft(next);
  }, [statusMapping.data]);

  const changed = useMemo(() => {
    const statuses = statusMapping.data?.statuses ?? [];
    return statuses.some((status) => draft[status.id] && draft[status.id] !== status.default_status);
  }, [draft, statusMapping.data]);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  function save() {
    saveStatusMapping.mutate(draft, {
      onSuccess: () => toast.success(t("statusMapping.saved")),
      onError: (e) => toast.error(e instanceof Error ? e.message : t("statusMapping.saveFailed")),
    });
  }

  function resetDefaults() {
    const next: Record<string, Exclude<ApexPhaseStatus, "new">> = {};
    for (const status of statusMapping.data?.statuses ?? []) {
      if (status.default_status !== "new") {
        next[status.id] = status.default_status;
      }
    }
    setDraft(next);
    saveStatusMapping.mutate({}, {
      onSuccess: () => toast.success(t("statusMapping.defaultsRestored")),
      onError: (e) => toast.error(e instanceof Error ? e.message : t("statusMapping.saveFailed")),
    });
  }

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<GitBranch className="size-4" />}
          title={t("statusMapping.panelTitle")}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("space-y-3 px-4 py-4 text-sm", expandedPanelClass)}>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
              {t("statusMapping.desc")}
            </p>
            {statusMapping.isLoading ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{t("common.loading")}</p>
            ) : (statusMapping.data?.statuses ?? []).length === 0 ? (
              <p className={cn("rounded border px-3 py-2 text-xs", dark ? "border-neutral-700 text-neutral-500" : "border-slate-200 text-slate-500")}>
                {t("statusMapping.noStatuses")}
              </p>
            ) : (
              <div className="space-y-2">
                {(statusMapping.data?.statuses ?? []).map((status) => (
                  <div
                    key={status.id}
                    className={cn("grid grid-cols-[minmax(0,1fr)_160px] items-center gap-2 rounded border p-2", dark ? "border-neutral-700 bg-neutral-950/40" : "border-slate-200 bg-slate-50")}
                  >
                    <div className="min-w-0">
                      <div className={cn("truncate text-xs font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>{status.name}</div>
                      <div className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                        {status.source === "configured" ? t("statusMapping.configured") : t("statusMapping.defaulted")}
                      </div>
                    </div>
                    <select
                      value={draft[status.id] ?? status.default_status}
                      onChange={(event) => setDraft((prev) => ({ ...prev, [status.id]: event.target.value as Exclude<ApexPhaseStatus, "new"> }))}
                      className={cn("h-8 rounded border px-2 text-xs", dark ? "border-neutral-700 bg-neutral-900 text-neutral-100" : "border-slate-300 bg-white text-slate-900")}
                    >
                      {APEX_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className={cn("h-8 rounded text-xs font-semibold disabled:opacity-40", dark ? "bg-violet-700 text-violet-50 hover:bg-violet-600" : "bg-violet-600 text-white hover:bg-violet-700")}
                disabled={saveStatusMapping.isPending || !(statusMapping.data?.statuses ?? []).length}
                onClick={save}
              >
                {saveStatusMapping.isPending ? t("common.saving") : t("common.save")}
              </button>
              <button
                className={cn("h-8 rounded text-xs font-semibold disabled:opacity-40", dark ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
                disabled={saveStatusMapping.isPending || !changed}
                onClick={resetDefaults}
              >
                {t("statusMapping.restoreDefaults")}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
