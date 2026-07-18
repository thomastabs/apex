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
  Flag,
  GitBranch,
  GitCompare,
  Info,
  Loader2,
  Lock,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import {
  decodeApexMeta,
  encodeApexMeta,
  fetchTaigaTaskFull,
  findTaigaTaskBySubject,
  useEligibleStories,
  useCrossCheckTasks,
  useGenerateProposal,
  useGenerateTasks,
  useLoadProposals,
  useLoadTaskList,
  useLockStory,
  pmTaskWebUrl,
  usePushSingleTask,
  usePushTasksToTaiga,
  useSaveProposal,
  useStoryContext,
  useUpdateTaskInTaiga,
  useUpdateTaskList,
} from "@/lib/hooks/use-phase3";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useDiffStore } from "@/lib/stores/diff-store";
import { useApiContext, useGithubContext } from "@/lib/stores/session-store";
import { SignInRequired } from "@/components/sign-in-required";
import { useAiConfig, useServerConfig, useLogDecision, useSetStoryScaffold } from "@/lib/hooks/use-workspace";
import { CrossCheckPanel, AltModelSelect } from "@/components/cross-check-panel";
import { GuideTheAI } from "@/components/guide-the-ai";
import { EFFORT_COLORS } from "@/lib/effort-colors";
import type { CrossCheckResult } from "@/lib/api/phase1";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, errMsg } from "@/lib/utils";
import { downloadZip } from "@/lib/utils/zip";
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

// Story is locked as implementation-ready once phase_status reaches any of
// these — a strict allow-list, not "!== design_locked" (gherkin_locked is
// EARLIER than design_locked, not later, and must never read as locked).
const LOCKED_PHASE_STATUSES = new Set(["implementation", "qa", "qa_passed", "deployed"]);

function EffortBadge({ estimate, onDark = false }: { estimate?: string; onDark?: boolean }) {
  if (!estimate) return null;
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ring-1",
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

// Coverage matches AI-reported covered_scenarios against parsed Gherkin titles.
// Normalize both sides so trivial differences (case, inner/outer whitespace,
// trailing punctuation, markdown bold from boldGherkinKeywords) don't produce
// false "uncovered" negatives.
function normalizeScenario(s: string): string {
  return s
    .toLowerCase()
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.:;,!?]+$/, "")
    .trim();
}

