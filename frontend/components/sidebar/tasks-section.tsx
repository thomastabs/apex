"use client";
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { decodeApexMeta, encodeApexMeta } from "@/lib/hooks/use-phase3";
import { useAutoSyncStoryIndex } from "@/lib/hooks/use-workspace";
import { deleteProposal } from "@/lib/api/phase3";
import { toPmCtx } from "@/lib/api/workspace";
import type { EffortEstimate } from "@/lib/api/types";
import type { PmTask } from "@/lib/api/pm-types";
import { getPmAdapter } from "@/lib/api/pm-factory";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { PanelHeader, type DragSectionProps } from "./shared";
import { EFFORT_COLORS } from "@/lib/effort-colors";

type TasksSectionProps = DragSectionProps & { dark: boolean };

type StoryGroup = {
  story_id: number;
  story_ref: string | number;
  story_subject: string;
  tasks: PmTask[];
};

function DeleteTaskDialog({
  task,
  dark,
  onConfirm,
  onCancel,
  isPending,
}: {
  task: { id: string; ref: string | number; subject: string };
  dark: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onCancel}
    >
      <div
        className={cn("w-full max-w-sm rounded-xl border p-5 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={cn("mb-1 text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>
          Delete task #{task.ref}?
        </p>
        <p className={cn("mb-4 text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
          &ldquo;{task.subject}&rdquo; will be permanently deleted.
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded bg-red-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const EFFORT_OPTIONS: EffortEstimate[] = ["XS", "S", "M", "L", "XL"];
const EFFORT_LABELS_DIALOG: Record<EffortEstimate, string> = { XS: "XS (1 pt)", S: "S (2 pts)", M: "M (3 pts)", L: "L (5 pts)", XL: "XL (8 pts)" };

function TaskEditDialog({
  task,
  dark,
  onSave,
  onClose,
  isPending,
  validTaskIds,
}: {
  task: {
    id: string; ref?: string | number; subject: string; description: string;
    effort_estimate: EffortEstimate; covered_scenarios: string[]; predecessor_task_ids: number[];
    version: string | number;
  };
  dark: boolean;
  onSave: (subject: string, description: string, effort: EffortEstimate, scenarios: string[], deps: number[]) => void;
  onClose: () => void;
  isPending: boolean;
  validTaskIds?: number[];
}) {
  const [subject, setSubject] = useState(task.subject);
  const [description, setDescription] = useState(task.description);
  const [effort, setEffort] = useState<EffortEstimate>(task.effort_estimate);
  const [scenariosText, setScenariosText] = useState(task.covered_scenarios.join("\n"));
  const [depsText, setDepsText] = useState(task.predecessor_task_ids.join(", "));

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );
  const labelClass = cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600");

  const handleSave = () => {
    const scenarios = scenariosText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const rawDeps = depsText.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    const deps = validTaskIds ? rawDeps.filter((n) => validTaskIds.includes(n)) : rawDeps;
    onSave(subject.trim(), description, effort, scenarios, deps);
  };

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>
          {task.ref ? `Task #${task.ref}` : "Edit Task"}
        </h3>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Subject</label>
            <input className={cn("h-9", inputClass)} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Task subject" autoFocus />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={cn("h-32 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this task…" />
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <label className={labelClass}>Effort</label>
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value as EffortEstimate)}
                className={cn("rounded border px-2 py-1.5 text-xs", dark ? "border-neutral-700 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-900")}
              >
                {EFFORT_OPTIONS.map((e) => <option key={e} value={e}>{EFFORT_LABELS_DIALOG[e]}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <label className={labelClass}>
                Depends on tasks{" "}
                <span className={cn("font-normal", dark ? "text-neutral-600" : "text-slate-400")}>
                  {validTaskIds && validTaskIds.length > 0
                    ? `(valid: ${validTaskIds.join(", ")})`
                    : "(Phase 3 task numbers, comma-separated)"}
                </span>
              </label>
              <input className={cn("h-8", inputClass)} value={depsText} onChange={(e) => setDepsText(e.target.value)} placeholder="e.g. 1, 2" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Covered scenarios <span className={cn("font-normal", dark ? "text-neutral-600" : "text-slate-400")}>(one per line)</span></label>
            <textarea className={cn("h-20 resize-none py-2", inputClass)} value={scenariosText} onChange={(e) => setScenariosText(e.target.value)} placeholder="Scenario: …&#10;Scenario: …" />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={isPending || !subject.trim()}
            onClick={handleSave}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function TasksSection({ dark, shellClass, dragHandlers, onDragStart }: TasksSectionProps) {
  const darkTheme = useUiStore((s) => s.theme) === "dark";
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedStories, setExpandedStories] = useState<Set<number>>(new Set());
  const [editingTask, setEditingTask] = useState<{
    id: string; subject: string; description: string; version: string | number;
    storyId: number; effort_estimate: EffortEstimate; covered_scenarios: string[]; predecessor_task_ids: number[];
    ref?: string | number;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; ref: string | number; subject: string } | null>(null);
  const [addingToStory, setAddingToStory] = useState<number | null>(null);
  const [newTaskSubject, setNewTaskSubject] = useState("");

  const context = useApiContext();
  const queryClient = useQueryClient();
  const { selectedStoryId, taskList, currentStoryMeta, patchTask } = usePhase3Store();

  const QUERY_KEY = ["pm", "project-tasks", context?.projectId];

  const adapter = getPmAdapter(context?.pmTool);
  const adapterCtx = context ? toPmCtx(context) : null;

  const { data: pmTasks = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => adapter.getProjectTasks(adapterCtx!),
    enabled: Boolean(context),
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const loadForEditMut = useMutation({
    mutationFn: (taskId: string) => adapter.getTask(adapterCtx!, taskId),
    onSuccess: (task) => {
      const decoded = decodeApexMeta(task.description);
      setEditingTask({
        id: task.id, ref: task.ref, subject: task.subject, description: decoded.description,
        version: task.version, storyId: Number(task.user_story),
        effort_estimate: decoded.effort_estimate, covered_scenarios: decoded.covered_scenarios,
        predecessor_task_ids: decoded.predecessor_task_ids,
      });
    },
    onError: (err) => toast.error(adapter.errMsg(err, "Load task")),
  });

  const updateMut = useMutation({
    mutationFn: async (v: {
      id: string; version: string | number; subject: string; description: string; storyId: number;
      effort_estimate: EffortEstimate; covered_scenarios: string[]; predecessor_task_ids: number[];
    }) => {
      if (!adapterCtx) throw new Error("No context.");
      const fullDesc = encodeApexMeta({
        id: 0, subject: v.subject, description: v.description,
        effort_estimate: v.effort_estimate, covered_scenarios: v.covered_scenarios,
        predecessor_task_ids: v.predecessor_task_ids,
      });
      let ver = v.version;
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          await adapter.updateTask(adapterCtx, v.id, ver, { subject: v.subject, description: fullDesc });
          return;
        } catch (err) {
          if (adapter.isPmVersionConflict(err) && attempt === 0) {
            const refreshed = await adapter.getTask(adapterCtx, v.id);
            ver = refreshed.version;
          } else throw err;
        }
      }
    },
    onSuccess: (_, v) => {
      const freshList = usePhase3Store.getState().taskList;
      const local = freshList.find((t) => (t.pm_task_id ?? String(t.taiga_task_id)) === v.id);
      if (local) {
        patchTask(local.id, {
          subject: v.subject, description: v.description,
          effort_estimate: v.effort_estimate, covered_scenarios: v.covered_scenarios,
          predecessor_task_ids: v.predecessor_task_ids,
        });
      }
      setEditingTask(null);
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-list", context?.projectId, v.storyId] });
      toast.success(local ? "Task saved and synced to Phase 3." : "Task saved.");
    },
    onError: (err) => toast.error(adapter.errMsg(err, "Update task")),
  });

  const autoSync = useAutoSyncStoryIndex();

  const deleteMut = useMutation({
    mutationFn: async (taskId: string) => {
      if (!adapterCtx) throw new Error("No context.");
      // Capture Apex metadata before the PM task disappears — needed to drop
      // the orphaned developer pack so the story stops counting as "proposed".
      // Fetch the task fresh rather than trusting the pmTasks cache, which may
      // be empty/stale when delete fires before the board loads (audit M5);
      // fall back to the cache only if the detail fetch fails.
      let storyId: number | null = null;
      let apexTaskId: number | null = null;
      try {
        const task = await adapter.getTask(adapterCtx, taskId);
        const decoded = decodeApexMeta(task.description ?? "");
        storyId = Number(task.user_story);
        apexTaskId = decoded.apex_task_id ?? null;
      } catch {
        const cached = pmTasks.find((t) => String(t.id) === taskId);
        const decoded = cached ? decodeApexMeta(cached.description ?? "") : null;
        storyId = cached ? Number(cached.user_story) : null;
        apexTaskId = decoded?.apex_task_id ?? null;
      }
      await adapter.deleteTask(adapterCtx, taskId);
      return { storyId, apexTaskId };
    },
    onSuccess: ({ storyId, apexTaskId }) => {
      setPendingDelete(null);
      void invalidate();
      const cleanup = storyId && apexTaskId && context
        ? deleteProposal(context, storyId, apexTaskId).catch(() => undefined)
        : Promise.resolve();
      void cleanup.then(() => autoSync());
      toast.success("Task deleted.");
    },
    onError: (err) => { setPendingDelete(null); toast.error(adapter.errMsg(err, "Delete task")); },
  });

  const addMut = useMutation({
    mutationFn: (v: { storyId: number; subject: string }) =>
      adapter.createTask(adapterCtx!, String(v.storyId), v.subject, ""),
    onSuccess: () => { setAddingToStory(null); setNewTaskSubject(""); void invalidate(); autoSync(); toast.success("Task added."); },
    onError: (err) => toast.error(adapter.errMsg(err, "Add task")),
  });

  const effortByStoryTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of pmTasks) {
      const desc = t.description ?? "";
      if (!desc.includes("**Apex Metadata**") && !desc.includes("apex-meta:")) continue;
      const { effort_estimate } = decodeApexMeta(desc);
      if (effort_estimate) map.set(`${Number(t.user_story)}:${t.subject}`, effort_estimate);
    }
    return map;
  }, [pmTasks]);

  const allStoryGroups = useMemo<StoryGroup[]>(() => {
    const groups = new Map<number, StoryGroup>();
    for (const t of pmTasks) {
      const sid = Number(t.user_story);
      if (!groups.has(sid)) {
        groups.set(sid, { story_id: sid, story_ref: t.user_story_ref, story_subject: t.user_story_subject, tasks: [] });
      }
      groups.get(sid)!.tasks.push(t);
    }
    const result = Array.from(groups.values()).sort((a, b) => a.story_id - b.story_id);
    if (selectedStoryId !== null && taskList.length > 0 && !groups.has(selectedStoryId)) {
      result.unshift({
        story_id: selectedStoryId,
        story_ref: selectedStoryId,
        story_subject: currentStoryMeta.title,
        tasks: taskList.map((t, i) => ({
          id: String(-(i + 1)), ref: 0, subject: t.subject, description: "",
          version: 1, user_story: selectedStoryId, user_story_ref: selectedStoryId, user_story_subject: currentStoryMeta.title,
        })),
      });
    }
    return result;
  }, [pmTasks, selectedStoryId, taskList, currentStoryMeta]);

  const q = filter.toLowerCase().trim();
  const storyGroups = useMemo(() => {
    if (!q) return allStoryGroups;
    return allStoryGroups
      .map((g) => {
        const storyMatch = g.story_subject.toLowerCase().includes(q) || `us#${g.story_ref}`.includes(q);
        const filteredTasks = storyMatch ? g.tasks : g.tasks.filter((t) => t.subject.toLowerCase().includes(q));
        return filteredTasks.length > 0 ? { ...g, tasks: filteredTasks } : null;
      })
      .filter(Boolean) as StoryGroup[];
  }, [allStoryGroups, q]);

  const totalTasks = allStoryGroups.reduce((s, g) => s + g.tasks.length, 0);

  const toggleStory = (id: number) =>
    setExpandedStories((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";
  const inputClass = cn(
    "w-full rounded border px-2 py-1 text-xs",
    dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-slate-300 bg-white text-slate-900",
  );

  const filterBtn = (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); if (context) void invalidate(); }}
        disabled={!context || isFetching}
        title="Refresh task list from the PM tool"
        className={cn(
          "rounded p-1 transition-colors disabled:opacity-40",
          dark ? "text-neutral-600 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setFilterOpen((v) => !v); if (filterOpen) setFilter(""); }}
        className={cn(
          "rounded px-2 py-1 text-xs font-medium transition-colors",
          filterOpen || filter
            ? "bg-violet-500/20 text-violet-400"
            : dark ? "text-neutral-400 hover:text-neutral-300" : "text-slate-600 hover:text-slate-700",
        )}
      >
        Filter
      </button>
    </div>
  );

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      {typeof document !== "undefined" && pendingDelete ? createPortal(
        <DeleteTaskDialog
          task={pendingDelete}
          dark={darkTheme}
          onConfirm={() => deleteMut.mutate(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
          isPending={deleteMut.isPending}
        />,
        document.body,
      ) : null}

      {typeof document !== "undefined" && editingTask ? createPortal(
        <TaskEditDialog
          task={editingTask}
          dark={darkTheme}
          onSave={(subject, description, effort_estimate, covered_scenarios, predecessor_task_ids) =>
            updateMut.mutate({ id: editingTask.id, version: editingTask.version, storyId: editingTask.storyId, subject, description, effort_estimate, covered_scenarios, predecessor_task_ids })
          }
          onClose={() => setEditingTask(null)}
          isPending={updateMut.isPending}
          validTaskIds={
            editingTask.storyId === selectedStoryId && taskList.length > 0
              ? taskList.filter((t) => (t.pm_task_id ?? String(t.taiga_task_id)) !== editingTask.id).map((t) => t.id)
              : undefined
          }
        />,
        document.body,
      ) : null}

      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<ClipboardList className="size-4" />}
          title="Task Board"
          badge={totalTasks > 0 ? String(totalTasks) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
          actions={filterBtn}
        />

        {open && (
          <div className={cn("py-1", expandedPanelClass)}>
            {filterOpen && (
              <div className="relative px-3 pb-2 pt-1">
                <input
                  autoFocus
                  className={inputClass}
                  placeholder="Filter stories or tasks…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {filter && (
                  <button onClick={() => setFilter("")} className={cn("absolute right-5 top-1/2 -translate-y-1/2", subduedTextClass)}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-neutral-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : isError ? (
              <div className={cn("mx-4 my-3 flex items-center justify-between gap-2 rounded border px-2.5 py-2 text-xs", dark ? "border-red-900/50 text-red-400" : "border-red-200 text-red-600")}>
                <span>Failed to load tasks.</span>
                <button onClick={() => refetch()} className="shrink-0 font-semibold underline">Retry</button>
              </div>
            ) : storyGroups.length === 0 ? (
              <p className={cn("px-4 py-3 text-sm", subduedTextClass)}>
                {q ? "No tasks match your filter." : "No tasks pushed yet."}
              </p>
            ) : storyGroups.map((group) => {
              const isExpanded = expandedStories.has(group.story_id);
              const isPending = group.tasks.some((t) => Number(t.id) < 0);
              return (
                <div key={group.story_id} className={cn("border-b last:border-b-0", sectionBorderClass)}>
                  <div className="flex items-center gap-1 px-2 py-2">
                    <button
                      onClick={() => toggleStory(group.story_id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      {isExpanded
                        ? <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", subduedTextClass)} />
                        : <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", subduedTextClass)} />}
                      <span className={cn("font-mono text-xs shrink-0", dark ? "text-violet-400" : "text-violet-700")}>
                        US#{group.story_ref}
                      </span>
                      {group.story_subject && (
                        <span className={cn("truncate text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-900")}>
                          {group.story_subject}
                        </span>
                      )}
                      <span className={cn("ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold",
                        dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500")}>
                        {group.tasks.length}
                      </span>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="pb-2">
                      {group.tasks.map((task) => {
                        const effort = effortByStoryTask.get(`${group.story_id}:${task.subject}`);
                        const canEdit = Number(task.id) > 0;
                        return (
                          <div key={task.id} className={cn("mx-2 mb-1 rounded-lg border",
                            dark ? "border-neutral-800 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
                            <div className="flex items-center gap-1.5 px-2.5 py-2">
                              {task.ref && Number(task.ref) > 0 && (
                                <span className={cn("shrink-0 font-mono text-xs", subduedTextClass)}>#{task.ref}</span>
                              )}
                              <span className={cn("min-w-0 flex-1 truncate text-sm", dark ? "text-neutral-200" : "text-slate-700")}>
                                {task.subject}
                              </span>
                              {effort && (
                                <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-bold ring-1",
                                  EFFORT_COLORS[effort] ?? "bg-neutral-500/15 text-neutral-400 ring-neutral-500/30")}>
                                  {effort}
                                </span>
                              )}
                              {canEdit && (
                                <>
                                  <button
                                    onClick={() => loadForEditMut.mutate(task.id)}
                                    disabled={loadForEditMut.isPending}
                                    className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-40", dark ? "text-neutral-500 hover:text-neutral-200" : "text-slate-400 hover:text-slate-700")}
                                  >
                                    {loadForEditMut.isPending && loadForEditMut.variables === task.id ? "…" : "Edit"}
                                  </button>
                                  <button
                                    onClick={() => setPendingDelete({ id: task.id, ref: task.ref, subject: task.subject })}
                                    className={cn("shrink-0 rounded p-1 transition-colors", dark ? "text-neutral-600 hover:text-red-400" : "text-slate-400 hover:text-red-500")}
                                    title="Delete task"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {addingToStory === group.story_id ? (
                        <div className="mx-2 mt-1 space-y-1.5">
                          <input autoFocus className={inputClass} value={newTaskSubject}
                            onChange={(e) => setNewTaskSubject(e.target.value)}
                            placeholder="New task subject…"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newTaskSubject.trim()) addMut.mutate({ storyId: group.story_id, subject: newTaskSubject.trim() });
                              if (e.key === "Escape") { setAddingToStory(null); setNewTaskSubject(""); }
                            }} />
                          <div className="flex gap-1">
                            <button
                              onClick={() => { if (newTaskSubject.trim()) addMut.mutate({ storyId: group.story_id, subject: newTaskSubject.trim() }); }}
                              disabled={addMut.isPending || !newTaskSubject.trim()}
                              className="flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                              {addMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                            </button>
                            <button onClick={() => { setAddingToStory(null); setNewTaskSubject(""); }}
                              className={cn("rounded px-2 py-1 text-xs", dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500")}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : !isPending && (
                        <button
                          onClick={() => setAddingToStory(group.story_id)}
                          className={cn("mx-2 mt-0.5 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors",
                            dark ? "text-neutral-600 hover:text-violet-400 hover:bg-neutral-800" : "text-slate-400 hover:text-violet-600 hover:bg-slate-100")}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add task
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
