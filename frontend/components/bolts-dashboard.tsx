"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Layers, Loader2, SlidersHorizontal, TriangleAlert, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Callout, Input, SectionHeading } from "@/components/ui/primitives";
import { SignInRequired } from "@/components/sign-in-required";
import { decodeApexMeta, useBoltsList, useUpdateBoltStatus } from "@/lib/hooks/use-phase3";
import { useBoltConfig, useSaveBoltConfig } from "@/lib/hooks/use-workspace";
import { getPmAdapter } from "@/lib/api/pm-factory";
import { toPmCtx } from "@/lib/api/workspace";
import type { BoltConfig } from "@/lib/api/workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import { cn, errMsg } from "@/lib/utils";

const STATUS_ORDER = ["pack_ready", "pushed", "done"] as const;
type BoltStatus = (typeof STATUS_ORDER)[number];

const DEFAULT_LABELS: Record<BoltStatus, string> = {
  pack_ready: "Pack Ready",
  pushed: "Pushed",
  done: "Done",
};

type MergedBolt = {
  storyId: number;
  storyTitle: string;
  epicTitle: string;
  taskId: number;
  status: BoltStatus;
  subject: string;
  cycleHours: number | null;
  elapsedHours: number | null;
};

function earliestTimestamp(history: Record<string, string[]>, keys: string[]): number | null {
  const stamps = keys.flatMap((k) => history[k] ?? []).map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n));
  return stamps.length ? Math.min(...stamps) : null;
}

