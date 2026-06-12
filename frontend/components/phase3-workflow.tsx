"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PmTask } from "@/lib/api/pm-types";
import { getPmAdapter } from "@/lib/api/pm-factory";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  GitBranch,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  decodeApexMeta,
  encodeApexMeta,
  fetchTaigaTaskFull,
  findTaigaTaskBySubject,
  useEligibleStories,
  useGenerateProposal,
  useGenerateTasks,
  useLoadProposals,
  useLoadTaskList,
  useLockStory,
  usePushMetadataToTaiga,
  usePushSingleTask,
  usePushTasksToTaiga,
  useSaveProposal,
  useStoryContext,
  useUpdateTaskInTaiga,
  useUpdateTaskList,
} from "@/lib/hooks/use-phase3";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useApiContext, useGithubContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import { createGithubIssue, fetchRecentCommitsContext } from "@/lib/api/github-browser";
import type { EffortEstimate, Phase3StoryContext, Phase3Task } from "@/lib/api/types";
import { toPmCtx } from "@/lib/api/workspace";
import { TaskDagPanel } from "@/components/task-dag-panel";

// ---------------------------------------------------------------------------
// Markdown preview
// ---------------------------------------------------------------------------

function MarkdownPreview({ content, dark, className }: { content: string; dark: boolean; className?: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    async function render() {
      const { marked } = await import("marked");
      const DOMPurify = (await import("dompurify")).default;
      const raw = await marked.parse(content || "");
      setHtml(DOMPurify.sanitize(raw));
    }
    void render();
  }, [content]);
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none overflow-y-auto rounded-lg border p-4 text-xs leading-relaxed",
        dark ? "prose-invert border-neutral-700 bg-neutral-950" : "prose-slate border-slate-200 bg-slate-50",
        className,
      )}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// Effort badge
// ---------------------------------------------------------------------------

const EFFORT_COLORS: Record<string, string> = {
  XS: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  S:  "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  M:  "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30",
  L:  "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  XL: "bg-red-500/15 text-red-400 ring-red-500/30",
};

function EffortBadge({ estimate, onDark = false }: { estimate?: string; onDark?: boolean }) {
  if (!estimate) return null;
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1",
      onDark
        ? "bg-white/20 text-white ring-white/30"
        : EFFORT_COLORS[estimate] ?? "bg-neutral-500/15 text-neutral-400 ring-neutral-500/30",
    )}>
      {estimate}
    </span>
  );
}

