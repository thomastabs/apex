"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Download,
  Info,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  useEligibleStories,
  useGenerateProposal,
  useGenerateTasks,
  useLockStory,
  usePushTasksToTaiga,
  useSaveProposal,
  useStoryContext,
  useUpdateTaskList,
} from "@/lib/hooks/use-phase3";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import type { Phase3StoryContext } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

function buildContextAppendix(ctx: Phase3StoryContext): string {
  return [
    "## Project Concept",
    ctx.project_concept || "_Not set_",
    "",
    "## Tech Stack",
    ctx.tech_stack || "_Not set_",
    "",
    "## Acceptance Criteria (Gherkin)",
    ctx.gherkin || "_Not set_",
    "",
    "## Technical Spec",
    ctx.technical_spec || "_Not set_",
    "",
    "## Design Bundle",
    ctx.design_bundle || "_Not set_",
  ].join("\n");
}

function downloadPack(taskSubject: string, packMd: string, ctx: Phase3StoryContext) {
  const appendix = buildContextAppendix(ctx);
  const full = [
    `# Developer Pack — ${taskSubject}`,
    `## Story: US#${ctx.story_id} — ${ctx.title}`,
    "",
    packMd,
    "",
    "---",
    "",
    "# Context Appendix",
    "> Files used to generate this pack",
    "",
    appendix,
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
    [`# Developer Pack — ${taskSubject}`, "", packMd].join("\n"),
  );
  const appendix = buildContextAppendix(ctx);
  const full = [
    ...parts,
    "",
    "---",
    "",
    "# Context Appendix",
    "> Files used to generate these packs",
    "",
    appendix,
  ].join("\n\n---\n\n");
  blobDownload(full, `story-${storyId}-packs.md`);
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

function extractAiPrompt(packMd: string): string {
  const idx = packMd.indexOf("## AI Prompt");
  return idx !== -1 ? packMd.slice(idx + "## AI Prompt".length).trim() : packMd;
}

// ---------------------------------------------------------------------------
// Stage A — Story selection
// ---------------------------------------------------------------------------

function StageA({ onSelect }: { onSelect: (id: number) => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data, isLoading, error } = useEligibleStories();
  const [activeEpic, setActiveEpic] = useState<string | null>(null);

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

      {/* 2×2 paginated horizontal scroll */}
      {(() => {
        type Slot = (typeof epicStories)[number] | null;
        const chunks: Slot[][] = [];
        for (let i = 0; i < epicStories.length; i += 4) {
          const chunk: Slot[] = epicStories.slice(i, i + 4);
          while (chunk.length < 4) chunk.push(null);
          chunks.push(chunk);
        }
        const pageCount = chunks.length;
        return (
          <>
            <div
              className="flex overflow-x-auto gap-0"
              style={{ scrollSnapType: "x mandatory", scrollBehavior: "smooth" }}
            >
              {chunks.map((chunk, ci) => (
                <div
                  key={ci}
                  className="grid shrink-0 w-full grid-cols-2 gap-4 pr-0"
                  style={{ scrollSnapAlign: "start" }}
                >
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
                        <p className={cn("text-sm font-semibold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                          {story.title}
                        </p>
                        {story.gherkin_preview && (
                          <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-neutral-500">
                            {story.gherkin_preview}
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-end pt-4">
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
              ))}
            </div>
            {pageCount > 1 && (
              <p className="text-center text-xs text-neutral-500">
                Scroll horizontally to see all {epicStories.length} stories ({pageCount} pages of 4)
              </p>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage B — Task decomposition
// ---------------------------------------------------------------------------

function StageB({ storyId, onBack }: { storyId: number; onBack: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx, isLoading: ctxLoading } = useStoryContext(storyId);
  const { taskList, tasksPushed } = usePhase3Store();
  const { addTask, removeTask, updateTask } = useUpdateTaskList();
  const generateTasksMut = useGenerateTasks();
  const pushToTaiga = usePushTasksToTaiga();

  const [newSubject, setNewSubject] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const nextId = taskList.length > 0 ? Math.max(...taskList.map((t) => t.id)) + 1 : 1;

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
          className={cn("text-xs font-medium transition", dark ? "text-neutral-400 hover:text-violet-400" : "text-slate-500 hover:text-violet-600")}
        >
          ← Stories
        </button>
        <ChevronRight className="h-3 w-3 text-neutral-500" />
        <span className={cn(
          "inline-flex items-center gap-1.5 text-xs font-mono font-semibold",
          dark ? "text-violet-400" : "text-violet-700",
        )}>
          US#{storyId}
        </span>
        <span className="text-sm font-medium truncate">{ctx?.title}</span>
      </div>

      {/* Gherkin preview */}
      {ctx?.gherkin && (
        <div className={cn("rounded-xl border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
          <div className={cn("px-4 py-2.5 flex items-center gap-2", dark ? "bg-neutral-800 border-b border-neutral-700" : "bg-slate-50 border-b border-slate-200")}>
            <span className={cn("text-xs font-semibold uppercase tracking-wider", dark ? "text-neutral-400" : "text-slate-500")}>
              Acceptance Criteria
            </span>
          </div>
          <pre className={cn(
            "max-h-44 overflow-y-auto p-4 text-xs whitespace-pre-wrap leading-relaxed",
            dark ? "bg-neutral-950 text-neutral-300" : "bg-white text-slate-700",
          )}>
            {ctx.gherkin}
          </pre>
        </div>
      )}

      {/* Generate tasks */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={() => generateTasksMut.mutate(storyId)}
          disabled={generateTasksMut.isPending || tasksPushed}
        >
          {generateTasksMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating tasks…</>
            : <><Sparkles className="h-4 w-4" /> Generate Tasks</>}
        </Button>
        {tasksPushed && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pushed to Taiga
          </span>
        )}
      </div>

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
                    <Textarea
                      rows={3}
                      value={task.description}
                      onChange={(e) => updateTask(task.id, { description: e.target.value })}
                    />
                    <Button variant="secondary" onClick={() => setEditingId(null)}>Done</Button>
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
                      <p className={cn("text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                        {task.subject}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{task.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setEditingId(task.id)}
                        disabled={tasksPushed}
                        className={cn(
                          "rounded px-2 py-1 text-xs font-medium transition disabled:opacity-40",
                          dark ? "text-neutral-400 hover:text-neutral-200" : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeTask(task.id)}
                        disabled={tasksPushed}
                        className="rounded px-2 py-1 text-xs text-red-500 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add manual task */}
          {!tasksPushed && (
            <div className="flex gap-2">
              <input
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm",
                  dark
                    ? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-600"
                    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                )}
                placeholder="Add a task manually…"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubject.trim()) {
                    addTask({ id: nextId, subject: newSubject.trim(), description: "" });
                    setNewSubject("");
                  }
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (newSubject.trim()) {
                    addTask({ id: nextId, subject: newSubject.trim(), description: "" });
                    setNewSubject("");
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Stage B.5 — Push to Taiga */}
          {!tasksPushed && (
            <Button
              onClick={() => pushToTaiga.mutate(storyId)}
              disabled={pushToTaiga.isPending || taskList.length === 0}
              variant="secondary"
            >
              {pushToTaiga.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing to Taiga…</>
                : "Push Tasks to Taiga"}
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
  const { data: ctx } = useStoryContext(storyId);
  const { taskList, packDrafts, taigaTaskRefs } = usePhase3Store();
  const { setPackDraft } = usePhase3Store();
  const generateProposal = useGenerateProposal();
  const saveProposalMut = useSaveProposal();

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [generatingTaskId, setGeneratingTaskId] = useState<number | null>(null);

  const selectedTask = taskList.find((t) => t.id === selectedTaskId) ?? null;
  const packMd = selectedTaskId !== null ? (packDrafts[selectedTaskId] ?? "") : "";
  const generatedCount = taskList.filter((t) => Boolean(packDrafts[t.id])).length;

  const handleGenerate = (taskId: number) => {
    const task = taskList.find((t) => t.id === taskId);
    if (!task) return;
    setGeneratingTaskId(taskId);
    generateProposal.mutate(
      { story_id: storyId, task_id: taskId, task_subject: task.subject, task_description: task.description },
      {
        onSettled: () => setGeneratingTaskId(null),
        onSuccess: (data) => {
          saveProposalMut.mutate({ story_id: storyId, task_id: taskId, proposal_md: data.proposal_md });
        },
      },
    );
  };

  const handleCopyPrompt = async () => {
    const prompt = extractAiPrompt(packMd);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("AI Prompt copied to clipboard.");
    } catch {
      toast.error("Clipboard access denied.");
    }
  };

  if (taskList.length === 0) {
    return <Callout>Generate and finalise tasks in Stage B first.</Callout>;
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className={cn("rounded-xl border p-4", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50")}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Packs generated</span>
          <span className={cn("text-sm font-bold", dark ? "text-neutral-200" : "text-slate-800")}>
            {generatedCount} / {taskList.length}
          </span>
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
            const taigaRef = taigaTaskRefs[idx];
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
                    <span className={cn("mr-1 font-bold", isSelected ? "text-violet-200" : "text-neutral-500")}>
                      {idx + 1}.
                    </span>
                    {task.subject}
                  </p>
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
                "flex items-start justify-between gap-3 border-b px-5 py-4 flex-wrap",
                dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50",
              )}>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-neutral-500 mb-0.5">
                    US#{storyId} · Task {taskList.findIndex(t => t.id === selectedTask.id) + 1}
                  </p>
                  <p className={cn("text-sm font-semibold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                    {selectedTask.subject}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                  <Button
                    variant="secondary"
                    onClick={() => handleGenerate(selectedTask.id)}
                    disabled={generatingTaskId !== null}
                  >
                    {generatingTaskId === selectedTask.id
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                      : <><Sparkles className="h-4 w-4" /> {packMd ? "Regenerate" : "Generate Pack"}</>}
                  </Button>
                  {packMd && (
                    <>
                      <Button variant="secondary" onClick={handleCopyPrompt}>
                        <Clipboard className="h-4 w-4" /> Copy AI Prompt
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

              {/* Panel body */}
              <div className="p-5 space-y-4">
                {generatingTaskId === selectedTask.id && (
                  <AIProgressIndicator
                    steps={[
                      "Reading story context…",
                      "Analysing design bundle…",
                      "Writing implementation steps…",
                      "Generating test assertions…",
                      "Assembling AI prompt…",
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
                          saveProposalMut.mutate({
                            story_id: storyId,
                            task_id: selectedTask.id,
                            proposal_md: e.target.value,
                          });
                        }}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Preview</p>
                      <pre className={cn(
                        "h-full max-h-[28rem] overflow-y-auto rounded-lg border p-4 text-xs whitespace-pre-wrap leading-relaxed",
                        dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700",
                      )}>
                        {packMd}
                      </pre>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage D — Lock & Export
// ---------------------------------------------------------------------------

function StageD({ storyId, onLocked }: { storyId: number; onLocked: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);
  const { taskList, packDrafts, clearPhase3Draft } = usePhase3Store();
  const lockStoryMut = useLockStory();

  const generatedTasks = taskList.filter((t) => Boolean(packDrafts[t.id]));
  const skippedCount = taskList.length - generatedTasks.length;
  const canLock = generatedTasks.length > 0;

  const handleLock = () => {
    lockStoryMut.mutate(
      { story_id: storyId, task_ids: generatedTasks.map((t) => t.id) },
      {
        onSuccess: () => {
          clearPhase3Draft();
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
          {skippedCount > 0 && (
            <p className="text-xs text-neutral-500">
              {skippedCount} task{skippedCount > 1 ? "s" : ""} without packs will be skipped — they are not auto-generated.
            </p>
          )}
        </div>
      </div>

      {!canLock && (
        <Callout>Generate at least one developer pack before locking.</Callout>
      )}

      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={handleLock}
          disabled={!canLock || lockStoryMut.isPending}
        >
          {lockStoryMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Locking…</>
            : <><Lock className="h-4 w-4" /> Lock Story</>}
        </Button>
        {canLock && (
          <Button variant="secondary" onClick={handleExportAll}>
            <Download className="h-4 w-4" /> Export All Packs
          </Button>
        )}
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

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  const handleSelectStory = (id: number) => {
    if (id !== selectedStoryId) clearPhase3Draft();
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleBackToStories = () => setStage("A");
  const handleLocked = () => setStage("A");

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
            <div className="flex items-center">
              {stages.map((s, i) => {
                const num = stageNums[s];
                const isActive = stage === s;
                const isDone = stages.indexOf(s) < currentIdx;
                const isLocked = s !== "A" && selectedStoryId === null;
                return (
                  <div key={s} className="flex flex-1 items-center">
                    <button
                      onClick={() => {
                        if (s === "A") { setStage("A"); return; }
                        if (selectedStoryId !== null) setStage(s);
                      }}
                      disabled={isLocked}
                      className={cn("group flex flex-col items-center gap-1.5 transition disabled:pointer-events-none", isLocked && "opacity-35")}
                    >
                      <span className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 transition",
                        isActive
                          ? "bg-violet-600 text-white ring-violet-400"
                          : isDone
                            ? dark ? "bg-emerald-600 text-white ring-emerald-500" : "bg-emerald-500 text-white ring-emerald-400"
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
                            ? dark ? "text-emerald-400" : "text-emerald-600"
                            : dark ? "text-neutral-500" : "text-slate-400",
                      )}>
                        {STAGE_LABELS[s]}
                      </span>
                    </button>
                    {i < stages.length - 1 && (
                      <div className={cn(
                        "mx-2 mb-5 h-0.5 flex-1 rounded-full transition-all",
                        isDone
                          ? dark ? "bg-emerald-600" : "bg-emerald-400"
                          : dark ? "bg-neutral-700" : "bg-slate-200",
                      )} />
                    )}
                  </div>
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
          <div className="space-y-8">
            <StageB storyId={selectedStoryId} onBack={handleBackToStories} />
            <div className="flex justify-end">
              <Button onClick={() => setStage("C")}>
                Continue to Developer Packs <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {stage === "C" && selectedStoryId !== null && (
          <div className="space-y-6">
            <StageC storyId={selectedStoryId} />
            <div className="flex justify-end">
              <Button onClick={() => setStage("D")}>
                Continue to Lock &amp; Export <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {stage === "D" && selectedStoryId !== null && (
          <StageD storyId={selectedStoryId} onLocked={handleLocked} />
        )}
      </div>
      </div>
    </div>
    </section>
  );
}