export function BoltsDashboard() {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();

  const boltsQuery = useBoltsList();
  const configQuery = useBoltConfig();
  const saveConfig = useSaveBoltConfig();
  const boltStatusMut = useUpdateBoltStatus();

  const pmTasksQuery = useQuery({
    queryKey: ["pm", "project-tasks", context?.projectId],
    queryFn: () => getPmAdapter(context!.pmTool).getProjectTasks(toPmCtx(context!)),
    enabled: Boolean(context),
    staleTime: 60_000,
  });

  // Bridge: the backend Bolt record only knows Apex's internal task_id, never
  // the subject text (avoids a second, driftable copy of it). The PM task's
  // own description already carries the internal id back via decodeApexMeta,
  // so subjects are merged client-side instead of duplicated server-side.
  const subjectById = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of pmTasksQuery.data ?? []) {
      const { apex_task_id } = decodeApexMeta(task.description);
      if (apex_task_id != null) map.set(apex_task_id, task.subject);
    }
    return map;
  }, [pmTasksQuery.data]);

  const rows: MergedBolt[] = useMemo(() => {
    return (boltsQuery.data?.bolts ?? []).map((b) => ({
      storyId: b.story_id,
      storyTitle: b.story_title,
      epicTitle: b.epic_title || "Ungrouped",
      taskId: b.task_id,
      status: b.status as BoltStatus,
      subject: subjectById.get(b.task_id) ?? `Task #${b.task_id}`,
      cycleHours: b.cycle_hours,
      elapsedHours: b.status === "done"
        ? b.cycle_hours
        : (() => {
            const start = earliestTimestamp(b.status_history, ["pack_ready", "pushed"]);
            return start != null ? Math.round(((Date.now() - start) / 3_600_000) * 100) / 100 : null;
          })(),
    }));
  }, [boltsQuery.data, subjectById]);

  const [epicFilter, setEpicFilter] = useState<string>("__all__");
  const epics = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.epicTitle, (map.get(r.epicTitle) ?? 0) + 1);
    return [...map.entries()];
  }, [rows]);

  const filteredRows = epicFilter === "__all__" ? rows : rows.filter((r) => r.epicTitle === epicFilter);
  const byStatus: Record<BoltStatus, MergedBolt[]> = {
    pack_ready: filteredRows.filter((r) => r.status === "pack_ready"),
    pushed: filteredRows.filter((r) => r.status === "pushed"),
    done: filteredRows.filter((r) => r.status === "done"),
  };

  const labels = configQuery.data?.labels ?? DEFAULT_LABELS;
  const threshold = configQuery.data?.cycle_time_threshold_hours ?? null;

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftLabels, setDraftLabels] = useState<Record<BoltStatus, string>>(DEFAULT_LABELS);
  const [draftThreshold, setDraftThreshold] = useState<string>("");

  useEffect(() => {
    if (configQuery.data) {
      setDraftLabels(configQuery.data.labels ?? DEFAULT_LABELS);
      setDraftThreshold(
        configQuery.data.cycle_time_threshold_hours != null ? String(configQuery.data.cycle_time_threshold_hours) : "",
      );
    }
  }, [configQuery.data]);

  function saveCustomization() {
    const parsedThreshold = draftThreshold.trim() ? Number(draftThreshold) : null;
    const config: BoltConfig = {
      labels: draftLabels,
      cycle_time_threshold_hours: parsedThreshold != null && !Number.isNaN(parsedThreshold) ? parsedThreshold : null,
    };
    saveConfig.mutate(config, {
      onSuccess: () => toast.success(t("bolts.customize.saved")),
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">{t("bolts.eyebrow")}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("bolts.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>{t("bolts.subtitle")}</p>
      </div>

      {!context && <SignInRequired unlocks={t("bolts.unlocksBolts")} />}

      {context && (
        <div className="space-y-6">
          <Callout>
            <p className="font-semibold">{t("bolts.explainer.title")}</p>
            <p className="mt-1 text-sm opacity-90">{t("bolts.explainer.body")}</p>
          </Callout>

          {(boltsQuery.isLoading || pmTasksQuery.isLoading) && (
            <div className="flex items-center gap-3 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {boltsQuery.error != null && <Callout variant="danger">{errMsg(boltsQuery.error)}</Callout>}

          {boltsQuery.data && (
            <>
              {rows.length === 0 ? (
                <Callout>{t("bolts.noneYet")}</Callout>
              ) : (
                <>
                  {/* Epic filter */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="bolts-epic-select" className="shrink-0 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {t("bolts.epicLabel")}
                    </label>
                    <div className="relative max-w-sm flex-1">
                      <select
                        id="bolts-epic-select"
                        value={epicFilter}
                        onChange={(e) => setEpicFilter(e.target.value)}
                        className={cn(
                          "w-full appearance-none rounded-lg border px-4 py-2.5 pr-9 text-sm font-medium transition cursor-pointer",
                          dark
                            ? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-violet-500 focus:border-violet-500 focus:outline-none"
                            : "border-slate-300 bg-white text-slate-800 hover:border-violet-400 focus:border-violet-500 focus:outline-none shadow-sm",
                        )}
                      >
                        <option value="__all__">{t("bolts.allEpics")} ({rows.length})</option>
                        {epics.map(([epic, count]) => (
                          <option key={epic} value={epic}>{epic} ({count})</option>
                        ))}
                      </select>
                      <ChevronRight className={cn(
                        "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90",
                        dark ? "text-neutral-500" : "text-slate-400",
                      )} />
                    </div>
                  </div>

                  {/* Board */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {STATUS_ORDER.map((status) => (
                      <div key={status} className={cn("rounded-lg border p-3", dark ? "border-neutral-700 bg-neutral-900/40" : "border-slate-200 bg-slate-50")}>
                        <div className="mb-3 flex items-center justify-between px-1">
                          <span className={cn("text-xs font-bold uppercase tracking-wider", dark ? "text-neutral-300" : "text-slate-600")}>
                            {labels[status]}
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")}>
                            {byStatus[status].length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {byStatus[status].map((row) => {
                            const overThreshold = threshold != null && row.elapsedHours != null && row.elapsedHours > threshold;
                            return (
                              <div
                                key={`${row.storyId}-${row.taskId}`}
                                className={cn(
                                  "rounded-md border p-3 text-sm",
                                  overThreshold
                                    ? dark ? "border-amber-700 bg-amber-950/30" : "border-amber-300 bg-amber-50"
                                    : dark ? "border-neutral-800 bg-neutral-950/40" : "border-slate-200 bg-white",
                                )}
                              >
                                <p className={cn("text-[11px] font-mono", mutedClass)}>
                                  {t("bolts.storyLabel", { storyId: row.storyId })} · {row.epicTitle}
                                </p>
                                <p className={cn("mt-0.5 truncate font-medium", dark ? "text-neutral-100" : "text-slate-800")}>
                                  {row.subject}
                                </p>
                                <div className="mt-1.5 flex items-center gap-2">
                                  {row.elapsedHours != null && (
                                    <span className={cn(
                                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
                                      overThreshold
                                        ? dark ? "bg-amber-900/60 text-amber-300" : "bg-amber-100 text-amber-700"
                                        : dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500",
                                    )}>
                                      {overThreshold ? <TriangleAlert className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                                      {row.elapsedHours}h
                                    </span>
                                  )}
                                  {status !== "done" && (
                                    <button
                                      onClick={() => boltStatusMut.mutate({ storyId: row.storyId, taskId: row.taskId, status: "done" })}
                                      disabled={boltStatusMut.isPending}
                                      className={cn("text-xs font-semibold hover:underline", dark ? "text-violet-400" : "text-violet-600")}
                                    >
                                      {t("phase3.markBoltDone")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {byStatus[status].length === 0 && (
                            <p className={cn("px-1 text-xs", mutedClass)}>{t("bolts.emptyColumn")}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Customize */}
              <div className={cn("overflow-hidden rounded-md border", dark ? "border-neutral-800" : "border-slate-200")}>
                <button
                  type="button"
                  onClick={() => setCustomizeOpen((v) => !v)}
                  className={cn("flex w-full items-center justify-between px-4 py-3 text-left", dark ? "bg-neutral-900" : "bg-slate-50")}
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-violet-500" />
                    <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>{t("bolts.customize.title")}</span>
                  </span>
                  <ChevronRight className={cn("h-4 w-4 transition-transform", mutedClass, customizeOpen && "rotate-90")} />
                </button>
                {customizeOpen && (
                  <div className={cn("space-y-3 border-t px-4 py-4", dark ? "border-neutral-800" : "border-slate-100")}>
                    <p className={cn("text-xs", mutedClass)}>{t("bolts.customize.desc")}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {STATUS_ORDER.map((status) => (
                        <div key={status}>
                          <label className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wider", mutedClass)}>
                            {DEFAULT_LABELS[status]}
                          </label>
                          <Input
                            value={draftLabels[status]}
                            onChange={(e) => setDraftLabels((prev) => ({ ...prev, [status]: e.target.value }))}
                            maxLength={40}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="max-w-xs">
                      <label className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wider", mutedClass)}>
                        {t("bolts.customize.thresholdLabel")}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        placeholder={t("bolts.customize.thresholdPlaceholder")}
                        value={draftThreshold}
                        onChange={(e) => setDraftThreshold(e.target.value)}
                      />
                    </div>
                    <Button onClick={saveCustomization} disabled={saveConfig.isPending}>
                      {saveConfig.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}</>
                        : <><Layers className="h-4 w-4" /> {t("common.save")}</>}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
