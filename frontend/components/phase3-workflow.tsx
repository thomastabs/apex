"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Download,
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
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stories…
      </div>
    );
  }
  if (error) {
    return <Callout >Failed to load stories: {errMsg(error)}</Callout>;
  }

  const stories = data?.stories ?? [];
  if (stories.length === 0) {
    return (
      <Callout >
        No design-locked stories found. Complete Phase 2 for at least one story first.
      </Callout>
    );
  }

  // Group by epic
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
    <div className="space-y-4">
      <SectionHeading>Select a story to implement</SectionHeading>

      {/* Epic tabs */}
      <div className={cn(
        "flex gap-1 overflow-x-auto border-b pb-0",
        dark ? "border-neutral-700" : "border-slate-200",
      )}>
        {epics.map((epic) => {
          const isActive = epic === currentEpic;
          return (
            <button
              key={epic}
              onClick={() => setActiveEpic(epic)}
              className={cn(
                "shrink-0 rounded-t px-4 py-2 text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap border-b-2 -mb-px",
                isActive
                  ? dark
                    ? "border-violet-500 text-violet-400"
                    : "border-violet-600 text-violet-700"
                  : dark
                    ? "border-transparent text-neutral-500 hover:text-neutral-300"
                    : "border-transparent text-neutral-500 hover:text-neutral-700",
              )}
            >
              {epic}
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                isActive
                  ? dark ? "bg-violet-900 text-violet-300" : "bg-violet-100 text-violet-700"
                  : dark ? "bg-neutral-800 text-neutral-500" : "bg-slate-100 text-neutral-500",
              )}>
                {byEpic.get(epic)!.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stories for active epic */}
      <div className="space-y-2">
        {epicStories.map((story) => (
          <button
            key={story.story_id}
            onClick={() => onSelect(story.story_id)}
            className={cn(
              "flex w-full items-start justify-between rounded border p-3 text-left transition",
              dark
                ? "border-neutral-700 bg-neutral-900 hover:border-violet-500 hover:bg-neutral-800"
                : "border-slate-200 bg-white hover:border-violet-400 hover:bg-slate-50",
            )}
          >
            <div>
              <p className="text-sm font-medium">US#{story.story_id} — {story.title}</p>
              {story.gherkin_preview && (
                <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{story.gherkin_preview}</p>
              )}
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          </button>
        ))}
      </div>
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
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading story…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-300">← Stories</button>
        <ChevronRight className="h-3 w-3 text-neutral-600" />
        <span className="text-sm font-medium">US#{storyId} — {ctx?.title}</span>
      </div>

      {/* Gherkin preview */}
      {ctx?.gherkin && (
        <div>
          <SectionHeading>Acceptance Criteria</SectionHeading>
          <pre className={cn(
            "mt-2 max-h-48 overflow-y-auto rounded border p-3 text-xs whitespace-pre-wrap",
            dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700",
          )}>
            {ctx.gherkin}
          </pre>
        </div>
      )}

      {/* Generate tasks */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => generateTasksMut.mutate(storyId)}
          disabled={generateTasksMut.isPending || tasksPushed}
        >
          {generateTasksMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : <><Sparkles className="h-4 w-4" /> Generate Tasks</>}
        </Button>
        {tasksPushed && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
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
          <SectionHeading>Tasks ({taskList.length})</SectionHeading>
          <div className="space-y-2">
            {taskList.map((task, idx) => (
              <div
                key={task.id}
                className={cn(
                  "rounded border p-3",
                  dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white",
                )}
              >
                {editingId === task.id ? (
                  <div className="space-y-2">
                    <input
                      className={cn(
                        "w-full rounded border px-2 py-1 text-sm",
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <span className="mr-1 text-neutral-500">#{idx + 1}</span>{task.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-400">{task.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditingId(task.id)}
                        disabled={tasksPushed}
                        className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
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
                  "flex-1 rounded border px-3 py-2 text-sm",
                  dark ? "border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500" : "border-slate-300 bg-white text-slate-900",
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
    return (
      <Callout >Generate and finalise tasks in Stage B first.</Callout>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Task list sidebar */}
      <div className="w-56 shrink-0 space-y-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Tasks</p>
        {taskList.map((task, idx) => {
          const hasPack = Boolean(packDrafts[task.id]);
          const taigaRef = taigaTaskRefs[idx];
          return (
            <button
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition",
                selectedTaskId === task.id
                  ? "bg-violet-600 text-white"
                  : dark
                    ? "hover:bg-neutral-800 text-neutral-300"
                    : "hover:bg-slate-100 text-slate-700",
              )}
            >
              {hasPack
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-current opacity-40" />}
              <span className="truncate flex-1">
                {taigaRef ? `#${taigaRef} ` : ""}{task.subject}
              </span>
            </button>
          );
        })}
      </div>

      {/* Pack panel */}
      <div className="min-w-0 flex-1 space-y-4">
        {selectedTask ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">{selectedTask.subject}</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleGenerate(selectedTask.id)}
                  disabled={generatingTaskId !== null}
                >
                  {generatingTaskId === selectedTask.id
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                    : <><Sparkles className="h-4 w-4" /> {packMd ? "Regenerate Pack" : "Generate Pack"}</>}
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
                      <Download className="h-4 w-4" /> Download .md
                    </Button>
                  </>
                )}
              </div>
            </div>

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
                  <p className="mb-1 text-xs text-neutral-500">Edit</p>
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
                  <p className="mb-1 text-xs text-neutral-500">Preview</p>
                  <pre className={cn(
                    "h-full max-h-[28rem] overflow-y-auto rounded border p-3 text-xs whitespace-pre-wrap",
                    dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700",
                  )}>
                    {packMd}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Click &ldquo;Generate Pack&rdquo; to create a developer context pack for this task.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-500">Select a task on the left to generate its developer pack.</p>
        )}
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
    <div className="space-y-4">
      <SectionHeading>Lock &amp; Export</SectionHeading>
      <div className={cn(
        "rounded border p-4",
        dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white",
      )}>
        <p className="text-sm">
          <span className="font-medium">{generatedTasks.length}</span> of{" "}
          <span className="font-medium">{taskList.length}</span> tasks have developer packs.
        </p>
        {taskList.length > generatedTasks.length && (
          <p className="mt-1 text-xs text-neutral-500">
            {taskList.length - generatedTasks.length} task(s) without packs will be skipped — they are not auto-generated.
          </p>
        )}
      </div>

      {!canLock && (
        <Callout >Generate at least one developer pack before locking.</Callout>
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

  if (!context) {
    return <Callout >Log in and select a project to use Phase 3.</Callout>;
  }

  const handleSelectStory = (id: number) => {
    if (id !== selectedStoryId) clearPhase3Draft();
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleBackToStories = () => {
    setStage("A");
  };

  const handleLocked = () => {
    setStage("A");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Stage nav */}
      <div className="flex items-center gap-1 text-sm">
        {(["A", "B", "C", "D"] as Stage[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-600" />}
            <button
              onClick={() => {
                if (s === "A") { setStage("A"); return; }
                if (selectedStoryId !== null) setStage(s);
              }}
              disabled={s !== "A" && selectedStoryId === null}
              className={cn(
                "rounded px-2 py-0.5 transition",
                stage === s
                  ? "bg-violet-600 text-white"
                  : dark
                    ? "text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
                    : "text-slate-500 hover:text-slate-700 disabled:opacity-30",
              )}
            >
              {STAGE_LABELS[s]}
            </button>
          </div>
        ))}
      </div>

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
  );
}