// Set of normalized scenario titles the AI claims at least one task covers.
function coveredScenarioSet(taskList: Phase3Task[]): Set<string> {
  return new Set(taskList.flatMap((t) => t.covered_scenarios ?? []).map(normalizeScenario));
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
  packs: Array<{ taskId: number; taskSubject: string; packMd: string }>,
  storyId: number,
  ctx: Phase3StoryContext,
) {
  const files = packs.map(({ taskId, taskSubject, packMd }) => {
    const full = [`# Developer Pack — ${taskSubject}`, `## Story: US#${ctx.story_id} — ${ctx.title}`, "", packMd].join("\n");
    const slug = taskSubject.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    return { filename: `pack-${taskId}-${slug}.md`, content: full };
  });
  downloadZip(files, `story-${storyId}-packs.zip`);
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
  const t = useT();
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

  const activeEpic = usePhase3Store((s) => s.browsingEpic);
  const setActiveEpic = usePhase3Store((s) => s.setBrowsingEpic);
  const page = usePhase3Store((s) => s.browsingPage);
  const setPage = usePhase3Store((s) => s.setBrowsingPage);
  const setScaffold = useSetStoryScaffold();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.loadingStories")}
      </div>
    );
  }
  if (error) {
    return <Callout variant="danger">{t("phase3.failedLoadStories", { err: errMsg(error) })}</Callout>;
  }

  const stories = data?.stories ?? [];
  if (stories.length === 0) {
    return (
      <Callout>
        {t("phase3.noEligibleStories")}
      </Callout>
    );
  }

  const byEpic = new Map<string, typeof stories>();
  for (const s of stories) {
    const epic = s.epic_title || "Ungrouped";
    if (!byEpic.has(epic)) byEpic.set(epic, []);
    byEpic.get(epic)!.push(s);
  }
  // Scaffold story (the one carrying shared runtime plumbing the rest of the
  // epic builds on) sorts to the front of its epic — build it first. Stable
  // sort preserves the existing story_id order within each group otherwise.
  for (const arr of byEpic.values()) {
    arr.sort((a, b) => Number(b.is_scaffold) - Number(a.is_scaffold));
  }
  const epics = [...byEpic.keys()];
  // Fall back to the first epic if nothing was browsed yet, or the persisted
  // epic no longer has eligible stories (e.g. all got implemented, or a
  // different project loaded) — otherwise the picker would render empty.
  const currentEpic = activeEpic && epics.includes(activeEpic) ? activeEpic : epics[0];
  const epicStories = byEpic.get(currentEpic) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{t("phase3.selectStoryTitle")}</SectionHeading>
        <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
          {t("phase3.selectStoryDesc")}
        </p>
        <p className={cn("mt-1.5 flex items-start gap-1.5 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
          <Flag className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {t("phase3.scaffoldHint")}
          </span>
        </p>
      </div>

      {/* Epic dropdown */}
      <div className="flex items-center gap-3">
        <label htmlFor="phase3-epic-select" className="text-xs font-semibold uppercase tracking-wider text-neutral-500 shrink-0">
          {t("phase3.epicLabel")}
        </label>
        <div className="relative flex-1 max-w-sm">
          <select
            id="phase3-epic-select"
            value={currentEpic}
            onChange={(e) => setActiveEpic(e.target.value)}
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
                  // A real nested <button> (the scaffold toggle) can't live inside
                  // another <button> — this card is a div+role=button instead,
                  // same click/keyboard behaviour, so the toggle can be a genuine
                  // interactive control instead of a second layer of onClick tricks.
                  <div
                    key={story.story_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(story.story_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(story.story_id); }
                    }}
                    className={cn(
                      "group flex h-full cursor-pointer flex-col rounded-xl border p-5 text-left transition-all duration-150",
                      dark
                        ? "border-neutral-700 bg-neutral-900 hover:border-violet-500 hover:bg-neutral-800/80"
                        : "border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50",
                    )}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className={cn(
                        "inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold",
                        dark ? "bg-neutral-800 text-violet-400 ring-1 ring-neutral-700" : "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                      )}>
                        US#{story.story_id}
                      </span>
                      <button
                        type="button"
                        title={story.is_scaffold
                          ? t("phase3.scaffoldUnmarkTitle")
                          : t("phase3.scaffoldMarkTitle")}
                        disabled={setScaffold.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          setScaffold.mutate(
                            { storyId: story.story_id, isScaffold: !story.is_scaffold },
                            {
                              onSuccess: () => toast.success(story.is_scaffold ? t("phase3.toast.scaffoldUnmarked") : t("phase3.toast.scaffoldMarked")),
                              onError: () => toast.error(t("phase3.toast.scaffoldFailed")),
                            },
                          );
                        }}
                        className={cn(
                          "inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50",
                          story.is_scaffold
                            ? dark ? "bg-amber-900/40 text-amber-300 ring-1 ring-amber-800" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : dark ? "text-neutral-600 ring-1 ring-neutral-800 hover:text-amber-400 hover:ring-amber-800" : "text-slate-400 ring-1 ring-slate-200 hover:text-amber-600 hover:ring-amber-300",
                        )}
                      >
                        <Flag className="h-3 w-3" /> {story.is_scaffold ? t("phase3.scaffoldBadgeMarked") : t("phase3.scaffoldBadgeUnmarked")}
                      </button>
                      {(() => {
                        // phase_status and has_proposal are independent signals — a
                        // story can have packs generated (tasks decomposed, some/all
                        // packs written) without being locked yet (Stage D's "Lock
                        // Story" not clicked), so "locked" must never be inferred
                        // from anything other than phase_status actually reaching
                        // implementation-or-later.
                        const isLocked = LOCKED_PHASE_STATUSES.has(story.phase_status);
                        if (isLocked) {
                          return (
                            <span
                              title={t("phase3.lockedTitle")}
                              className={cn(
                                "inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                                dark ? "bg-emerald-900/40 text-emerald-300 ring-1 ring-emerald-800" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
                              )}
                            >
                              <Lock className="h-3 w-3" /> {t("phase3.lockedBadge")}
                            </span>
                          );
                        }
                        if (story.has_proposal) {
                          return (
                            <span
                              title={t("phase3.packsGeneratedTitle")}
                              className={cn(
                                "inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                                dark ? "bg-amber-900/40 text-amber-300 ring-1 ring-amber-800" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
                              )}
                            >
                              <Package className="h-3 w-3" /> {t("phase3.packsGeneratedBadge")}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <p className={cn("text-base font-bold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                      {story.title}
                    </p>
                    {story.gherkin_preview && (() => {
                      const scenarios = cleanGherkinPreview(story.gherkin_preview);
                      return scenarios.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {scenarios.map((sc, i) => (
                            <span key={i} className={cn(
                              "rounded-md px-2 py-0.5 text-xs font-medium leading-snug",
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
                            title={t("phase3.tasksInPmBoard")}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                              dark ? "bg-violet-900/40 text-violet-300" : "bg-violet-100 text-violet-700",
                            )}
                          >
                            {t(count === 1 ? "phase3.tasksCountOne" : "phase3.tasksCountOther", { n: count })}
                          </span>
                        ) : (
                          <span className={cn("text-xs", dark ? "text-neutral-700" : "text-slate-300")}>
                            {t("phase3.noTasksYet")}
                          </span>
                        );
                      })()}
                      <span className={cn(
                        "flex items-center gap-1 text-[11px] font-medium transition",
                        dark ? "text-neutral-600 group-hover:text-violet-400" : "text-slate-400 group-hover:text-violet-600",
                      )}>
                        {t("phase3.implement")} <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-30",
                    dark ? "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm",
                  )}
                >
                  {t("phase3.prev")}
                </button>
                <span className="text-xs text-neutral-500">
                  {t("phase3.pageOf", { page: safePage + 1, count: pageCount, stories: epicStories.length })}
                </span>
                <button
                  onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                  disabled={safePage === pageCount - 1}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-30",
                    dark ? "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm",
                  )}
                >
                  {t("phase3.next")}
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
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const pmWebUrl = useServerConfig().data?.pm_web_url;
  const queryClient = useQueryClient();
  const { data: ctx, isLoading: ctxLoading } = useStoryContext(storyId);
  const { taskList, tasksPushed, packDrafts, setCurrentStoryMeta, patchTask, setTaskList, removePushedStoryId } = usePhase3Store();
  const crossCheckTasksMut = useCrossCheckTasks();
  const [crossResult, setCrossResult] = useState<CrossCheckResult | null>(null);
  const [altModel, setAltModel] = useState("");
  const [taskGuidance, setTaskGuidance] = useState("");
  const aiConfig = useAiConfig();
  const crossEnabled = (aiConfig.data?.configured_providers?.length ?? 0) >= 2;
  const { addTask, removeTask, updateTask, reorderTasks } = useUpdateTaskList();

  const updateInTaigaMut = useUpdateTaskInTaiga();
  const pushSingleMut = usePushSingleTask();

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
        <Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.loadingStoryContext")}
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
          {t("phase3.backToStories")}
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
                {t("phase3.acceptanceCriteria")}
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
      <GuideTheAI
        value={taskGuidance}
        onChange={setTaskGuidance}
        dark={dark}
        disabled={generateTasksMut.isPending}
        placeholder={t("phase3.taskGuidancePlaceholder")}
      />
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="w-full justify-center"
          // Block regeneration only when a pushed story still has tasks loaded
          // (use Clear first to avoid diverging from the PM board). When the list
          // is empty there is nothing to diverge from, so always allow generating
          // — otherwise a previously-pushed story with no loaded tasks deadlocks.
          onClick={() => generateTasksMut.mutate({ storyId, instructions: taskGuidance })}
          disabled={generateTasksMut.isPending || (tasksPushed && taskList.length > 0)}
        >
          {generateTasksMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.generating")}</>
            : <><Sparkles className="h-4 w-4" /> {t("phase3.generateTasks")}</>}
        </Button>
        {generateTasksMut.isPending && (
          <CancelButton onCancel={() => generateTasksMut.cancel()} className="w-full" />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-1.5" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" /> {t("common.back")}
          </Button>
          <Button
            className="flex-1 justify-center"
            variant="secondary"
            onClick={onContinue}
          >
            {t("phase3.developerPacksLink")} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {tasksPushed && (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("phase3.pushed")}
          </div>
        </div>
      )}

      {generateTasksMut.isPending && (
        <AIProgressIndicator
          steps={[t("phase3.step.analysingStory"), t("phase3.step.reviewingDesign"), t("phase3.step.decomposing")]}
          isPending={generateTasksMut.isPending}
          dark={dark}
        />
      )}

      {crossEnabled && taskList.length > 0 ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <AltModelSelect aiConfig={aiConfig.data} value={altModel} onChange={setAltModel} dark={dark} disabled={crossCheckTasksMut.isPending} />
            <Button
              variant="secondary"
              className="flex-1 justify-center gap-1.5"
              disabled={crossCheckTasksMut.isPending}
              onClick={() =>
                crossCheckTasksMut.mutate({ storyId, altModel }, {
                  onSuccess: (r) => {
                    setCrossResult(r);
                    toast.success(
                      r.only_alt.length
                        ? t(r.only_alt.length === 1 ? "phase3.toast.crossCheckTasksFoundOne" : "phase3.toast.crossCheckTasksFoundOther", { altLabel: r.alt_label, n: r.only_alt.length })
                        : t("phase3.toast.crossCheckTasksAgreed", { altLabel: r.alt_label }),
                    );
                  },
                })
              }
            >
              <GitCompare className="h-4 w-4" /> {crossCheckTasksMut.isPending ? t("phase1.crossChecking") : t("phase3.crossCheckTasks")}
            </Button>
          </div>
          {crossCheckTasksMut.isPending && <CancelButton onCancel={() => crossCheckTasksMut.cancel()} className="w-full" />}
          {crossResult ? (
            <CrossCheckPanel
              result={crossResult}
              dark={dark}
              noun="task"
              onDismiss={() => setCrossResult(null)}
              onAdd={(s) => {
                const nid = taskList.length > 0 ? Math.max(...taskList.map((t) => t.id)) + 1 : 1;
                setTaskList([...taskList, {
                  id: nid, subject: s.title, description: s.description,
                  effort_estimate: "M", covered_scenarios: [], predecessor_task_ids: [],
                }]);
                toast.success(t("phase3.toast.taskAdded"));
              }}
            />
          ) : null}
        </div>
      ) : null}

      {/* Task list */}
      {taskList.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeading>{t("phase3.tasksHeading", { n: taskList.length })}</SectionHeading>
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
              {t("phase3.clear")}
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
                        "w-full rounded-lg border px-3 py-1.5 text-sm font-medium outline-none",
                        dark ? "border-neutral-600 bg-neutral-800 text-white focus:border-violet-500" : "border-slate-300 bg-white text-slate-900 focus:border-violet-500",
                      )}
                      value={task.subject}
                      onChange={(e) => updateTask(task.id, { subject: e.target.value })}
                    />
                    {descFetching && editingId === task.id ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-400 py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> {t("phase3.loading")}
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
                      <label htmlFor={`effort-${task.id}`} className="text-xs text-neutral-500 w-14 shrink-0">{t("phase3.effortLabel")}</label>
                      <select
                        id={`effort-${task.id}`}
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
                        <span className="text-xs text-neutral-500">{t("phase3.dependsOn")}</span>
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
                                {t("phase3.taskDependency", { n: taskList.findIndex((t) => t.id === other.id) + 1, subject: other.subject })}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" className="gap-1.5" onClick={() => setEditingId(null)}>
                        <CheckCircle2 className="h-4 w-4" /> {t("phase3.done")}
                      </Button>
                      {(task.pm_task_id ?? task.taiga_task_id) && (
                        <Button
                          variant="primary"
                          className="gap-1.5"
                          onClick={() => updateInTaigaMut.mutate({ pmTaskId: task.pm_task_id ?? String(task.taiga_task_id!), task })}
                          disabled={updateInTaigaMut.isPending}
                        >
                          {updateInTaigaMut.isPending
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.saving")}</>
                            : <><CheckCircle2 className="h-4 w-4" /> {t("phase3.save")}</>}
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
                            aria-label={t("phase3.moveTaskUp")}
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
                            aria-label={t("phase3.moveTaskDown")}
                            className={cn(
                              "rounded p-1 transition disabled:opacity-20",
                              dark ? "text-neutral-500 hover:text-neutral-200" : "text-slate-400 hover:text-slate-600",
                            )}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {(() => {
                        const url = pmTaskWebUrl(context, task.pm_task_ref, pmWebUrl);
                        return url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t("phase3.openInPmTool")}
                            className={cn(
                              "rounded p-1 transition",
                              dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
                            )}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null;
                      })()}
                      <button
                        onClick={() => setEditingId(task.id)}
                        className={cn(
                          "rounded px-2 py-1 text-xs font-medium transition",
                          dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        {t("phase3.edit")}
                      </button>
                      {!tasksPushed && (
                        <button
                          onClick={() => removeTask(task.id)}
                          aria-label={t("phase3.deleteTask")}
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
                "flex-1 rounded-lg border px-3 py-2 text-sm outline-none",
                dark
                  ? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-600 focus:border-violet-500"
                  : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-500",
              )}
              placeholder={tasksPushed ? t("phase3.addTaskPmPlaceholder") : t("phase3.addTaskManualPlaceholder")}
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
              onClick={() => {
                if (!window.confirm(t("phase3.pushTasksConfirm", { n: taskList.length }))) return;
                pushToTaiga.mutate(storyId);
              }}
              disabled={pushToTaiga.isPending || taskList.length === 0}
              variant="secondary"
            >
              {pushToTaiga.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.pushing")}</>
                : <><Upload className="h-4 w-4" /> {t("phase3.pushTasks")}</>}
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
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const githubCtx = useGithubContext();
  const { data: ctx } = useStoryContext(storyId);
  const { taskList, packDrafts, prevPackDrafts, pmTaskRefs, setPackDraft, restorePackDraft } = usePhase3Store();
  const requestDiff = useDiffStore((s) => s.requestDiff);
  const logDecision = useLogDecision();
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

  const commitPack = (taskId: number, proposalMd: string) => {
    setPackDraft(taskId, proposalMd);
    saveProposalMut.mutate(
      { story_id: storyId, task_id: taskId, proposal_md: proposalMd },
      { onError: () => toast.error(t("phase3.toast.packSaveFailed")) },
    );
  };

  const handleGenerate = async (taskId: number, hint?: string, opts?: { gate?: boolean }) => {
    const task = taskList.find((t) => t.id === taskId);
    if (!task) return;
    const prev = packDrafts[taskId] ?? "";
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
          // Regenerate over an existing pack → show the diff and let the user
          // accept/discard. First generation (or bulk) commits directly.
          if (opts?.gate !== false && prev.trim() && prev !== data.proposal_md) {
            requestDiff({
              title: t("phase3.diffTitle", { id: taskId }),
              oldText: prev,
              newText: data.proposal_md,
              onAccept: () => commitPack(taskId, data.proposal_md),
              onDiscard: () => logDecision.mutate({
                scope: t("phase3.logDecisionScope", { id: taskId }),
                summary: t("phase3.logDecisionSummary"),
                reason: t("phase3.logDecisionReason"),
              }),
            });
          } else {
            commitPack(taskId, data.proposal_md);
          }
        },
      },
    );
  };

  // Bulk generation: process one task at a time, waiting for each to finish
  useEffect(() => {
    if (bulkQueue.length === 0 || generatingTaskId !== null) return;
    const [nextId, ...rest] = bulkQueue;
    setBulkQueue(rest);
    void handleGenerate(nextId, undefined, { gate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkQueue, generatingTaskId]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("phase3.toast.copied", { label }));
    } catch {
      toast.error(t("phase3.toast.clipboardDenied"));
    }
  };

  const handleCopyPrompt = () => copyToClipboard(extractAiPrompt(packMd), t("phase3.chatPrompt"));
  const handleCopyAgenticBrief = () => {
    const brief = extractAgenticBrief(packMd);
    if (!brief) { toast.error(t("phase3.toast.noAgenticBrief")); return; }
    void copyToClipboard(brief, t("phase3.agenticBrief"));
  };
  if (taskList.length === 0) {
    return <Callout>{t("phase3.finalizeTasksFirst")}</Callout>;
  }

  return (
    <div className="space-y-4">
      {/* Progress bar + Generate All */}
      <div className={cn("rounded-xl border p-4", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50")}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("phase3.packsGeneratedLabel")}</span>
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
                ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("phase3.tasksLeft", { n: bulkQueue.length })}</>
                : <><Sparkles className="h-3 w-3" /> {t("phase3.generateAll")}</>}
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
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("phase3.tasksSidebarLabel")}</p>
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
                    ? "bg-violet-600 text-white"
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
                    <p className={cn("text-xs font-mono mb-0.5", isSelected ? "text-violet-200" : "text-neutral-500")}>
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
                      {t("phase3.storyTaskLabel", { storyId, n: taskList.findIndex((tt) => tt.id === selectedTask.id) + 1 })}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("text-sm font-semibold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                        {selectedTask.subject}
                      </p>
                      <EffortBadge estimate={selectedTask.effort_estimate} />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void handleGenerate(selectedTask.id, hints[selectedTask.id])}
                    disabled={generatingTaskId !== null}
                  >
                    {generatingTaskId === selectedTask.id
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.generating")}</>
                      : <><Sparkles className="h-4 w-4" /> {packMd ? t("phase3.regenerate") : t("phase3.generatePack")}</>}
                  </Button>
                  {generatingTaskId === selectedTask.id && (
                    <CancelButton onCancel={() => { generateProposal.cancel(); setGeneratingTaskId(null); setBulkQueue([]); }} />
                  )}
                  {prevPackDrafts[selectedTask.id] && (
                    <Button
                      variant="secondary"
                      title={t("phase3.undoRegenerationTitle")}
                      onClick={() => {
                        restorePackDraft(selectedTask.id);
                        saveProposalMut.mutate(
                          { story_id: storyId, task_id: selectedTask.id, proposal_md: prevPackDrafts[selectedTask.id] },
                          { onError: () => toast.error(t("phase3.toast.restoreFailed")) },
                        );
                      }}
                    >
                      <Undo2 className="h-4 w-4" /> {t("phase3.restore")}
                    </Button>
                  )}
                  {packMd && (
                    <>
                      <Button variant="secondary" onClick={handleCopyAgenticBrief} title={t("phase3.copyAgenticBriefTitle")}>
                        <Clipboard className="h-4 w-4" /> {t("phase3.agenticBrief")}
                      </Button>
                      <Button variant="secondary" onClick={() => void handleCopyPrompt()} title={t("phase3.copyChatPromptTitle")}>
                        <Clipboard className="h-4 w-4" /> {t("phase3.chatPrompt")}
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
                        toast.success(t("phase3.toast.branchCopied"));
                      }}
                      title={t("phase3.copyBranchTitle")}
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
                    placeholder={t("phase3.hintPlaceholder")}
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
                      t("phase3.step.readingStory"),
                      t("phase3.step.analysingDesign"),
                      t("phase3.step.writingSteps"),
                      t("phase3.step.mappingFiles"),
                      t("phase3.step.generatingAssertions"),
                      t("phase3.step.buildingBrief"),
                      t("phase3.step.assemblingPrompt"),
                    ]}
                    isPending={generatingTaskId === selectedTask.id}
                    dark={dark}
                  />
                )}

                {packMd ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("phase3.editLabel")}</p>
                      <Textarea
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
                        className="font-mono text-xs h-[34rem] resize-y"
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("phase3.previewLabel")}</p>
                      <MarkdownPreview content={packMd} dark={dark} className="h-[34rem] resize-y" />
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center",
                    dark ? "border-neutral-700" : "border-slate-200",
                  )}>
                    <Sparkles className={cn("mb-3 h-8 w-8", dark ? "text-neutral-600" : "text-slate-300")} />
                    <p className={cn("text-sm font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                      {t("phase3.noPackYet")}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {t("phase3.noPackHint")}
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
                {t("phase3.selectTaskHint")}
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
  const t = useT();
  const allScenarios = parseGherkinScenarios(gherkin);
  if (allScenarios.length === 0) return null;
  const hasCoverageData = taskList.some((t) => (t.covered_scenarios?.length ?? 0) > 0);
  const coveredSet = coveredScenarioSet(taskList);
  const isCovered = (sc: string) => coveredSet.has(normalizeScenario(sc));
  const uncovered = allScenarios.filter((sc) => !isCovered(sc));

  return (
    <div className={cn("rounded-xl border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
      <div className={cn(
        "px-5 py-3 border-b flex items-center justify-between",
        dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
      )}>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {t("phase3.coverageTitle")}
          <span className="ml-2 normal-case font-normal italic text-neutral-500">{t("phase3.coverageAiAsserted")}</span>
        </p>
        <span
          className={cn("text-xs font-medium", uncovered.length > 0 ? (dark ? "text-amber-400" : "text-amber-600") : (dark ? "text-emerald-400" : "text-emerald-600"))}
          title={t("phase3.coverageSelfReportedTitle")}
        >
          {t("phase3.coverageRatio", { covered: allScenarios.length - uncovered.length, total: allScenarios.length })}
        </span>
      </div>
      <div className={cn("px-5 py-3 space-y-1.5", dark ? "bg-neutral-900/50" : "bg-white")}>
        {!hasCoverageData && (
          <p className={cn("text-xs mb-2", dark ? "text-amber-400" : "text-amber-600")}>
            {t("phase3.coverageDataMissing")}
          </p>
        )}
        {allScenarios.map((sc) => {
          const covered = isCovered(sc);
          return (
            <div key={sc} className="flex items-center gap-2">
              {covered
                ? <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", dark ? "text-emerald-400" : "text-emerald-600")} />
                : <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-2 inline-block", dark ? "border-amber-400" : "border-amber-600")} />}
              <span className={cn(
                "text-xs",
                covered
                  ? (dark ? "text-neutral-300" : "text-slate-700")
                  : (dark ? "text-amber-400 font-medium" : "text-amber-700 font-medium"),
              )}>
                {sc}
              </span>
            </div>
          );
        })}
        {uncovered.length > 0 && (
          <p className={cn("mt-2 text-xs", dark ? "text-amber-400" : "text-amber-600")}>
            {t(uncovered.length === 1 ? "phase3.uncoveredOne" : "phase3.uncoveredOther", { n: uncovered.length })}
          </p>
        )}
        <p className={cn("mt-2 text-[11px] leading-snug", dark ? "text-neutral-600" : "text-slate-400")}>
          {t("phase3.coverageFooter")}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage D — Lock & Export
// ---------------------------------------------------------------------------

function StageD({ storyId, onLocked, onChooseNewStory, onBack }: { storyId: number; onLocked: () => void; onChooseNewStory: () => void; onBack: () => void }) {
  const t = useT();
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
  const coveredSet = coveredScenarioSet(taskList);
  const uncoveredScenarios = allScenarios.filter((sc) => !coveredSet.has(normalizeScenario(sc)));
  const coverageOk = allScenarios.length === 0 || uncoveredScenarios.length === 0;

  const canLock = generatedTasks.length > 0 && (coverageOk || overrideCoverage);

  const handleLock = () => {
    if (!window.confirm(t("phase3.lockConfirm"))) return;
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
    const packs = generatedTasks.map((t) => ({ taskId: t.id, taskSubject: t.subject, packMd: packDrafts[t.id] }));
    downloadAllPacks(packs, storyId, ctx);
  };

  const handleCreateIssue = async () => {
    if (!githubCtx || !ctx) return;
    setCreatingIssue(true);
    const title = t("phase3.githubIssueTitle", { storyId, title: ctx.title });
    const taskLines = generatedTasks.map((gt, i) => {
      const summary = extractContext(packDrafts[gt.id] ?? "");
      return `- [ ] **Task ${i + 1}: ${gt.subject}** (${gt.effort_estimate ?? "M"})${summary ? `\n  > ${summary}` : ""}`;
    }).join("\n");
    const body = t("phase3.githubIssueBody", { taskLines });
    try {
      const { url } = await createGithubIssue(githubCtx, title, body);
      setIssueUrl(url);
      toast.success(t("phase3.toast.issueCreated"));
    } catch (err) {
      toast.error(t("phase3.toast.issueFailed", { err: err instanceof Error ? err.message : "Unknown error" }));
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
              {t("phase3.storyLocked")}
            </p>
            <p className={cn("text-xs mt-0.5", dark ? "text-emerald-600" : "text-emerald-600")}>
              {t(generatedTasks.length === 1 ? "phase3.packsReadyOne" : "phase3.packsReadyOther", { n: generatedTasks.length })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full justify-center" variant="secondary" onClick={handleExportAll}>
            <Download className="h-4 w-4" /> {t("phase3.exportAllPacks")}
          </Button>
          {githubCtx && !issueUrl && (
            <Button className="w-full justify-center" variant="secondary" onClick={() => void handleCreateIssue()} disabled={creatingIssue}>
              {creatingIssue
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.creatingIssue")}</>
                : <><GitBranch className="h-4 w-4" /> {t("phase3.createGithubIssue")}</>}
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
              <ExternalLink className="h-4 w-4" /> {t("phase3.viewGithubIssue")}
            </a>
          )}
          <Button className="w-full justify-center gap-1.5" variant="secondary" onClick={handleChooseNew}>
            <RefreshCw className="h-4 w-4" /> {t("phase3.chooseNewStory")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{t("phase3.lockExportHeading")}</SectionHeading>
        <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
          {t("phase3.lockExportDesc")}
        </p>
      </div>

      {/* Summary card */}
      <div className={cn("rounded-xl border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
        <div className={cn("px-5 py-4 border-b", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50")}>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("phase3.summary")}</p>
        </div>
        <div className={cn("px-5 py-4 space-y-3", dark ? "bg-neutral-900/50" : "bg-white")}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">{t("phase3.packsReadyLabel")}</span>
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
                {t(skippedTasks.length === 1 ? "phase3.skippedTasksOne" : "phase3.skippedTasksOther", { n: skippedTasks.length })}
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
            {t(uncoveredScenarios.length === 1 ? "phase3.acknowledgeUncoveredOne" : "phase3.acknowledgeUncoveredOther", { n: uncoveredScenarios.length })}
          </span>
        </label>
      )}

      {generatedTasks.length === 0 && (
        <Callout variant="warning">{t("phase3.generatePackFirst")}</Callout>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={lockStoryMut.isPending}>
            <ChevronLeft className="h-4 w-4" /> {t("common.back")}
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={handleLock}
            disabled={!canLock || lockStoryMut.isPending}
          >
            {lockStoryMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.locking")}</>
              : <><Lock className="h-4 w-4" /> {t("phase3.lockStory")}</>}
          </Button>
        </div>
        {canLock && (
          <Button className="w-full justify-center" variant="secondary" onClick={handleExportAll}>
            <Download className="h-4 w-4" /> {t("phase3.exportAllPacks")}
          </Button>
        )}
        <Button className="w-full justify-center" variant="secondary" onClick={handleChooseNew}>
          {t("phase3.chooseNewStory")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type Stage = "A" | "B" | "C" | "D";

const STAGE_LABEL_KEYS: Record<Stage, TranslationKey> = {
  A: "phase3.stage.selectStory",
  B: "phase3.stage.decompose",
  C: "phase3.stage.developerPacks",
  D: "phase3.stage.lockExport",
};

export function Phase3Workflow() {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const { selectedStoryId, setSelectedStoryId, clearPhase3Draft } = usePhase3Store();
  const [stage, setStage] = useState<Stage>(selectedStoryId !== null ? "B" : "A");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [lockedStoryId, setLockedStoryId] = useState<number | null>(null);

  // Hoist load hooks so they fire regardless of active stage (e.g. stepper jump)
  useLoadTaskList(selectedStoryId);
  useLoadProposals(selectedStoryId);

  const mutedClass = dark ? "text-neutral-400" : "text-slate-600";

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
        <p className={cn("mb-1 text-xs font-bold uppercase tracking-widest", dark ? "text-violet-400" : "text-violet-600")}>{t("common.phaseEyebrow", { n: 3 })}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("phase3.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          {t("phase3.subtitle")}
        </p>
      </div>

      {!context ? <SignInRequired unlocks={t("phase3.signInUnlocks")} /> : null}

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
          <span>{t("common.viewProcessDiagram")}</span>
        </button>
        {diagramOpen && (
          <div className={cn("border-t p-4", dark ? "border-neutral-800" : "border-slate-200")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/implementation.svg" alt={t("phase3.diagramAlt")} className="mx-auto max-w-full" />
          </div>
        )}
      </div>

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
                        isActive || isDone
                          ? dark ? "text-violet-400" : "text-violet-600"
                          : dark ? "text-neutral-500" : "text-slate-400",
                      )}>
                        {t(STAGE_LABEL_KEYS[s])}
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
        {stage === "A" && context && <StageA onSelect={handleSelectStory} />}
        {stage === "B" && selectedStoryId !== null && (
          <StageB storyId={selectedStoryId} onBack={handleBackToStories} onContinue={() => setStage("C")} />
        )}
        {stage === "C" && selectedStoryId !== null && (
          <div className="space-y-6">
            <StageC storyId={selectedStoryId} />
            <div className="flex gap-2">
              <Button variant="secondary" className="gap-1.5" onClick={() => setStage("B")}>
                <ChevronLeft className="h-4 w-4" /> {t("common.back")}
              </Button>
              <Button className="flex-1 justify-center gap-1.5" onClick={() => setStage("D")}>
                {t("phase3.continueToLockExport")} <ChevronRight className="h-4 w-4" />
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
