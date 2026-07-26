"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Layers, Loader2, Plus, SlidersHorizontal, TriangleAlert, X, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Callout, Input } from "@/components/ui/primitives";
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

// "pack_ready" and "done" are fixed anchors — always first/last column, never
// deletable/reorderable (see src/context_manager.py valid_bolt_statuses()).
// "pushed" is a protected *stage* — always present, renameable and
// reorderable among the other stages, but never removable (the Phase 3
// push-to-PM flow sets it automatically, independent of this page).
const PACK_READY_KEY = "pack_ready";
const DONE_KEY = "done";
const PROTECTED_STAGE_KEY = "pushed";

const DEFAULT_CONFIG: BoltConfig = {
  pack_ready_label: "Pack Ready",
  done_label: "Done",
  stages: [{ key: "pushed", label: "Pushed" }],
  cycle_time_threshold_hours: null,
};

type Column = { key: string; label: string };

type MergedBolt = {
  storyId: number;
  storyTitle: string;
  epicTitle: string;
  taskId: number;
  status: string;
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
  // Keyed by "storyId:taskId", not taskId alone — task ids restart at 1 per
  // story, so a plain task-id key would disable/re-enable the wrong card's
  // button across different stories sharing the same task number.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const config = configQuery.data ?? DEFAULT_CONFIG;
  const columns: Column[] = useMemo(() => [
    { key: PACK_READY_KEY, label: config.pack_ready_label },
    ...config.stages.map((s) => ({ key: s.key, label: s.label })),
    { key: DONE_KEY, label: config.done_label },
  ], [config]);

  function nextColumnFor(status: string): Column | null {
    const idx = columns.findIndex((c) => c.key === status);
    if (idx < 0 || idx >= columns.length - 1) return null;
    return columns[idx + 1];
  }

  function prevColumnFor(status: string): Column | null {
    const idx = columns.findIndex((c) => c.key === status);
    if (idx <= 0) return null;
    return columns[idx - 1];
  }

  function moveBolt(storyId: number, taskId: number, status: string, currentStatus?: string) {
    if (status === PACK_READY_KEY) {
      toast.error(t("bolts.dropRejectedPackReady"));
      return;
    }
    if (status === currentStatus) return; // no-op move (e.g. dropped back on its own column) — don't pollute status_history
    const key = `${storyId}:${taskId}`;
    setPendingKey(key);
    boltStatusMut.mutate({ storyId, taskId, status }, { onSettled: () => setPendingKey(null) });
  }

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
  // Keyed by "storyId:taskId", NOT taskId alone — task ids are sequential
  // PER STORY (Task #1, #2, ...), so two different stories' Task #2 would
  // otherwise collide and show the same subject text on both cards.
  const subjectById = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of pmTasksQuery.data ?? []) {
      const { apex_task_id } = decodeApexMeta(task.description);
      if (apex_task_id != null) map.set(`${Number(task.user_story)}:${apex_task_id}`, task.subject);
    }
    return map;
  }, [pmTasksQuery.data]);

  const rows: MergedBolt[] = useMemo(() => {
    return (boltsQuery.data?.bolts ?? []).map((b) => ({
      storyId: b.story_id,
      storyTitle: b.story_title,
      epicTitle: b.epic_title || "Ungrouped",
      taskId: b.task_id,
      status: b.status,
      subject: subjectById.get(`${b.story_id}:${b.task_id}`) ?? `Task #${b.task_id}`,
      cycleHours: b.cycle_hours,
      elapsedHours: b.status === DONE_KEY
        ? b.cycle_hours
        : (() => {
            const start = earliestTimestamp(b.status_history, [PACK_READY_KEY, PROTECTED_STAGE_KEY]);
            return start != null ? Math.round(((Date.now() - start) / 3_600_000) * 100) / 100 : null;
          })(),
    }));
  }, [boltsQuery.data, subjectById]);

  const [epicFilter, setEpicFilter] = useState<string>("__all__");
  const [storyFilter, setStoryFilter] = useState<number | "__all__">("__all__");

  // Switching projects doesn't remount this component (same route), so a
  // stale epic/story title from the previous project would otherwise filter
  // every row out and render a fully empty board with no indication why.
  useEffect(() => {
    setEpicFilter("__all__");
    setStoryFilter("__all__");
  }, [context?.projectId]);

  const epics = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.epicTitle, (map.get(r.epicTitle) ?? 0) + 1);
    return [...map.entries()];
  }, [rows]);

  const epicScopedRows = epicFilter === "__all__" ? rows : rows.filter((r) => r.epicTitle === epicFilter);

  // Stories available to drill into, scoped to whichever epic is selected —
  // this is what lets you pick an epic, then a story of that epic, then see
  // a board of just that story's tasks.
  const stories = useMemo(() => {
    const map = new Map<number, { title: string; count: number }>();
    for (const r of epicScopedRows) {
      const cur = map.get(r.storyId);
      map.set(r.storyId, { title: r.storyTitle, count: (cur?.count ?? 0) + 1 });
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [epicScopedRows]);

  const filteredRows = storyFilter === "__all__" ? epicScopedRows : epicScopedRows.filter((r) => r.storyId === storyFilter);

  // Bucketed by the current columns; a bolt whose status matches no current
  // column (only reachable if the config changed underneath an existing
  // bolt) falls into "other" instead of silently disappearing.
  const { byKey, other } = useMemo(() => {
    const map = new Map<string, MergedBolt[]>();
    for (const col of columns) map.set(col.key, []);
    const extra: MergedBolt[] = [];
    for (const row of filteredRows) {
      const bucket = map.get(row.status);
      if (bucket) bucket.push(row);
      else extra.push(row);
    }
    return { byKey: map, other: extra };
  }, [filteredRows, columns]);

  const threshold = config.cycle_time_threshold_hours;

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<BoltConfig>(DEFAULT_CONFIG);
  const [draftThreshold, setDraftThreshold] = useState<string>("");
  const [newStageLabel, setNewStageLabel] = useState("");

  useEffect(() => {
    if (configQuery.data) {
      setDraftConfig(configQuery.data);
      setDraftThreshold(
        configQuery.data.cycle_time_threshold_hours != null ? String(configQuery.data.cycle_time_threshold_hours) : "",
      );
    }
  }, [configQuery.data]);

  function persistConfig(next: BoltConfig, successToast?: string) {
    // Optimistic: without this, two structural ops fired in quick succession
    // (e.g. clicking "Add stage" twice fast) would both read the same
    // not-yet-confirmed draftConfig/config snapshot and the second call would
    // silently clobber the first. Roll back on failure since this is now an
    // optimistic update rather than a no-op until the round trip completes.
    setDraftConfig(next);
    saveConfig.mutate(next, {
      onSuccess: (saved) => {
        setDraftConfig(saved);
        if (successToast) toast.success(successToast);
      },
      onError: (e) => {
        toast.error(errMsg(e));
        if (configQuery.data) setDraftConfig(configQuery.data);
      },
    });
  }

  function saveCustomization() {
    const parsedThreshold = draftThreshold.trim() ? Number(draftThreshold) : null;
    persistConfig(
      { ...draftConfig, cycle_time_threshold_hours: parsedThreshold != null && !Number.isNaN(parsedThreshold) ? parsedThreshold : null },
      t("bolts.customize.saved"),
    );
  }

  function restoreDefaults() {
    setDraftThreshold("");
    persistConfig(DEFAULT_CONFIG, t("bolts.customize.defaultsRestored"));
  }

  // These four are pure stage-LIST operations and auto-persist immediately
  // (unlike label/threshold edits, which stay local until "Save"). They
  // build off `config` (last-confirmed server state) for pack_ready_label/
  // done_label/threshold — NOT `draftConfig`, which may be holding an
  // in-progress, not-yet-saved label edit that a structural drag/click
  // shouldn't silently commit as a side effect. The stage list itself still
  // reads from `draftConfig.stages`, which persistConfig now updates
  // optimistically, so rapid consecutive calls (e.g. two fast "Add stage"
  // clicks) compose on top of each other instead of racing.
  function addStage() {
    const label = newStageLabel.trim();
    if (!label) return;
    setNewStageLabel("");
    persistConfig({ ...config, stages: [...draftConfig.stages, { key: "", label }] });
  }

  function removeStage(key: string) {
    persistConfig({ ...config, stages: draftConfig.stages.filter((s) => s.key !== key) });
  }

  function renameStage(key: string, label: string) {
    setDraftConfig((prev) => ({ ...prev, stages: prev.stages.map((s) => (s.key === key ? { ...s, label } : s)) }));
  }

  function moveStage(key: string, delta: -1 | 1) {
    const idx = draftConfig.stages.findIndex((s) => s.key === key);
    const swapIdx = idx + delta;
    if (idx < 0 || swapIdx < 0 || swapIdx >= draftConfig.stages.length) return;
    const next = [...draftConfig.stages];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persistConfig({ ...config, stages: next });
  }

  function reorderStages(fromKey: string, toKey: string) {
    const stages = draftConfig.stages;
    const moved = stages.find((s) => s.key === fromKey);
    const rest = stages.filter((s) => s.key !== fromKey);
    const insertAt = rest.findIndex((s) => s.key === toKey);
    if (!moved || insertAt < 0) return;
    rest.splice(insertAt, 0, moved);
    persistConfig({ ...config, stages: rest });
  }

  const customizeChanged = useMemo(() => {
    const stagesChanged = JSON.stringify(draftConfig.stages) !== JSON.stringify(DEFAULT_CONFIG.stages);
    const labelsChanged = draftConfig.pack_ready_label !== DEFAULT_CONFIG.pack_ready_label
      || draftConfig.done_label !== DEFAULT_CONFIG.done_label;
    return stagesChanged || labelsChanged || draftThreshold.trim() !== "";
  }, [draftConfig, draftThreshold]);

  // Card drag (moving a bolt between columns).
  const [draggedBolt, setDraggedBolt] = useState<{ storyId: number; taskId: number; status: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  // Column drag (reordering the custom stages between the fixed anchors).
  const [draggedStageKey, setDraggedStageKey] = useState<string | null>(null);
  const [dragOverStageKey, setDragOverStageKey] = useState<string | null>(null);

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
          {configQuery.error != null && <Callout variant="danger">{errMsg(configQuery.error)}</Callout>}

          {boltsQuery.data && (
            <>
              {rows.length === 0 ? (
                <Callout>{t("bolts.noneYet")}</Callout>
              ) : (
                <>
                  {/* Epic + story drill-down */}
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="bolts-epic-select" className="shrink-0 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {t("bolts.epicLabel")}
                    </label>
                    <div className="relative max-w-sm flex-1">
                      <select
                        id="bolts-epic-select"
                        value={epicFilter}
                        onChange={(e) => { setEpicFilter(e.target.value); setStoryFilter("__all__"); }}
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
                    <label htmlFor="bolts-story-select" className="shrink-0 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {t("bolts.storyLabelFilter")}
                    </label>
                    <div className="relative max-w-sm flex-1">
                      <select
                        id="bolts-story-select"
                        value={storyFilter}
                        onChange={(e) => setStoryFilter(e.target.value === "__all__" ? "__all__" : Number(e.target.value))}
                        className={cn(
                          "w-full appearance-none rounded-lg border px-4 py-2.5 pr-9 text-sm font-medium transition cursor-pointer",
                          dark
                            ? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-violet-500 focus:border-violet-500 focus:outline-none"
                            : "border-slate-300 bg-white text-slate-800 hover:border-violet-400 focus:border-violet-500 focus:outline-none shadow-sm",
                        )}
                      >
                        <option value="__all__">{t("bolts.allStories")} ({epicScopedRows.length})</option>
                        {stories.map(([storyId, s]) => (
                          <option key={storyId} value={storyId}>
                            {t("bolts.storyLabel", { storyId })} · {s.title} ({s.count})
                          </option>
                        ))}
                      </select>
                      <ChevronRight className={cn(
                        "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90",
                        dark ? "text-neutral-500" : "text-slate-400",
                      )} />
                    </div>
                  </div>

                  {/* Board */}
                  <div className="overflow-x-auto">
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))` }}>
                      {columns.map((col) => {
                        const isAnchor = col.key === PACK_READY_KEY || col.key === DONE_KEY;
                        const colBolts = byKey.get(col.key) ?? [];
                        return (
                          <div
                            key={col.key}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (draggedBolt) setDragOverColumn(col.key);
                              else if (draggedStageKey && !isAnchor) setDragOverStageKey(col.key);
                            }}
                            onDragLeave={() => {
                              setDragOverColumn((cur) => (cur === col.key ? null : cur));
                              setDragOverStageKey((cur) => (cur === col.key ? null : cur));
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedBolt) {
                                moveBolt(draggedBolt.storyId, draggedBolt.taskId, col.key, draggedBolt.status);
                              } else if (draggedStageKey && !isAnchor && draggedStageKey !== col.key) {
                                reorderStages(draggedStageKey, col.key);
                              }
                              setDraggedBolt(null);
                              setDragOverColumn(null);
                              setDraggedStageKey(null);
                              setDragOverStageKey(null);
                            }}
                            className={cn(
                              "rounded-lg border p-3 transition-colors",
                              dark ? "border-neutral-700 bg-neutral-900/40" : "border-slate-200 bg-slate-50",
                              (dragOverColumn === col.key || dragOverStageKey === col.key) && (dark ? "border-violet-500 bg-violet-500/5" : "border-violet-400 bg-violet-50"),
                            )}
                          >
                            <div className="mb-3 flex items-center gap-1.5 px-1">
                              {!isAnchor && (
                                <div
                                  draggable
                                  onDragStart={(e) => {
                                    setDraggedStageKey(col.key);
                                    e.dataTransfer.effectAllowed = "move";
                                    // Firefox refuses to start an HTML5 drag with no data payload.
                                    e.dataTransfer.setData("text/plain", col.key);
                                  }}
                                  onDragEnd={() => { setDraggedStageKey(null); setDragOverStageKey(null); }}
                                  onKeyDown={(e) => {
                                    if (e.key === "ArrowLeft") { e.preventDefault(); moveStage(col.key, -1); }
                                    else if (e.key === "ArrowRight") { e.preventDefault(); moveStage(col.key, 1); }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  title={t("bolts.dragToReorderColumn")}
                                  aria-label={t("bolts.dragToReorderColumn")}
                                  className={cn(
                                    "-ml-1 flex size-5 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                                    dark ? "text-neutral-600 hover:text-neutral-400" : "text-slate-400 hover:text-slate-600",
                                  )}
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                              )}
                              <span className={cn("flex-1 truncate text-xs font-bold uppercase tracking-wider", dark ? "text-neutral-300" : "text-slate-600")}>
                                {col.label}
                              </span>
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")}>
                                {colBolts.length}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {colBolts.map((row) => {
                                const overThreshold = threshold != null && row.elapsedHours != null && row.elapsedHours > threshold;
                                const next = nextColumnFor(row.status);
                                const prev = prevColumnFor(row.status);
                                const rowKey = `${row.storyId}:${row.taskId}`;
                                const isPending = pendingKey === rowKey;
                                return (
                                  <div
                                    key={`${row.storyId}-${row.taskId}`}
                                    draggable
                                    onDragStart={(e) => {
                                      setDraggedBolt({ storyId: row.storyId, taskId: row.taskId, status: row.status });
                                      e.dataTransfer.effectAllowed = "move";
                                      // Firefox refuses to start an HTML5 drag with no data payload.
                                      e.dataTransfer.setData("text/plain", rowKey);
                                    }}
                                    onDragEnd={() => setDraggedBolt(null)}
                                    className={cn(
                                      "cursor-grab rounded-md border p-3 text-sm active:cursor-grabbing",
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
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
                                      {/* Buttons (not just drag) let keyboard/touch/Firefox users move a
                                          card either direction without relying on HTML5 drag-and-drop. */}
                                      {prev && (
                                        <button
                                          onClick={() => moveBolt(row.storyId, row.taskId, prev.key, row.status)}
                                          disabled={isPending}
                                          className={cn("flex items-center gap-0.5 text-xs font-medium hover:underline disabled:opacity-50", mutedClass)}
                                        >
                                          <ChevronLeft className="h-3 w-3" /> {t("bolts.moveBack")}
                                        </button>
                                      )}
                                      {next && (
                                        <button
                                          onClick={() => moveBolt(row.storyId, row.taskId, next.key, row.status)}
                                          disabled={isPending}
                                          className={cn("text-xs font-semibold hover:underline disabled:opacity-50", dark ? "text-violet-400" : "text-violet-600")}
                                        >
                                          {isPending ? t("common.saving") : t("bolts.moveToNext", { label: next.label })}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              {colBolts.length === 0 && (
                                <p className={cn("px-1 text-xs", mutedClass)}>{t("bolts.emptyColumn")}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {other.length > 0 && (
                    <Callout variant="warning">
                      <p className="font-semibold">{t("bolts.otherColumn")} ({other.length})</p>
                      <div className="mt-2 space-y-2 text-xs opacity-90">
                        {other.map((row) => {
                          const rowKey = `${row.storyId}:${row.taskId}`;
                          return (
                            <div key={`${row.storyId}-${row.taskId}`} className="flex flex-wrap items-center gap-2">
                              <span>{t("bolts.storyLabel", { storyId: row.storyId })} · {row.subject} — {row.status}</span>
                              <select
                                aria-label={t("bolts.reassignLabel")}
                                value=""
                                disabled={pendingKey === rowKey}
                                onChange={(e) => { if (e.target.value) moveBolt(row.storyId, row.taskId, e.target.value, row.status); }}
                                className={cn(
                                  "rounded border px-2 py-1 text-xs",
                                  dark ? "border-neutral-700 bg-neutral-900 text-neutral-200" : "border-slate-300 bg-white text-slate-700",
                                )}
                              >
                                <option value="" disabled>{t("bolts.reassignPrompt")}</option>
                                {columns.map((c) => (
                                  <option key={c.key} value={c.key}>{c.label}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </Callout>
                  )}
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
                  <div className={cn("space-y-4 border-t px-4 py-4", dark ? "border-neutral-800" : "border-slate-100")}>
                    <p className={cn("text-xs", mutedClass)}>{t("bolts.customize.desc")}</p>

                    {/* Pinned anchors — rename only */}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wider", mutedClass)}>
                          {DEFAULT_CONFIG.pack_ready_label}
                        </label>
                        <Input
                          value={draftConfig.pack_ready_label}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, pack_ready_label: e.target.value }))}
                          maxLength={60}
                        />
                      </div>
                      <div>
                        <label className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wider", mutedClass)}>
                          {DEFAULT_CONFIG.done_label}
                        </label>
                        <Input
                          value={draftConfig.done_label}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, done_label: e.target.value }))}
                          maxLength={60}
                        />
                      </div>
                    </div>

                    {/* Custom stages — add / rename / remove / reorder */}
                    <div>
                      <label className={cn("mb-1.5 block text-[11px] font-semibold uppercase tracking-wider", mutedClass)}>
                        {t("bolts.customize.stagesLabel")}
                      </label>
                      <div className="space-y-1.5">
                        {draftConfig.stages.map((stage, i) => {
                          const protectedStage = stage.key === PROTECTED_STAGE_KEY;
                          return (
                            <div key={stage.key || `new-${i}`} className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowUp") { e.preventDefault(); moveStage(stage.key, -1); }
                                  else if (e.key === "ArrowDown") { e.preventDefault(); moveStage(stage.key, 1); }
                                }}
                                aria-label={t("bolts.dragToReorderColumn")}
                                title={t("bolts.dragToReorderColumn")}
                                className={cn("flex size-6 shrink-0 items-center justify-center rounded", dark ? "text-neutral-600 hover:text-neutral-400" : "text-slate-400 hover:text-slate-600")}
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <Input
                                value={stage.label}
                                onChange={(e) => renameStage(stage.key, e.target.value)}
                                maxLength={60}
                                className="flex-1"
                              />
                              <button
                                type="button"
                                onClick={() => !protectedStage && removeStage(stage.key)}
                                disabled={protectedStage || saveConfig.isPending}
                                title={protectedStage ? t("bolts.customize.removeProtected") : t("bolts.customize.removeStage")}
                                aria-label={protectedStage ? t("bolts.customize.removeProtected") : t("bolts.customize.removeStage")}
                                className={cn(
                                  "flex size-8 shrink-0 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-30",
                                  dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-red-400" : "text-slate-400 hover:bg-slate-100 hover:text-red-600",
                                )}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Input
                          value={newStageLabel}
                          onChange={(e) => setNewStageLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStage(); } }}
                          placeholder={t("bolts.customize.newStagePlaceholder")}
                          maxLength={60}
                          className="flex-1"
                        />
                        <Button
                          variant="secondary"
                          onClick={addStage}
                          disabled={!newStageLabel.trim() || saveConfig.isPending || draftConfig.stages.length >= 10}
                        >
                          <Plus className="h-4 w-4" /> {t("bolts.customize.addStage")}
                        </Button>
                      </div>
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
                    <div className="flex gap-2">
                      <Button onClick={saveCustomization} disabled={saveConfig.isPending}>
                        {saveConfig.isPending
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}</>
                          : <><Layers className="h-4 w-4" /> {t("common.save")}</>}
                      </Button>
                      <Button variant="secondary" onClick={restoreDefaults} disabled={saveConfig.isPending || !customizeChanged}>
                        {t("bolts.customize.restoreDefaults")}
                      </Button>
                    </div>
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