function parseGherkinScenarios(gherkin: string): string[] {
  return [...gherkin.matchAll(/Scenario(?:\s+Outline)?:\s*(.+)/g)].map((m) => m[1].trim());
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

function downloadPack(taskSubject: string, packMd: string, ctx: Phase3StoryContext) {
  const full = [
    `# Developer Pack — ${taskSubject}`,
    `## Story: US#${ctx.story_id} — ${ctx.title}`,
    "",
    packMd,
  ].join("\n");
  const slug = taskSubject.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  blobDownload(full, `pack-${slug}.md`);
}

function downloadAllPacks(
  packs: Array<{ taskSubject: string; packMd: string }>,
  storyId: number,
  ctx: Phase3StoryContext,
) {
  const parts = packs.map(({ taskSubject, packMd }) =>
    [`# Developer Pack — ${taskSubject}`, `## Story: US#${ctx.story_id} — ${ctx.title}`, "", packMd].join("\n"),
  );
  blobDownload(parts.join("\n\n---\n\n"), `story-${storyId}-packs.md`);
}

function blobDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function extractSection(packMd: string, heading: string): string {
  const idx = packMd.indexOf(heading);
  if (idx === -1) return "";
  const after = packMd.slice(idx + heading.length);
  const next = after.search(/\n## /);
  return next !== -1 ? after.slice(0, next).trim() : after.trim();
}

function extractAiPrompt(packMd: string): string {
  // backward compat: old packs use "## AI Prompt", new use "## Chat Prompt"
  return extractSection(packMd, "## Chat Prompt") || extractSection(packMd, "## AI Prompt") || packMd;
}

function extractAgenticBrief(packMd: string): string {
  return extractSection(packMd, "## Agentic Brief");
}

function extractClaudeMdSnippet(packMd: string): string {
  return extractSection(packMd, "## CLAUDE.md Snippet");
}

function getBranchName(storyId: number, taskSubject: string): string {
  const slug = taskSubject
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 45);
  return `feat/us-${storyId}-${slug}`;
}

function extractContext(packMd: string): string {
  const match = packMd.match(/## Context\s*\n([\s\S]*?)(?=\n## |\s*$)/);
  return match ? match[1].trim().slice(0, 250) : "";
}

function cleanGherkinPreview(raw: string): string[] {
  const scenarios: string[] = [];
  for (const m of raw.matchAll(/Scenario(?:\s+Outline)?:\s*(.+)/g)) {
    scenarios.push(m[1].trim());
  }
  return scenarios;
}

// ---------------------------------------------------------------------------
// Stage A — Story selection
// ---------------------------------------------------------------------------

function StageA({ onSelect }: { onSelect: (id: number) => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const { data, isLoading, error } = useEligibleStories();
  const { data: pmTasksAll = [] } = useQuery({
    queryKey: ["pm", "project-tasks", context?.projectId],
    queryFn: () => getPmAdapter(context!.pmTool).getProjectTasks(toPmCtx(context!)),
    enabled: Boolean(context),
    staleTime: 60_000,
  });
  const taskCountByStory = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of pmTasksAll) {
      const sid = Number(t.user_story);
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
    return map;
  }, [pmTasksAll]);

  const [activeEpic, setActiveEpic] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stories…
      </div>
    );
  }
  if (error) {
    return <Callout>Failed to load stories: {errMsg(error)}</Callout>;
  }

  const stories = data?.stories ?? [];
  if (stories.length === 0) {
    return (
      <Callout>
        No design-locked stories found. Complete Phase 2 for at least one story first.
      </Callout>
    );
  }

  const byEpic = new Map<string, typeof stories>();
  for (const s of stories) {
    const epic = s.epic_title || "Ungrouped";
    if (!byEpic.has(epic)) byEpic.set(epic, []);
    byEpic.get(epic)!.push(s);
  }
  const epics = [...byEpic.keys()];
  const currentEpic = activeEpic ?? epics[0];
  const epicStories = byEpic.get(currentEpic) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Select a story to implement</SectionHeading>
        <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
          Choose a design-locked user story to decompose and build developer packs for.
        </p>
      </div>

      {/* Epic dropdown */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 shrink-0">
          Epic
        </label>
        <div className="relative flex-1 max-w-sm">
          <select
            value={currentEpic}
            onChange={(e) => { setActiveEpic(e.target.value); setPage(0); }}
            className={cn(
              "w-full appearance-none rounded-lg border px-4 py-2.5 pr-9 text-sm font-medium transition cursor-pointer",
              dark
                ? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-violet-500 focus:border-violet-500 focus:outline-none"
                : "border-slate-300 bg-white text-slate-800 hover:border-violet-400 focus:border-violet-500 focus:outline-none shadow-sm",
            )}
          >
            {epics.map((epic) => (
              <option key={epic} value={epic}>
                {epic} ({byEpic.get(epic)!.length})
              </option>
            ))}
          </select>
          <ChevronRight className={cn(
            "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90",
            dark ? "text-neutral-500" : "text-slate-400",
          )} />
        </div>
      </div>

      {/* 2×2 paged grid with arrow navigation */}
      {(() => {
        type Slot = (typeof epicStories)[number] | null;
        const chunks: Slot[][] = [];
        for (let i = 0; i < epicStories.length; i += 4) {
          const chunk: Slot[] = epicStories.slice(i, i + 4);
          while (chunk.length < 4) chunk.push(null);
          chunks.push(chunk);
        }
        const pageCount = chunks.length;
        const safePage = Math.min(page, pageCount - 1);
        const chunk = chunks[safePage] ?? [];
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {chunk.map((story, si) =>
                story === null ? (
                  <div key={`empty-${si}`} />
                ) : (
                  <button
                    key={story.story_id}
                    onClick={() => onSelect(story.story_id)}
                    className={cn(
                      "group flex h-full flex-col rounded-xl border p-5 text-left transition-all duration-150",
                      dark
                        ? "border-neutral-700 bg-neutral-900 hover:border-violet-500 hover:bg-neutral-800/80 hover:shadow-lg hover:shadow-violet-900/20"
                        : "border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50 shadow-sm hover:shadow-md",
                    )}
                  >
                    <span className={cn(
                      "mb-3 inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold",
                      dark ? "bg-neutral-800 text-violet-400 ring-1 ring-neutral-700" : "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                    )}>
                      US#{story.story_id}
                    </span>
                    <p className={cn("text-base font-bold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                      {story.title}
                    </p>
                    {story.gherkin_preview && (() => {
                      const scenarios = cleanGherkinPreview(story.gherkin_preview);
                      return scenarios.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {scenarios.map((sc, i) => (
                            <span key={i} className={cn(
                              "rounded-md px-2 py-0.5 text-[10px] font-medium leading-snug",
                              dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500",
                            )}>
                              {sc}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    <div className="mt-auto flex items-center justify-between pt-4">
                      {(() => {
                        const count = taskCountByStory.get(story.story_id) ?? 0;
                        return count > 0 ? (
                          <span
                            title="Tasks in PM board"
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                              dark ? "bg-violet-900/40 text-violet-300" : "bg-violet-100 text-violet-700",
                            )}
                          >
                            {count} task{count > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className={cn("text-[10px]", dark ? "text-neutral-700" : "text-slate-300")}>
                            No tasks yet
                          </span>
                        );
                      })()}
                      <span className={cn(
                        "flex items-center gap-1 text-[11px] font-medium transition",
                        dark ? "text-neutral-600 group-hover:text-violet-400" : "text-slate-400 group-hover:text-violet-600",
                      )}>
                        Implement <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                )
              )}
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-30",
                    dark ? "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm",
                  )}
                >
                  ← Prev
                </button>
                <span className="text-xs text-neutral-500">
                  Page {safePage + 1} of {pageCount} · {epicStories.length} stories
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage === pageCount - 1}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-30",
                    dark ? "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm",
                  )}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage B — Task decomposition
// ---------------------------------------------------------------------------

function StageB({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const queryClient = useQueryClient();
  const { data: ctx, isLoading: ctxLoading } = useStoryContext(storyId);
  const { taskList, tasksPushed, packDrafts, setCurrentStoryMeta, patchTask, setTaskList, removePushedStoryId } = usePhase3Store();
  const { addTask, removeTask, updateTask, reorderTasks } = useUpdateTaskList();

  const updateInTaigaMut = useUpdateTaskInTaiga();
  const pushSingleMut = usePushSingleTask();
  const pushMetaMut = usePushMetadataToTaiga();

  useEffect(() => {
    if (ctx) setCurrentStoryMeta(ctx.title, ctx.epic_title);
  }, [ctx, setCurrentStoryMeta]);


  const generateTasksMut = useGenerateTasks();
  const pushToTaiga = usePushTasksToTaiga();

  const [newSubject, setNewSubject] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [descFetching, setDescFetching] = useState(false);

  // Prefetch descriptions for tasks that have pm_task_id but empty description.
  const needsFetchCount = taskList.filter((t) => (t.pm_task_id ?? t.taiga_task_id) && !t.description).length;
  useEffect(() => {
    if (!context || needsFetchCount === 0) return;
    for (const task of taskList.filter((t) => (t.pm_task_id ?? t.taiga_task_id) && !t.description)) {
      const pmId = task.pm_task_id ?? String(task.taiga_task_id!);
      fetchTaigaTaskFull(context, pmId)
        .then(({ description }) => { if (description) patchTask(task.id, { description }); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFetchCount, context]);

  // When opening edit, resolve pm_task_id if missing then fetch full description
  useEffect(() => {
    if (editingId === null || !context) return;
    const task = taskList.find((t) => t.id === editingId);
    if (!task) return;

    let pmId = task.pm_task_id ?? (task.taiga_task_id ? String(task.taiga_task_id) : undefined);

    // Resolve missing pm_task_id via cached project tasks (subject match)
    if (!pmId) {
      const cached = queryClient.getQueryData<PmTask[]>(["pm", "project-tasks", context.projectId]) ?? [];
      const match = findTaigaTaskBySubject(cached, storyId, task.subject);
      if (match) {
        pmId = match.id;
        patchTask(task.id, { pm_task_id: match.id });
      }
    }

    if (!pmId) return;
    setDescFetching(true);
    fetchTaigaTaskFull(context, pmId)
      .then(({ description }) => { patchTask(task.id, { description }); })
      .catch((err) => {
        const adapter = getPmAdapter(context.pmTool);
        toast.error(adapter.errMsg(err, "Load description"));
      })
      .finally(() => setDescFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, storyId]);

  const nextId = taskList.length > 0 ? Math.max(...taskList.map((t) => t.id)) + 1 : 1;

  const handleAddTask = () => {
    if (!newSubject.trim()) return;
    const newTask: Phase3Task = {
      id: nextId,
      subject: newSubject.trim(),
      description: "",
      effort_estimate: "M" as EffortEstimate,
      covered_scenarios: [],
      predecessor_task_ids: [],
    };
    if (tasksPushed) {
      pushSingleMut.mutate({ storyId, task: newTask });
      setNewSubject("");
    } else {
      addTask(newTask);
      setNewSubject("");
    }
  };

  if (ctxLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading story context…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Story breadcrumb */}
      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3",
        dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
      )}>
        <button
          onClick={onBack}
          className={cn("shrink-0 text-xs font-medium transition", dark ? "text-neutral-400 hover:text-violet-400" : "text-slate-500 hover:text-violet-600")}
        >
          ← Stories
        </button>
        {ctx?.epic_title && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
            <span className={cn("shrink-0 text-xs font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
              {ctx.epic_title}
            </span>
          </>
        )}
        <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
        <span className={cn(
          "shrink-0 inline-flex items-center gap-1.5 text-xs font-mono font-semibold",
          dark ? "text-violet-400" : "text-violet-700",
        )}>
          US#{storyId}
        </span>
        <span className="text-sm font-medium truncate">{ctx?.title}</span>
      </div>

      {/* Gherkin preview */}
      {ctx?.gherkin && (() => {
        const rawGherkin = ctx.gherkin;
        const codeBlock = rawGherkin.match(/```(?:gherkin)?\s*([\s\S]*?)```/);
        const featureIdx = rawGherkin.indexOf("Feature:");
        const cleanGherkin = codeBlock
          ? codeBlock[1].trim()
          : featureIdx !== -1
            ? rawGherkin.slice(featureIdx).trim()
            : rawGherkin;
        return (
          <div className={cn("rounded-xl border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
            <div className={cn("px-4 py-2.5 flex items-center gap-2", dark ? "bg-neutral-800 border-b border-neutral-700" : "bg-slate-50 border-b border-slate-200")}>
              <span className={cn("text-xs font-semibold uppercase tracking-wider", dark ? "text-neutral-400" : "text-slate-500")}>
                Acceptance Criteria
              </span>
            </div>
            <pre
              className={cn(
                "min-h-48 overflow-y-auto p-4 text-xs whitespace-pre-wrap leading-relaxed resize-y",
                dark ? "bg-neutral-950 text-neutral-300" : "bg-white text-slate-700",
              )}
            >
              {cleanGherkin}
            </pre>
          </div>
        );
      })()}

      {/* Generate tasks + Continue */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="w-full justify-center"
          onClick={() => generateTasksMut.mutate(storyId)}
          disabled={generateTasksMut.isPending || tasksPushed}
        >
          {generateTasksMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : <><Sparkles className="h-4 w-4" /> Generate Tasks</>}
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-1.5" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            className="flex-1 justify-center"
            variant="secondary"
            onClick={onContinue}
          >
            Developer Packs <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {tasksPushed && (
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pushed
          </div>
          <button
            onClick={() => pushMetaMut.mutate(storyId)}
            disabled={pushMetaMut.isPending}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              pushMetaMut.isPending
                ? "cursor-wait text-neutral-400"
                : dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
            )}
          >
            {pushMetaMut.isPending ? "Updating…" : "Sync metadata"}
          </button>
        </div>
      )}

      {generateTasksMut.isPending && (
        <AIProgressIndicator
          steps={["Analysing story…", "Reviewing design bundle…", "Decomposing into tasks…"]}
          isPending={generateTasksMut.isPending}
          dark={dark}
        />
      )}

      {/* Task list */}
      {taskList.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeading>Tasks ({taskList.length})</SectionHeading>
            <button
              onClick={() => {
                setTaskList([]);
                setEditingId(null);
                removePushedStoryId(storyId);
              }}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                dark ? "text-neutral-500 hover:text-red-400" : "text-slate-400 hover:text-red-500",
              )}
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {taskList.map((task, idx) => (
              <div
                key={task.id}
                className={cn(
                  "group rounded-xl border transition",
                  dark ? "border-neutral-700 bg-neutral-900 hover:border-neutral-600" : "border-slate-200 bg-white hover:border-slate-300 shadow-sm",
                )}
              >
                {editingId === task.id ? (
                  <div className="space-y-2 p-4">
                    <input
                      className={cn(
                        "w-full rounded-lg border px-3 py-1.5 text-sm font-medium",
                        dark ? "border-neutral-600 bg-neutral-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                      value={task.subject}
                      onChange={(e) => updateTask(task.id, { subject: e.target.value })}
                    />
                    {descFetching && editingId === task.id ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-400 py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                      </div>
                    ) : (
                      <Textarea
                        rows={3}
                        value={task.description}
                        onChange={(e) => updateTask(task.id, { description: e.target.value })}
                      />
                    )}
                    {/* Effort selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-14 shrink-0">Effort</span>
                      <select
                        value={task.effort_estimate ?? "M"}
                        onChange={(e) => updateTask(task.id, { effort_estimate: e.target.value as EffortEstimate })}
                        className={cn(
                          "rounded-lg border px-2 py-1 text-xs",
                          dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-slate-300 bg-white text-slate-900",
                        )}

                      >
                        {(["XS", "S", "M", "L", "XL"] as EffortEstimate[]).map((e) => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                    </div>
                    {/* Predecessor checkboxes */}
                    {taskList.length > 1 && (
                      <div className="space-y-1">
                        <span className="text-xs text-neutral-500">Depends on</span>
                        <div className="space-y-0.5 pl-1">
                          {taskList.filter((t) => t.id !== task.id).map((other) => (
                            <label key={other.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(task.predecessor_task_ids ?? []).includes(other.id)}
                                onChange={(e) => {
                                  const current = task.predecessor_task_ids ?? [];
                                  updateTask(task.id, {
                                    predecessor_task_ids: e.target.checked
                                      ? [...current, other.id]
                                      : current.filter((id) => id !== other.id),
                                  });
                                }}
                                className="accent-violet-600"
                              />
                              <span className={cn("text-xs", dark ? "text-neutral-300" : "text-slate-700")}>
                                Task {taskList.findIndex((t) => t.id === other.id) + 1}: {other.subject}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" className="gap-1.5" onClick={() => setEditingId(null)}>
                        <CheckCircle2 className="h-4 w-4" /> Done
                      </Button>
                      {(task.pm_task_id ?? task.taiga_task_id) && (
                        <Button
                          variant="primary"
                          className="gap-1.5"
                          onClick={() => updateInTaigaMut.mutate({ pmTaskId: task.pm_task_id ?? String(task.taiga_task_id!), task })}
                          disabled={updateInTaigaMut.isPending}
                        >
                          {updateInTaigaMut.isPending
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                            : <><CheckCircle2 className="h-4 w-4" /> Save</>}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-4">
                    {/* Number badge */}
                    <span className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      dark ? "bg-neutral-800 text-violet-400" : "bg-violet-50 text-violet-700",
                    )}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn("text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                          {task.subject}
                        </p>
                        <EffortBadge estimate={task.effort_estimate} />
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{task.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      {!tasksPushed && (
                        <>
                          <button
                            onClick={() => reorderTasks(idx, idx - 1)}
                            disabled={idx === 0}
                            className={cn(
                              "rounded p-1 transition disabled:opacity-20",
                              dark ? "text-neutral-500 hover:text-neutral-200" : "text-slate-400 hover:text-slate-600",
                            )}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => reorderTasks(idx, idx + 1)}
                            disabled={idx === taskList.length - 1}
                            className={cn(
                              "rounded p-1 transition disabled:opacity-20",
                              dark ? "text-neutral-500 hover:text-neutral-200" : "text-slate-400 hover:text-slate-600",
                            )}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setEditingId(task.id)}
                        className={cn(
                          "rounded px-2 py-1 text-xs font-medium transition",
                          dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        Edit
                      </button>
                      {!tasksPushed && (
                        <button
                          onClick={() => removeTask(task.id)}
                          className="rounded px-2 py-1 text-xs text-red-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add task — always visible; after push goes directly to Taiga with dupe check */}
          <div className="flex gap-2">
            <input
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm",
                dark
                  ? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-600"
                  : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
              )}
              placeholder={tasksPushed ? "Add task to PM board…" : "Add a task manually…"}
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
            />
            <Button
              variant="secondary"
              onClick={handleAddTask}
              disabled={pushSingleMut.isPending || pushToTaiga.isPending || !newSubject.trim()}
            >
              {pushSingleMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          {taskList.length > 0 && (
            <TaskDagPanel taskList={taskList} packDrafts={packDrafts} dark={dark} />
          )}

          {/* Stage B.5 — Push to Taiga */}
          {!tasksPushed && (
            <Button
              className="w-full justify-center"
              onClick={() => pushToTaiga.mutate(storyId)}
              disabled={pushToTaiga.isPending || taskList.length === 0}
              variant="secondary"
            >
              {pushToTaiga.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing…</>
                : <><Upload className="h-4 w-4" /> Push Tasks</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage C — Developer Pack per task
// ---------------------------------------------------------------------------

function StageC({ storyId }: { storyId: number }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const githubCtx = useGithubContext();
  const { data: ctx } = useStoryContext(storyId);
  const { taskList, packDrafts, prevPackDrafts, pmTaskRefs, setPackDraft, restorePackDraft } = usePhase3Store();
  const generateProposal = useGenerateProposal();
  const saveProposalMut = useSaveProposal();

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [generatingTaskId, setGeneratingTaskId] = useState<number | null>(null);
  const [hints, setHints] = useState<Record<number, string>>({});
  const [bulkQueue, setBulkQueue] = useState<number[]>([]);
  const packSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTask = taskList.find((t) => t.id === selectedTaskId) ?? null;
  const packMd = selectedTaskId !== null ? (packDrafts[selectedTaskId] ?? "") : "";
  const generatedCount = taskList.filter((t) => Boolean(packDrafts[t.id])).length;

  const handleGenerate = async (taskId: number, hint?: string) => {
    const task = taskList.find((t) => t.id === taskId);
    if (!task) return;
    setGeneratingTaskId(taskId);
    const recentCommitsContext = githubCtx
      ? await fetchRecentCommitsContext(githubCtx, task.subject).catch(() => "")
      : "";
    generateProposal.mutate(
      {
        story_id: storyId,
        task_id: taskId,
        task_subject: task.subject,
        task_description: task.description,
        hint: hint?.trim() || undefined,
        recent_commits_context: recentCommitsContext || undefined,
        all_tasks: taskList.map((t) => ({ id: t.id, subject: t.subject, description: t.description })),
      },
      {
        onSettled: () => setGeneratingTaskId(null),
        onSuccess: (data) => {
          saveProposalMut.mutate(
            { story_id: storyId, task_id: taskId, proposal_md: data.proposal_md },
            { onError: () => toast.error("Pack generated but failed to save — regenerate or try again.") },
          );
        },
      },
    );
  };

  // Bulk generation: process one task at a time, waiting for each to finish
  useEffect(() => {
    if (bulkQueue.length === 0 || generatingTaskId !== null) return;
    const [nextId, ...rest] = bulkQueue;
    setBulkQueue(rest);
    void handleGenerate(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkQueue, generatingTaskId]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Clipboard access denied.");
    }
  };

  const handleCopyPrompt = () => copyToClipboard(extractAiPrompt(packMd), "Chat Prompt");
  const handleCopyAgenticBrief = () => {
    const brief = extractAgenticBrief(packMd);
    if (!brief) { toast.error("No Agentic Brief found — regenerate pack."); return; }
    void copyToClipboard(brief, "Agentic Brief");
  };
  const handleCopyClaudeMd = () => {
    const snippet = extractClaudeMdSnippet(packMd);
    if (!snippet) { toast.error("No CLAUDE.md Snippet found — regenerate pack."); return; }
    void copyToClipboard(snippet, "CLAUDE.md Snippet");
  };

  if (taskList.length === 0) {
    return <Callout>Generate and finalise tasks in Stage B first.</Callout>;
  }

  return (
    <div className="space-y-4">
      {/* Progress bar + Generate All */}
      <div className={cn("rounded-xl border p-4", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50")}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Packs generated</span>
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-bold", dark ? "text-neutral-200" : "text-slate-800")}>
              {generatedCount} / {taskList.length}
            </span>
            <button
              onClick={() => {
                const missing = taskList.filter((t) => !packDrafts[t.id]).map((t) => t.id);
                setBulkQueue(missing);
              }}
              disabled={generatingTaskId !== null || bulkQueue.length > 0 || taskList.every((t) => Boolean(packDrafts[t.id]))}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition disabled:opacity-40",
                dark ? "border-neutral-600 text-neutral-300 hover:border-violet-500 hover:text-violet-400" : "border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-600",
              )}
            >
              {bulkQueue.length > 0
                ? <><Loader2 className="h-3 w-3 animate-spin" /> {bulkQueue.length} left…</>
                : <><Sparkles className="h-3 w-3" /> Generate All</>}
            </button>
          </div>
        </div>
        <div className={cn("h-1.5 rounded-full overflow-hidden", dark ? "bg-neutral-800" : "bg-slate-200")}>
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500"
            style={{ width: taskList.length > 0 ? `${(generatedCount / taskList.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <div className="flex gap-5">
        {/* Task list sidebar */}
        <div className="w-60 shrink-0 space-y-1.5">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Tasks</p>
          {taskList.map((task, idx) => {
            const hasPack = Boolean(packDrafts[task.id]);
            const isGenerating = generatingTaskId === task.id;
            const isSelected = selectedTaskId === task.id;
            const taigaRef = pmTaskRefs[idx];
            return (
              <button
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all",
                  isSelected
                    ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                    : dark
                      ? "hover:bg-neutral-800 text-neutral-300"
                      : "hover:bg-slate-100 text-slate-700",
                )}
              >
                {/* Status icon */}
                <span className="mt-0.5 shrink-0">
                  {isGenerating
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                    : hasPack
                      ? <CheckCircle2 className={cn("h-3.5 w-3.5", isSelected ? "text-emerald-300" : "text-emerald-500")} />
                      : <span className={cn("block h-3.5 w-3.5 rounded-full border-2", isSelected ? "border-violet-300" : dark ? "border-neutral-600" : "border-slate-300")} />}
                </span>
                <div className="min-w-0 flex-1">
                  {taigaRef && (
                    <p className={cn("text-[10px] font-mono mb-0.5", isSelected ? "text-violet-200" : "text-neutral-500")}>
                      #{taigaRef}
                    </p>
                  )}
                  <p className="truncate text-xs font-medium leading-snug">
                    <span className={cn("mr-1 font-bold", isSelected ? "text-white" : "text-neutral-500")}>
                      {idx + 1}.
                    </span>
                    {task.subject}
                  </p>
                  {task.effort_estimate && (
                    <EffortBadge estimate={task.effort_estimate} onDark={isSelected} />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Pack panel */}
        <div className={cn("min-w-0 flex-1 rounded-xl border", dark ? "border-neutral-700" : "border-slate-200")}>
          {selectedTask ? (
            <>
              {/* Panel header */}
              <div className={cn(
                "border-b px-5 py-4 space-y-3",
                dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50",
              )}>
                {/* Row 1: task info + action buttons */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-neutral-500 mb-0.5">
                      US#{storyId} · Task {taskList.findIndex(t => t.id === selectedTask.id) + 1}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("text-sm font-semibold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                        {selectedTask.subject}
                      </p>
                      <EffortBadge estimate={selectedTask.effort_estimate} />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                  <Button
                    variant="secondary"
                    onClick={() => void handleGenerate(selectedTask.id, hints[selectedTask.id])}
                    disabled={generatingTaskId !== null}
                  >
                    {generatingTaskId === selectedTask.id
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                      : <><Sparkles className="h-4 w-4" /> {packMd ? "Regenerate" : "Generate Pack"}</>}
                  </Button>
                  {prevPackDrafts[selectedTask.id] && (
                    <Button
                      variant="secondary"
                      title="Undo last regeneration"
                      onClick={() => {
                        restorePackDraft(selectedTask.id);
                        saveProposalMut.mutate(
                          { story_id: storyId, task_id: selectedTask.id, proposal_md: prevPackDrafts[selectedTask.id] },
                          { onError: () => toast.error("Restore failed to save.") },
                        );
                      }}
                    >
                      ↩ Restore
                    </Button>
                  )}
                  {packMd && (
                    <>
                      <Button variant="secondary" onClick={handleCopyAgenticBrief} title="Copy terse brief for Claude Code / Codex">
                        <Clipboard className="h-4 w-4" /> Agentic Brief
                      </Button>
                      <Button variant="secondary" onClick={() => void handleCopyPrompt()} title="Copy full prompt for Claude.ai / ChatGPT / Cursor">
                        <Clipboard className="h-4 w-4" /> Chat Prompt
                      </Button>
                      <Button variant="secondary" onClick={handleCopyClaudeMd} title="Copy snippet for CLAUDE.md">
                        <Clipboard className="h-4 w-4" /> CLAUDE.md
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => ctx && downloadPack(selectedTask.subject, packMd, ctx)}
                      >
                        <Download className="h-4 w-4" /> .md
                      </Button>
                    </>
                  )}
                  </div>
                </div>
                {/* Row 2: branch chip (GitHub optional) + hint input */}
                <div className="flex items-center gap-2">
                  {githubCtx && (
                    <button
                      onClick={async () => {
                        const name = getBranchName(storyId, selectedTask.subject);
                        await navigator.clipboard.writeText(name).catch(() => {});
                        toast.success("Branch name copied.");
                      }}
                      title="Copy branch name"
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition",
                        dark
                          ? "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-violet-600 hover:text-violet-400"
                          : "border-slate-200 bg-white text-slate-500 hover:border-violet-400 hover:text-violet-600",
                      )}
                    >
                      <GitBranch className="h-3 w-3" />
                      {getBranchName(storyId, selectedTask.subject)}
                    </button>
                  )}
                  <input
                    type="text"
                    placeholder="Optional hint for AI (e.g. use Redis, focus on validation)…"
                    value={hints[selectedTask.id] ?? ""}
                    onChange={(e) => setHints((h) => ({ ...h, [selectedTask.id]: e.target.value }))}
                    className={cn(
                      "min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-xs",
                      dark
                        ? "border-neutral-700 bg-neutral-800 text-neutral-200 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                        : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none",
                    )}
                  />
                </div>
              </div>

              {/* Panel body */}
              <div className="p-5 space-y-4">
                {generatingTaskId === selectedTask.id && (
                  <AIProgressIndicator
                    steps={[
                      "Reading story context…",
                      "Analysing design bundle…",
                      "Writing implementation steps…",
                      "Mapping files to change…",
                      "Generating test assertions…",
                      "Building agentic brief…",
                      "Assembling chat prompt…",
                    ]}
                    isPending={generatingTaskId === selectedTask.id}
                    dark={dark}
                  />
                )}

                {packMd ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Edit</p>
                      <Textarea
                        rows={28}
                        value={packMd}
                        onChange={(e) => {
                          setPackDraft(selectedTask.id, e.target.value);
                          const val = e.target.value;
                          const tid = selectedTask.id;
                          if (packSaveTimer.current) clearTimeout(packSaveTimer.current);
                          packSaveTimer.current = setTimeout(() => {
                            saveProposalMut.mutate({ story_id: storyId, task_id: tid, proposal_md: val });
                          }, 600);
                        }}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Preview</p>
                      <MarkdownPreview content={packMd} dark={dark} className="max-h-[28rem]" />
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center",
                    dark ? "border-neutral-700" : "border-slate-200",
                  )}>
                    <Sparkles className={cn("mb-3 h-8 w-8", dark ? "text-neutral-600" : "text-slate-300")} />
                    <p className={cn("text-sm font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                      No pack generated yet
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Click &ldquo;Generate Pack&rdquo; to create a developer context pack for this task.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={cn(
              "flex flex-col items-center justify-center py-24 text-center",
            )}>
              <div className={cn(
                "mb-4 flex h-12 w-12 items-center justify-center rounded-full",
                dark ? "bg-neutral-800" : "bg-slate-100",
              )}>
                <Sparkles className={cn("h-6 w-6", dark ? "text-neutral-500" : "text-slate-400")} />
              </div>
              <p className={cn("text-sm font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                Select a task to generate its developer pack
              </p>
            </div>
          )}
        </div>
      </div>

      {taskList.length > 0 && (
        <TaskDagPanel taskList={taskList} packDrafts={packDrafts} dark={dark} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario coverage panel
// ---------------------------------------------------------------------------

function ScenarioCoveragePanel({
  gherkin,
  taskList,
  dark,
}: {
  gherkin: string;
  taskList: Phase3Task[];
  dark: boolean;
}) {
  const allScenarios = parseGherkinScenarios(gherkin);
  if (allScenarios.length === 0) return null;
  const hasCoverageData = taskList.some((t) => (t.covered_scenarios?.length ?? 0) > 0);
  const coveredSet = new Set(taskList.flatMap((t) => t.covered_scenarios ?? []));
  const uncovered = allScenarios.filter((sc) => !coveredSet.has(sc));

  return (
    <div className={cn("rounded-xl border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
      <div className={cn(
        "px-5 py-3 border-b flex items-center justify-between",
        dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
      )}>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Gherkin Scenario Coverage</p>
        <span className={cn("text-xs font-medium", uncovered.length > 0 ? "text-amber-500" : "text-emerald-500")}>
          {allScenarios.length - uncovered.length}/{allScenarios.length} covered
        </span>
      </div>
      <div className={cn("px-5 py-3 space-y-1.5", dark ? "bg-neutral-900/50" : "bg-white")}>
        {!hasCoverageData && (
          <p className="text-xs text-amber-500 mb-2">
            Coverage data not available — re-generate tasks to populate.
          </p>
        )}
        {allScenarios.map((sc) => {
          const covered = coveredSet.has(sc);
          return (
            <div key={sc} className="flex items-center gap-2">
              {covered
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                : <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-amber-400 inline-block" />}
              <span className={cn(
                "text-xs",
                covered
                  ? (dark ? "text-neutral-300" : "text-slate-700")
                  : "text-amber-500 font-medium",
              )}>
                {sc}
              </span>
            </div>
          );
        })}
        {uncovered.length > 0 && (
          <p className="mt-2 text-xs text-amber-500">
            {uncovered.length} scenario{uncovered.length > 1 ? "s" : ""} uncovered — add tasks or re-generate.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage D — Lock & Export
// ---------------------------------------------------------------------------

function StageD({ storyId, onLocked, onChooseNewStory, onBack }: { storyId: number; onLocked: () => void; onChooseNewStory: () => void; onBack: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const githubCtx = useGithubContext();
  const { data: ctx } = useStoryContext(storyId);
  const { taskList, packDrafts, clearPhase3Draft } = usePhase3Store();
  const lockStoryMut = useLockStory();
  const [overrideCoverage, setOverrideCoverage] = useState(false);
  const [lockedSuccessfully, setLockedSuccessfully] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  const generatedTasks = taskList.filter((t) => Boolean(packDrafts[t.id]));
  const skippedTasks = taskList.filter((t) => !packDrafts[t.id]);

  const allScenarios = parseGherkinScenarios(ctx?.gherkin ?? "");
  const coveredSet = new Set(taskList.flatMap((t) => t.covered_scenarios ?? []));
  const uncoveredScenarios = allScenarios.filter((sc) => !coveredSet.has(sc));
  const coverageOk = allScenarios.length === 0 || uncoveredScenarios.length === 0;

  const canLock = generatedTasks.length > 0 && (coverageOk || overrideCoverage);

  const handleLock = () => {
    lockStoryMut.mutate(
      { story_id: storyId, task_ids: generatedTasks.map((t) => t.id) },
      {
        onSuccess: () => {
          setLockedSuccessfully(true);
          onLocked();
        },
      },
    );
  };

  const handleExportAll = () => {
    if (!ctx) return;
    const packs = generatedTasks.map((t) => ({ taskSubject: t.subject, packMd: packDrafts[t.id] }));
    downloadAllPacks(packs, storyId, ctx);
  };

  const handleCreateIssue = async () => {
    if (!githubCtx || !ctx) return;
    setCreatingIssue(true);
    const title = `US#${storyId} Implementation: ${ctx.title}`;
    const taskLines = generatedTasks.map((t, i) => {
      const summary = extractContext(packDrafts[t.id] ?? "");
      return `- [ ] **Task ${i + 1}: ${t.subject}** (${t.effort_estimate ?? "M"})${summary ? `\n  > ${summary}` : ""}`;
    }).join("\n");
    const body = `## Implementation Plan\n\nThis story has been locked for implementation in Apex.\n\n### Tasks\n\n${taskLines}\n\n---\n*Generated by Apex*`;
    try {
      const { url } = await createGithubIssue(githubCtx, title, body);
      setIssueUrl(url);
      toast.success("GitHub Issue created.");
    } catch (err) {
      toast.error(`Failed to create issue: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCreatingIssue(false);
    }
  };

  const handleChooseNew = () => {
    clearPhase3Draft();
    onChooseNewStory();
  };

  if (lockedSuccessfully) {
    return (
      <div className="space-y-4">
        <div className={cn("flex items-center gap-3 rounded-xl border px-5 py-4", dark ? "border-emerald-800 bg-emerald-900/20" : "border-emerald-200 bg-emerald-50")}>
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <p className={cn("text-sm font-semibold", dark ? "text-emerald-400" : "text-emerald-700")}>
              Story locked as implementation-ready
            </p>
            <p className={cn("text-xs mt-0.5", dark ? "text-emerald-600" : "text-emerald-600")}>
              {generatedTasks.length} developer pack{generatedTasks.length !== 1 ? "s" : ""} ready
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full justify-center" variant="secondary" onClick={handleExportAll}>
            <Download className="h-4 w-4" /> Export All Packs
          </Button>
          {githubCtx && !issueUrl && (
            <Button className="w-full justify-center" variant="secondary" onClick={() => void handleCreateIssue()} disabled={creatingIssue}>
              {creatingIssue
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating issue…</>
                : <><GitBranch className="h-4 w-4" /> Create GitHub Issue</>}
            </Button>
          )}
          {issueUrl && (
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
                dark ? "border-emerald-700 text-emerald-400 hover:bg-emerald-900/30" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
              )}
            >
              <ExternalLink className="h-4 w-4" /> View GitHub Issue
            </a>
          )}
          <Button className="w-full justify-center gap-1.5" variant="secondary" onClick={handleChooseNew}>
            <RefreshCw className="h-4 w-4" /> Choose New Story
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Lock &amp; Export</SectionHeading>
        <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
          Lock this story as implementation-ready and export the developer packs.
        </p>
      </div>

      {/* Summary card */}
      <div className={cn("rounded-xl border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
        <div className={cn("px-5 py-4 border-b", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50")}>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Summary</p>
        </div>
        <div className={cn("px-5 py-4 space-y-3", dark ? "bg-neutral-900/50" : "bg-white")}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Packs ready</span>
            <span className={cn("font-bold", dark ? "text-neutral-100" : "text-slate-800")}>
              {generatedTasks.length} / {taskList.length}
            </span>
          </div>
          <div className={cn("h-2 rounded-full overflow-hidden", dark ? "bg-neutral-800" : "bg-slate-100")}>
            <div
              className={cn("h-full rounded-full transition-all duration-700", canLock ? "bg-violet-500" : "bg-neutral-600")}
              style={{ width: taskList.length > 0 ? `${(generatedTasks.length / taskList.length) * 100}%` : "0%" }}
            />
          </div>
          {skippedTasks.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-500">
                {skippedTasks.length} task{skippedTasks.length > 1 ? "s" : ""} without packs will be skipped on lock:
              </p>
              <ul className={cn(
                "space-y-0.5 rounded-lg border px-3 py-2",
                dark ? "border-neutral-700 bg-neutral-900" : "border-amber-100 bg-amber-50",
              )}>
                {skippedTasks.map((t, idx) => (
                  <li key={t.id} className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <span className="font-mono text-amber-400">{idx + 1}.</span>
                    {t.subject}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ScenarioCoveragePanel gherkin={ctx?.gherkin ?? ""} taskList={taskList} dark={dark} />

      {!coverageOk && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={overrideCoverage}
            onChange={(e) => setOverrideCoverage(e.target.checked)}
            className="accent-amber-500"
          />
          <span className="text-xs text-amber-500">
            I acknowledge {uncoveredScenarios.length} scenario{uncoveredScenarios.length > 1 ? "s are" : " is"} uncovered — lock anyway
          </span>
        </label>
      )}

      {generatedTasks.length === 0 && (
        <Callout>Generate at least one developer pack before locking.</Callout>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={lockStoryMut.isPending}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={handleLock}
            disabled={!canLock || lockStoryMut.isPending}
          >
            {lockStoryMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Locking…</>
              : <><Lock className="h-4 w-4" /> Lock Story</>}
          </Button>
        </div>
        {canLock && (
          <Button className="w-full justify-center" variant="secondary" onClick={handleExportAll}>
            <Download className="h-4 w-4" /> Export All Packs
          </Button>
        )}
        <Button className="w-full justify-center" variant="secondary" onClick={handleChooseNew}>
          Choose New Story
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type Stage = "A" | "B" | "C" | "D";

const STAGE_LABELS: Record<Stage, string> = {
  A: "Select Story",
  B: "Decompose",
  C: "Developer Packs",
  D: "Lock & Export",
};

export function Phase3Workflow() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const { selectedStoryId, setSelectedStoryId, clearPhase3Draft } = usePhase3Store();
  const [stage, setStage] = useState<Stage>(selectedStoryId !== null ? "B" : "A");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [lockedStoryId, setLockedStoryId] = useState<number | null>(null);

  // Hoist load hooks so they fire regardless of active stage (e.g. stepper jump)
  useLoadTaskList(selectedStoryId);
  useLoadProposals(selectedStoryId);

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  const handleSelectStory = (id: number) => {
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleBackToStories = () => setStage("A");
  const handleLocked = () => setLockedStoryId(selectedStoryId);

  // When navigating to Stage A via stepper after lock, clear the draft
  const handleStepperGoA = () => {
    if (lockedStoryId !== null) {
      clearPhase3Draft();
      setLockedStoryId(null);
    }
    setStage("A");
  };

  return (
    <section className="px-8 py-8">
      {/* Phase header */}
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Phase 3</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          Implementation
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          Decompose design-locked stories into atomic developer tasks, generate implementation packs, and push to Taiga.
        </p>
      </div>

      {/* Diagram collapsible */}
      <div className={cn("mb-6 rounded-md border", dark ? "border-neutral-800" : "border-slate-200")}>
        <button
          className={cn(
            "flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors",
            dark ? "text-neutral-400 hover:text-neutral-300" : "text-slate-500 hover:text-slate-700",
          )}
          onClick={() => setDiagramOpen(!diagramOpen)}
        >
          <ChevronRight className={cn("size-4 transition-transform", diagramOpen && "rotate-90")} />
          <Info className="size-4" />
          <span>View Process Diagram (How this works)</span>
        </button>
        {diagramOpen && (
          <div className={cn("border-t p-4", dark ? "border-neutral-800" : "border-slate-200")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/implementation.svg" alt="Phase 3 implementation process diagram" className="mx-auto max-w-full" />
          </div>
        )}
      </div>

      {!context && (
        <Callout>Log in and select a project to use Phase 3.</Callout>
      )}

    <div className={cn("space-y-6 border-t pt-6", dark ? "border-neutral-700" : "border-slate-200")}>
      <div className="space-y-6">
      {/* Stage stepper */}
      {(() => {
        const stages: Stage[] = ["A", "B", "C", "D"];
        const stageNums: Record<Stage, number> = { A: 1, B: 2, C: 3, D: 4 };
        const currentIdx = stages.indexOf(stage);
        return (
          <div className={cn("rounded-xl border px-6 py-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
            <div className="flex w-full items-center">
              {stages.map((s, i) => {
                const num = stageNums[s];
                const isActive = stage === s;
                const isDone = stages.indexOf(s) < currentIdx;
                const isLocked = s !== "A" && selectedStoryId === null;
                return (
                  <Fragment key={s}>
                    <button
                      onClick={() => {
                        if (s === "A") { handleStepperGoA(); return; }
                        if (selectedStoryId !== null) setStage(s);
                      }}
                      disabled={isLocked}
                      className={cn("group flex shrink-0 flex-col items-center gap-1.5 transition disabled:pointer-events-none", isLocked && "opacity-35")}
                    >
                      <span className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 transition",
                        isActive
                          ? "bg-violet-600 text-white ring-violet-400"
                          : isDone
                            ? dark ? "bg-violet-800 text-violet-200 ring-violet-700" : "bg-violet-100 text-violet-600 ring-violet-300"
                            : dark
                              ? "bg-neutral-800 text-neutral-400 ring-neutral-700 group-hover:ring-neutral-500"
                              : "bg-white text-slate-500 ring-slate-300 group-hover:ring-violet-400",
                      )}>
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : num}
                      </span>
                      <span className={cn(
                        "text-xs font-semibold whitespace-nowrap",
                        isActive
                          ? "text-violet-500"
                          : isDone
                            ? dark ? "text-violet-400" : "text-violet-500"
                            : dark ? "text-neutral-500" : "text-slate-400",
                      )}>
                        {STAGE_LABELS[s]}
                      </span>
                    </button>
                    {i < stages.length - 1 && (
                      <div className={cn(
                        "mx-2 mb-5 h-0.5 flex-1 rounded-full transition-all",
                        isDone
                          ? dark ? "bg-violet-700" : "bg-violet-300"
                          : dark ? "bg-neutral-700" : "bg-slate-200",
                      )} />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Stage content */}
      <div>
        {stage === "A" && <StageA onSelect={handleSelectStory} />}
        {stage === "B" && selectedStoryId !== null && (
          <StageB storyId={selectedStoryId} onBack={handleBackToStories} onContinue={() => setStage("C")} />
        )}
        {stage === "C" && selectedStoryId !== null && (
          <div className="space-y-6">
            <StageC storyId={selectedStoryId} />
            <div className="flex gap-2">
              <Button variant="secondary" className="gap-1.5" onClick={() => setStage("B")}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <Button className="flex-1 justify-center gap-1.5" onClick={() => setStage("D")}>
                Continue to Lock &amp; Export <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {stage === "D" && selectedStoryId !== null && (
          <StageD storyId={selectedStoryId} onLocked={handleLocked} onChooseNewStory={() => setStage("A")} onBack={() => setStage("C")} />
        )}
      </div>
      </div>
    </div>
    </section>
  );
}
