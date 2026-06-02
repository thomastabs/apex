"use client";
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTaskBoard } from "@/lib/hooks/use-phase3";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import {
  taigaCreateTask,
  taigaDeleteTask,
  taigaGetProjectTasks,
  taigaUpdateTask,
  type TaigaTask,
} from "@/lib/api/taiga-direct";
import { PanelHeader, type DragSectionProps } from "./shared";

const EFFORT_COLORS: Record<string, string> = {
  XS: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  S:  "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  M:  "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30",
  L:  "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  XL: "bg-red-500/15 text-red-400 ring-red-500/30",
};

type TasksSectionProps = DragSectionProps & { dark: boolean };

type StoryGroup = {
  story_id: number;
  story_ref: number;
  story_subject: string;
  tasks: TaigaTask[];
};

function DeleteTaskDialog({
  task,
  dark,
  onConfirm,
  onCancel,
  isPending,
}: {
  task: { id: number; ref: number; subject: string };
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
          &ldquo;{task.subject}&rdquo; will be permanently deleted from Taiga.
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

export function TasksSection({ dark, shellClass, dragHandlers, onDragStart }: TasksSectionProps) {
  const darkTheme = useUiStore((s) => s.theme) === "dark";
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedStories, setExpandedStories] = useState<Set<number>>(new Set());
  const [expandedTaskDesc, setExpandedTaskDesc] = useState<Set<number>>(new Set());
  const [editingTask, setEditingTask] = useState<{ id: number; subject: string; description: string; version: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; ref: number; subject: string } | null>(null);
  const [addingToStory, setAddingToStory] = useState<number | null>(null);
  const [newTaskSubject, setNewTaskSubject] = useState("");

  const context = useApiContext();
  const queryClient = useQueryClient();
  const { data: jsonBoard = [] } = useTaskBoard();
  const { selectedStoryId, taskList, currentStoryMeta } = usePhase3Store();

  const QUERY_KEY = ["taiga", "project-tasks", context?.projectId];

  const { data: taigaTasks = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => taigaGetProjectTasks(context!.taigaToken, context!.projectId, context!.taigaApiUrl),
    enabled: Boolean(context),
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const updateMut = useMutation({
    mutationFn: (v: { id: number; version: number; subject: string; description: string }) =>
      taigaUpdateTask(context!.taigaToken, v.id, v.version, { subject: v.subject, description: v.description }, context!.taigaApiUrl),
    onSuccess: () => { setEditingTask(null); void invalidate(); },
    onError: () => toast.error("Failed to update task."),
  });

  const deleteMut = useMutation({
    mutationFn: (taskId: number) => taigaDeleteTask(context!.taigaToken, taskId, context!.taigaApiUrl),
    onSuccess: () => { setPendingDelete(null); void invalidate(); toast.success("Task deleted."); },
    onError: () => { setPendingDelete(null); toast.error("Failed to delete task."); },
  });

  const addMut = useMutation({
    mutationFn: (v: { storyId: number; subject: string }) =>
      taigaCreateTask(context!.taigaToken, context!.projectId, v.storyId, v.subject, "", context!.taigaApiUrl),
    onSuccess: () => { setAddingToStory(null); setNewTaskSubject(""); void invalidate(); toast.success("Task added."); },
    onError: () => toast.error("Failed to add task."),
  });

  const effortByStoryTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const story of jsonBoard) {
      for (const t of story.tasks) {
        if (t.effort_estimate) map.set(`${story.story_id}:${t.subject}`, t.effort_estimate);
      }
    }
    return map;
  }, [jsonBoard]);

  const allStoryGroups = useMemo<StoryGroup[]>(() => {
    const groups = new Map<number, StoryGroup>();
    for (const t of taigaTasks) {
      if (!groups.has(t.user_story)) {
        groups.set(t.user_story, { story_id: t.user_story, story_ref: t.user_story_ref, story_subject: t.user_story_subject, tasks: [] });
      }
      groups.get(t.user_story)!.tasks.push(t);
    }
    const result = Array.from(groups.values()).sort((a, b) => a.story_id - b.story_id);
    if (selectedStoryId !== null && taskList.length > 0 && !groups.has(selectedStoryId)) {
      result.unshift({
        story_id: selectedStoryId,
        story_ref: selectedStoryId,
        story_subject: currentStoryMeta.title,
        tasks: taskList.map((t, i) => ({ id: -(i + 1), ref: 0, subject: t.subject, description: "", version: 1, user_story: selectedStoryId, user_story_ref: selectedStoryId, user_story_subject: currentStoryMeta.title })),
      });
    }
    return result;
  }, [taigaTasks, selectedStoryId, taskList, currentStoryMeta]);

  // Apply filter
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

  const toggleTaskDesc = (id: number) =>
    setExpandedTaskDesc((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";
  const inputClass = cn(
    "w-full rounded border px-2 py-1 text-xs",
    dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-slate-300 bg-white text-slate-900",
  );

  const filterBtn = (
    <button
      onClick={(e) => { e.stopPropagation(); setFilterOpen((v) => !v); if (filterOpen) setFilter(""); }}
      title="Filter"
      className={cn(
        "grid h-7 w-7 place-items-center rounded transition-colors",
        filterOpen || filter
          ? "bg-violet-500/20 text-violet-400"
          : dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-400 hover:text-slate-600",
      )}
    >
      <Search className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div {...dragHandlers} className={shellClass}>
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
            {/* Filter input */}
            {filterOpen && (
              <div className="relative px-3 pb-2 pt-1">
                <Search className={cn("absolute left-5 top-1/2 -translate-y-1/2 h-3 w-3", subduedTextClass)} />
                <input
                  autoFocus
                  className={cn(inputClass, "pl-6")}
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
            ) : storyGroups.length === 0 ? (
              <p className={cn("px-4 py-3 text-sm", subduedTextClass)}>
                {q ? "No tasks match your filter." : "No tasks pushed to Taiga yet."}
              </p>
            ) : storyGroups.map((group) => {
              const isExpanded = expandedStories.has(group.story_id);
              const isPending = group.tasks.some((t) => t.id < 0);
              return (
                <div key={group.story_id} className={cn("border-b last:border-b-0", sectionBorderClass)}>
                  {/* Story header */}
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
                    {!isPending && (
                      <button
                        onClick={() => { setAddingToStory(group.story_id); setExpandedStories((p) => new Set(p).add(group.story_id)); }}
                        className={cn("shrink-0 rounded p-1 transition-colors", dark ? "text-neutral-600 hover:text-violet-400" : "text-slate-400 hover:text-violet-600")}
                        title="Add task"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Task list */}
                  {isExpanded && (
                    <div className="pb-2">
                      {group.tasks.map((task) => {
                        const isEditing = editingTask?.id === task.id;
                        const isDescOpen = expandedTaskDesc.has(task.id);
                        const effort = effortByStoryTask.get(`${group.story_id}:${task.subject}`);
                        const canEdit = task.id > 0;
                        return (
                          <div key={task.id} className={cn("mx-2 mb-1 rounded-lg border",
                            dark ? "border-neutral-800 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
                            {isEditing ? (
                              <div className="space-y-1.5 p-2">
                                <input autoFocus className={inputClass} value={editingTask.subject}
                                  onChange={(e) => setEditingTask({ ...editingTask, subject: e.target.value })}
                                  placeholder="Task subject" />
                                <textarea className={cn(inputClass, "resize-y")} rows={3} value={editingTask.description}
                                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                                  placeholder="Description (optional)" />
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => updateMut.mutate({ id: editingTask.id, version: editingTask.version, subject: editingTask.subject, description: editingTask.description })}
                                    disabled={updateMut.isPending}
                                    className="flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                                  >
                                    {updateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                                  </button>
                                  <button onClick={() => setEditingTask(null)}
                                    className={cn("rounded px-2 py-1 text-xs", dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500")}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 px-2.5 py-2">
                                  {task.ref > 0 && (
                                    <span className={cn("shrink-0 font-mono text-xs", subduedTextClass)}>#{task.ref}</span>
                                  )}
                                  <span className={cn("min-w-0 flex-1 truncate text-sm", dark ? "text-neutral-200" : "text-slate-700")}>
                                    {task.subject}
                                  </span>
                                  {effort && (
                                    <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1",
                                      EFFORT_COLORS[effort] ?? "bg-neutral-500/15 text-neutral-400 ring-neutral-500/30")}>
                                      {effort}
                                    </span>
                                  )}
                                  {canEdit && (
                                    <>
                                      <button
                                        onClick={() => { toggleTaskDesc(task.id); }}
                                        className={cn("shrink-0 rounded p-1 transition-colors",
                                          isDescOpen
                                            ? "text-violet-400"
                                            : dark ? "text-neutral-600 hover:text-neutral-400" : "text-slate-400 hover:text-slate-600")}
                                        title="View/edit description"
                                      >
                                        <Pencil className="h-3 w-3" />
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
                                {isDescOpen && canEdit && (
                                  <div className={cn("border-t px-2.5 py-2 space-y-1.5", dark ? "border-neutral-800" : "border-slate-200")}>
                                    <textarea
                                      className={cn(inputClass, "resize-y text-sm")}
                                      rows={3}
                                      defaultValue={task.description}
                                      placeholder="No description"
                                    />
                                    <button
                                      onClick={() => setEditingTask({ id: task.id, subject: task.subject, description: task.description, version: task.version })}
                                      className={cn("text-xs font-medium", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700")}
                                    >
                                      Edit subject too
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
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
