"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FilePlus2, Info, Loader2, Plus, RefreshCw, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  useCompileGherkin,
  useGenerateConstraints,
  useGenerateNlStories,
  usePhase1Epics,
  usePushPhase1Stories,
  useSuggestPhase1Epics,
} from "@/lib/hooks/use-phase1";
import { useContextFiles, useUpdateContextFile } from "@/lib/hooks/use-workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import type { CompiledStory, EpicSuggestion } from "@/lib/api/types";
import { cn, errMsg } from "@/lib/utils";

type Mode = "create" | "load" | "suggest";

const SIZES = ["XS", "S", "M", "L", "XL"] as const;

function draftKey(projectId: number | null) {
  return `apex-phase1-draft-${projectId ?? "none"}`;
}

type Draft = {
  nlDraft: string;
  compiledStories: CompiledStory[];
  mode: Mode;
  epicTitle: string;
  epicDescription: string;
  epicId: number | null;
  suggestions?: EpicSuggestion[];
};

function loadDraft(projectId: number | null): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(projectId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(projectId: number | null, draft: Draft) {
  if (typeof window === "undefined") return;
  if (!draft.nlDraft && !draft.compiledStories.length && !draft.epicTitle && !draft.suggestions?.length) {
    localStorage.removeItem(draftKey(projectId));
  } else {
    localStorage.setItem(draftKey(projectId), JSON.stringify(draft));
  }
}

function validateStories(stories: CompiledStory[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < stories.length; i++) {
    const { title, gherkin } = stories[i];
    const label = title.trim() ? `"${title.trim()}"` : `Story ${i + 1}`;
    if (!title.trim()) errors.push(`Story ${i + 1} has no title.`);
    if (!gherkin.includes("Feature:")) errors.push(`${label} is missing a Feature: header.`);
    if (!gherkin.includes("Scenario")) errors.push(`${label} is missing a Scenario block.`);
  }
  return errors;
}

const SUGGEST_STEPS = [
  "Loading project information…",
  "Analyzing functional requirements…",
  "Generating epic candidates…",
  "Ranking by project fit…",
];
const GENERATE_STEPS = [
  "Parsing epic description…",
  "Expanding user scenarios…",
  "Writing natural language stories…",
  "Formatting output…",
];
const COMPILE_STEPS = [
  "Parsing natural language draft…",
  "Structuring Gherkin scenarios…",
  "Validating Feature blocks…",
  "Finalizing acceptance criteria…",
];
const PUSH_STEPS = [
  "Validating Gherkin stories…",
  "Creating PM stories…",
  "Locking functional spec…",
  "Syncing context files…",
];

const STEP_LABELS = ["Define Epic", "Generate", "Review Draft", "Publish"] as const;

export function Phase1Workflow() {
  const dark = useUiStore((state) => state.theme) === "dark";
  const router = useRouter();
  const context = useApiContext();
  const [mode, setMode] = useState<Mode>("create");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [epicTitle, setEpicTitle] = useState("");
  const [epicDescription, setEpicDescription] = useState("");
  const [epicId, setEpicId] = useState<number | null>(null);
  const [suggestHint, setSuggestHint] = useState("");
  const [generateHint, setGenerateHint] = useState("");
  const [nlDraft, setNlDraft] = useState("");
  const [compiledStories, setCompiledStories] = useState<CompiledStory[]>([]);
  const [suggestions, setSuggestions] = useState<EpicSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [appliedSuggestionIndex, setAppliedSuggestionIndex] = useState<number | null>(null);
  const [editedDescriptions, setEditedDescriptions] = useState<Record<number, string>>({});
  const [expandedLoadEpic, setExpandedLoadEpic] = useState<number | null>(null);
  const [selectedLoadEpicId, setSelectedLoadEpicId] = useState<number | null>(null);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [constraintsGenerated, setConstraintsGenerated] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const draftRestored = useRef(false);

  const epics = usePhase1Epics();
  const contextFiles = useContextFiles();
  const suggestEpics = useSuggestPhase1Epics();
  const generate = useGenerateNlStories();
  const compile = useCompileGherkin();
  const push = usePushPhase1Stories();
  const genConstraints = useGenerateConstraints();
  const updateContextFile = useUpdateContextFile();

  useEffect(() => {
    draftRestored.current = false;
  }, [context?.projectId]);

  useEffect(() => {
    if (draftRestored.current) return;
    const saved = loadDraft(context?.projectId ?? null);
    if (saved) {
      setNlDraft(saved.nlDraft);
      setCompiledStories(saved.compiledStories);
      if (saved.mode) setMode(saved.mode);
      if (saved.epicTitle) setEpicTitle(saved.epicTitle);
      if (saved.epicDescription) setEpicDescription(saved.epicDescription);
      if (saved.epicId !== undefined) setEpicId(saved.epicId);
      if (saved.suggestions?.length) setSuggestions(saved.suggestions);
      if (saved.compiledStories.length > 0) setStep(4);
      else if (saved.nlDraft) setStep(3);
      else if (saved.epicTitle) setStep(2);
    }
    draftRestored.current = true;
  }, [context?.projectId]);

  useEffect(() => {
    if (!draftRestored.current || !epics.data || epicId === null) return;
    if (!epics.data.find((e) => e.id === epicId)) {
      toast.warning("Restored epic no longer exists in this project. Please select a new epic.");
      setEpicId(null);
      setEpicTitle("");
      setEpicDescription("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epics.data]);

  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft(context?.projectId ?? null, { nlDraft, compiledStories, mode, epicTitle, epicDescription, epicId, suggestions });
    }, 500);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [context?.projectId, nlDraft, compiledStories, mode, epicTitle, epicDescription, epicId, suggestions]);

  const projectConcept = contextFiles.data?.files.find((f) => f.filename === "project-concept.md")?.content ?? "";
  const hasProjectConcept = useMemo(() => {
    const text = projectConcept.replace(/^#[^\n]*\n/, "").trim();
    return Boolean(text) && !text.startsWith("<!--");
  }, [projectConcept]);

  const activeEpic = useMemo(
    () => epics.data?.find((epic) => epic.id === epicId),
    [epics.data, epicId],
  );
  const canGenerate = mode === "load" ? Boolean(activeEpic) : Boolean(epicTitle.trim());
  const busy = generate.isPending || compile.isPending || push.isPending || suggestEpics.isPending;
  const noContext = !context;
  const hasUnsaved = Boolean(nlDraft || compiledStories.length);
  const hasWorkInProgress = Boolean(epicTitle || epicDescription || epicId || nlDraft || compiledStories.length || suggestions.length);
  const validationErrors = compiledStories.length ? validateStories(compiledStories) : [];
  const canPush = !busy && !noContext && compiledStories.length > 0 && validationErrors.length === 0;

  const maxUnlockedStep: 1 | 2 | 3 | 4 =
    compiledStories.length > 0 ? 4 :
    nlDraft ? 3 :
    canGenerate ? 2 :
    1;

  function requestModeSwitch(next: Mode) {
    if (hasUnsaved && mode !== next) {
      toast.info("Draft cleared — switching mode.", {
        action: { label: "Undo", onClick: () => setMode(mode) },
      });
      setNlDraft("");
      setCompiledStories([]);
    }
    setMode(next);
    setSelectedLoadEpicId(null);
    setExpandedLoadEpic(null);
    setAppliedSuggestionIndex(null);
    setSelectedSuggestion(null);
  }

  function applySuggestion(suggestion: EpicSuggestion, index: number) {
    setAppliedSuggestionIndex(index);
    setEpicTitle(suggestion.title);
    setEpicDescription(editedDescriptions[index] ?? suggestion.description);
    setEpicId(null);
  }

  function cycleSize(index: number) {
    setCompiledStories((stories) =>
      stories.map((s, i) => {
        if (i !== index) return s;
        const next = SIZES[(SIZES.indexOf(s.size as (typeof SIZES)[number]) + 1) % SIZES.length];
        return { ...s, size: next };
      }),
    );
  }

  // keepSuggestions preserves the AI suggestion pool so it can be reused for
  // the next epic (e.g. after pushing one to the PM tool). A full "Start Over"
  // passes false to wipe everything.
  function startNewEpic(keepSuggestions = false) {
    setEpicTitle("");
    setEpicDescription("");
    setEpicId(null);
    setSuggestHint("");
    setGenerateHint("");
    setNlDraft("");
    setCompiledStories([]);
    setPushSuccess(false);
    setConstraintsGenerated(false);
    setStep(1);
    setMode("create");
    setSelectedLoadEpicId(null);
    setExpandedLoadEpic(null);
    setAppliedSuggestionIndex(null);
    setSelectedSuggestion(null);
    if (!keepSuggestions) {
      setSuggestions([]);
      suggestEpics.reset();
    }
  }

  function clearSuggestions() {
    suggestEpics.reset();
    setSuggestions([]);
    setAppliedSuggestionIndex(null);
    setSelectedSuggestion(null);
    setEditedDescriptions({});
    toast.info("Suggestions cleared");
  }

  function clearEpicInputs() {
    setEpicTitle("");
    setEpicDescription("");
    setEpicId(null);
    setSelectedLoadEpicId(null);
    setExpandedLoadEpic(null);
    setAppliedSuggestionIndex(null);
    setSelectedSuggestion(null);
    suggestEpics.reset();
  }

  const cardClass = dark
    ? "border-neutral-800 bg-[#1f1f21] hover:border-neutral-700"
    : "border-slate-200 bg-slate-50 hover:border-slate-300";
  const labelClass = dark ? "text-neutral-200" : "text-slate-700";
  const sectionBorderClass = dark ? "border-neutral-700" : "border-slate-200";
  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  return (
    <section
      className="relative px-8 py-8"
      style={{ cursor: busy ? "wait" : undefined }}
      onClickCapture={(e) => { if (busy) { e.stopPropagation(); e.preventDefault(); } }}
    >
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Phase 1</p>
          <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
            Requirements
          </h1>
          <p className="mt-2 text-neutral-500">
            Turn your project ideas into clear, testable behaviour specifications, ready to be shared with the team.
          </p>
        </div>
        {hasWorkInProgress && !pushSuccess ? (
          <button
            className={cn(
              "mt-2 flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition-colors",
              dark
                ? "border-neutral-700 text-neutral-400 hover:border-red-800 hover:bg-red-950/30 hover:text-red-300"
                : "border-slate-300 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600",
            )}
            onClick={() => {
              toast.warning("Start over? All draft content will be cleared.", {
                action: {
                  label: "Start Over",
                  onClick: () => { startNewEpic(); toast.info("Started over — all draft cleared"); },
                },
              });
            }}
          >
            <RotateCcw className="size-3.5" />
            Start Over
          </button>
        ) : null}
      </div>

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
        {diagramOpen ? (
          <div className={cn("border-t p-4", dark ? "border-neutral-800" : "border-slate-200")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/requirements.svg" alt="Phase 1 requirements process diagram" className="mx-auto max-w-full" />
          </div>
        ) : null}
      </div>

      {!context ? (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Sign in required</p>
            <p className="mt-0.5 text-xs text-amber-400/80">Sign in and select a project in the sidebar to unlock AI generation features.</p>
          </div>
        </div>
      ) : null}

      {!hasProjectConcept && contextFiles.data ? (
        <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Project Concept is empty. Fill it in for best AI results.
        </div>
      ) : null}

      {hasUnsaved && (
        <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Draft saved locally — work restored on refresh.
        </div>
      )}

      <div className={cn("space-y-6 border-t pt-6", sectionBorderClass)}>
        {/* Stepper */}
        <div className={cn("rounded-xl border px-6 py-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <div className="flex w-full items-center">
            {STEP_LABELS.map((label, i) => {
              const stepNum = (i + 1) as 1 | 2 | 3 | 4;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              const canNav = stepNum <= maxUnlockedStep;
              return (
                <Fragment key={label}>
                  <button
                    onClick={() => setStep(stepNum)}
                    disabled={!canNav}
                    className={cn("group flex shrink-0 flex-col items-center gap-1.5 transition disabled:pointer-events-none", !canNav && "opacity-35")}
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
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
                    </span>
                    <span className={cn(
                      "text-xs font-semibold whitespace-nowrap",
                      isActive
                        ? "text-violet-500"
                        : isDone
                          ? dark ? "text-violet-400" : "text-violet-500"
                          : dark ? "text-neutral-500" : "text-slate-400",
                    )}>
                      {label}
                    </span>
                  </button>
                  {i < STEP_LABELS.length - 1 && (
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

        {/* ── Step 1: Define Your Epic ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className={cn("grid grid-cols-3 rounded-md p-1", dark ? "bg-neutral-800" : "bg-slate-200")}>
              {[
                { value: "create", Icon: FilePlus2, label: "Create New" },
                { value: "load", Icon: Download, label: "Load from PM" },
                { value: "suggest", Icon: Sparkles, label: "AI Suggests" },
              ].map(({ value, Icon, label }) => (
                <button
                  key={String(value)}
                  onClick={() => requestModeSwitch(value as Mode)}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-2 rounded text-sm transition-colors",
                    dark
                      ? "text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-200"
                      : "text-slate-500 hover:bg-slate-300 hover:text-slate-800",
                    mode === value && "bg-violet-600 font-semibold text-white hover:bg-violet-600",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            {mode === "create" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_340px] gap-4">
                  <label className={cn("text-sm font-medium", labelClass)}>
                    Epic Title <span className="block text-xs text-red-400">Required</span>
                    <Input value={epicTitle} onChange={(event) => setEpicTitle(event.target.value)} placeholder="e.g. User Authentication" />
                  </label>
                  <label className={cn("text-sm font-medium", labelClass)}>
                    Epic ID <span className={cn("block text-xs", dark ? "text-neutral-500" : "text-slate-400")}>Optional — leave blank to create new</span>
                    <Input value={epicId ?? ""} onChange={(event) => setEpicId(event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 42" />
                  </label>
                </div>
                <label className={cn("block text-sm font-medium", labelClass)}>
                  Description
                  <Textarea rows={5} value={epicDescription} onChange={(event) => setEpicDescription(event.target.value)} placeholder="Describe the epic in detail — context helps the AI generate better stories..." />
                </label>
                {(epicTitle || epicDescription || epicId) && (
                  <Button variant="secondary" className="gap-2" onClick={clearEpicInputs}>
                    <RotateCcw className="size-3.5" /> Clear Fields
                  </Button>
                )}
              </div>
            ) : null}

            {mode === "load" ? (
              <div className="space-y-3">
                <div className={cn("flex items-center justify-between text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
                  <span>{epics.data?.length ?? 0} epic(s) in this project</span>
                  <button
                    className="text-violet-400 transition-colors hover:text-violet-300"
                    onClick={() => { epics.refetch(); toast.info("Epics refreshed"); }}
                  >
                    <RefreshCw className="mr-1 inline size-3" />
                    Refresh
                  </button>
                </div>
                {epics.isLoading ? (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : null}
                {epics.data?.map((epic) => {
                  const isSelected = selectedLoadEpicId === epic.id;
                  const isExpanded = expandedLoadEpic === epic.id;
                  const pushedCount = epic.stories.filter((s) => s.tags.includes("gherkin")).length;
                  return (
                    <div
                      key={epic.id}
                      className={cn(
                        "rounded-md border transition-all duration-200",
                        isSelected ? "border-emerald-500/50 bg-emerald-500/10" : cardClass,
                      )}
                    >
                      <button
                        className="flex w-full items-center gap-3 px-4 py-3 text-left"
                        onClick={() => setExpandedLoadEpic(isExpanded ? null : epic.id)}
                      >
                        <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-200", dark ? "text-neutral-500" : "text-slate-400", isExpanded && "rotate-90")} />
                        <span className={cn("rounded border px-2 py-0.5 text-xs", isSelected ? "border-emerald-500/40 text-emerald-400" : "border-violet-700 text-violet-200")}>
                          #{epic.ref}
                        </span>
                        <span className={cn("flex-1 font-semibold", isSelected ? "text-emerald-300" : dark ? "text-white" : "text-slate-800")}>
                          {epic.subject}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {epic.stories.length > 0 ? (
                            <span className={cn("rounded border px-1.5 py-0.5 text-xs", dark ? "border-neutral-700 text-neutral-600" : "border-slate-300 text-slate-400")}>
                              {epic.stories.length} {epic.stories.length === 1 ? "story" : "stories"}
                            </span>
                          ) : null}
                          {pushedCount > 0 ? (
                            <span className="rounded border border-emerald-700/50 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
                              {pushedCount} pushed
                            </span>
                          ) : null}
                        </div>
                        {isSelected ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="size-3.5" /> Selected
                          </span>
                        ) : null}
                      </button>
                      {isExpanded ? (
                        <div className={cn("space-y-3 border-t px-4 pb-4 pt-3", dark ? "border-neutral-800" : "border-slate-200")}>
                          {epic.description ? (
                            <p className={cn("text-sm leading-6", dark ? "text-neutral-400" : "text-slate-600")}>{epic.description}</p>
                          ) : (
                            <p className={cn("text-sm italic", dark ? "text-neutral-600" : "text-slate-400")}>No description provided.</p>
                          )}
                          {epic.tags?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {epic.tags.map((tag) => (
                                <span key={tag} className={cn("rounded border px-2 py-0.5 text-xs", dark ? "border-neutral-700 bg-neutral-800 text-neutral-400" : "border-slate-300 bg-slate-100 text-slate-500")}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <button
                            className={cn(
                              "flex w-full items-center justify-center gap-2 rounded border py-2 text-sm font-semibold transition-all duration-200",
                              isSelected
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                : dark
                                  ? "border-neutral-600 bg-neutral-800 text-neutral-200 hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-300"
                                  : "border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700",
                            )}
                            onClick={() => {
                              setSelectedLoadEpicId(epic.id);
                              setEpicId(epic.id);
                              setEpicTitle(epic.subject);
                              setEpicDescription(epic.description);
                              toast.success(`Epic "${epic.subject}" loaded`);
                            }}
                          >
                            <CheckCircle2 className="size-4" />
                            {isSelected ? "Selected" : "Use Epic"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!epics.isLoading && !epics.data?.length ? (
                  <div className={cn("py-4 text-center text-sm", dark ? "text-neutral-500" : "text-slate-400")}>No epics found in this project.</div>
                ) : null}
              </div>
            ) : null}

            {mode === "suggest" ? (
              <div className="space-y-4">
                <label className={cn("block text-sm font-medium", labelClass)}>
                  AI Guidance{" "}
                  <span className={dark ? "text-neutral-500" : "text-slate-400"}>Optional — focus or constrain the epic suggestions.</span>
                  <Input value={suggestHint} onChange={(event) => setSuggestHint(event.target.value)} placeholder="e.g. focus on mobile-first flows, B2B enterprise context..." />
                </label>
                <Button
                  className="w-full"
                  onClick={() => {
                    setEditedDescriptions({});
                    setAppliedSuggestionIndex(null);
                    suggestEpics.mutate(suggestHint, {
                      onSuccess: (data) => {
                        setSuggestions(data.epics);
                        toast.success("Epic suggestions ready");
                      },
                    });
                  }}
                  disabled={suggestEpics.isPending || noContext}
                >
                  <Sparkles className="size-4" />
                  {suggestEpics.isPending ? "Generating…" : "AI Suggests"}
                </Button>
                <AIProgressIndicator steps={SUGGEST_STEPS} isPending={suggestEpics.isPending} dark={dark} />
                {suggestions.length && !suggestEpics.isPending ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
                        {suggestions.length} suggestions — click to expand, then select one
                      </span>
                      <button
                        className={cn("text-sm transition-colors", dark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-700")}
                        onClick={clearSuggestions}
                      >
                        Clear suggestions
                      </button>
                    </div>
                    {suggestions.map((suggestion, index) => {
                      const isApplied = appliedSuggestionIndex === index;
                      const isExpanded = selectedSuggestion === index;
                      return (
                        <div key={suggestion.title} className={cn("rounded-md border transition-all duration-200", isApplied ? "border-emerald-500/50 bg-emerald-500/10" : cardClass)}>
                          <button
                            className="flex w-full items-center gap-2 px-4 py-3 text-left"
                            onClick={() => setSelectedSuggestion(isExpanded ? null : index)}
                          >
                            <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-200", dark ? "text-neutral-500" : "text-slate-400", isExpanded && "rotate-90")} />
                            <Sparkles className={cn("size-4 shrink-0", isApplied ? "text-emerald-400" : "text-violet-400")} />
                            <span className={cn("flex-1 font-semibold", isApplied ? "text-emerald-300" : dark ? "text-white" : "text-slate-800")}>
                              {suggestion.title}
                            </span>
                            {isApplied ? (
                              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-400">
                                <CheckCircle2 className="size-3.5" /> Selected
                              </span>
                            ) : null}
                          </button>
                          {isExpanded ? (
                            <div className={cn("space-y-3 border-t px-4 pb-4 pt-3", dark ? "border-neutral-800" : "border-slate-200")}>
                              <Textarea
                                rows={3}
                                value={editedDescriptions[index] ?? suggestion.description}
                                onChange={(event) => setEditedDescriptions((prev) => ({ ...prev, [index]: event.target.value }))}
                              />
                              <button
                                className={cn(
                                  "flex w-full items-center justify-center gap-2 rounded border py-2 text-sm font-semibold transition-all duration-200",
                                  isApplied
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                    : dark
                                      ? "border-neutral-600 bg-neutral-800 text-neutral-200 hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-300"
                                      : "border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700",
                                )}
                                onClick={() => {
                                  applySuggestion(suggestion, index);
                                  toast.success(`"${suggestion.title}" selected as epic`);
                                }}
                              >
                                <CheckCircle2 className="size-4" />
                                {isApplied ? "Selected" : "Use Suggestion"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {suggestEpics.isError ? (
                  <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    Suggestion failed: {errMsg(suggestEpics.error)}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button
              className="w-full"
              disabled={!canGenerate}
              onClick={() => setStep(2)}
            >
              Continue to Generate
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}

        {/* ── Step 2: Generate User Stories ────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {epicTitle ? (
              <div className={cn("flex items-start justify-between rounded-md border px-4 py-3", dark ? "border-neutral-700 bg-neutral-800/50" : "border-slate-200 bg-slate-50")}>
                <div>
                  <p className={cn("text-xs font-medium uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>Epic</p>
                  <p className={cn("mt-0.5 text-base font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{epicTitle}</p>
                  {epicDescription && (
                    <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>{epicDescription}</p>
                  )}
                </div>
                <button
                  onClick={() => setStep(1)}
                  className={cn("ml-4 shrink-0 text-xs font-medium transition", dark ? "text-neutral-400 hover:text-violet-400" : "text-slate-400 hover:text-violet-600")}
                >
                  Change
                </button>
              </div>
            ) : null}
            {!canGenerate ? <Callout>Fill in your Epic above, then click Generate to create Natural Language user stories.</Callout> : null}
            <label className={cn("block text-sm font-medium", labelClass)}>
              AI Guidance <span className={dark ? "text-neutral-500" : "text-slate-400"}>Optional</span>
              <Input value={generateHint} onChange={(event) => setGenerateHint(event.target.value)} placeholder="e.g. focus on error handling and edge cases" />
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" className="gap-1.5" onClick={() => setStep(1)} disabled={busy}>
                <ChevronLeft className="size-4" /> Back
              </Button>
              <Button
                className="flex-1"
                disabled={!canGenerate || busy || noContext}
                onClick={() =>
                  generate.mutate(
                    { epic_subject: epicTitle, epic_description: epicDescription, hint: generateHint },
                    {
                      onSuccess: (data) => {
                        setNlDraft(data.nl_draft);
                        setCompiledStories([]);
                        setStep(3);
                        toast.success("Stories generated — review the draft below");
                      },
                    },
                  )
                }
              >
                <Sparkles className="size-4" />
                {generate.isPending ? "Generating…" : "Generate Stories"}
              </Button>
            </div>
            <AIProgressIndicator steps={GENERATE_STEPS} isPending={generate.isPending} dark={dark} />
            {generate.isError ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                Generation failed: {errMsg(generate.error)}
              </div>
            ) : null}
          </div>
        )}

        {/* ── Step 3: Review Story Descriptions ────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {epicTitle ? (
              <div className={cn("rounded-md border px-4 py-3", dark ? "border-neutral-700 bg-neutral-800/50" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-xs font-medium uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>Epic</p>
                <p className={cn("mt-0.5 text-base font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{epicTitle}</p>
                {epicDescription && (
                  <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>{epicDescription}</p>
                )}
              </div>
            ) : null}
            <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
              The AI has written plain descriptions of each user story. Read them, adjust any that don&apos;t match your intent, then convert them to Acceptance Criteria.
            </p>
            <Textarea rows={14} value={nlDraft} onChange={(event) => setNlDraft(event.target.value)} />
            <Button
              className="w-full"
              disabled={busy || noContext}
              onClick={() =>
                compile.mutate(nlDraft, {
                  onSuccess: (data) => {
                    setCompiledStories(data.stories);
                    setStep(4);
                    toast.success(`${data.stories.length} stories converted to Acceptance Criteria`);
                  },
                })
              }
            >
              {compile.isPending
                ? <><Loader2 className="size-4 animate-spin" /> Converting…</>
                : <><Sparkles className="size-4" /> Convert to Acceptance Criteria</>}
            </Button>
            <AIProgressIndicator steps={COMPILE_STEPS} isPending={compile.isPending} dark={dark} />
            {compile.isError ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                Compile failed: {errMsg(compile.error)}
              </div>
            ) : null}
          </div>
        )}

        {/* ── Step 4: Review Acceptance Criteria & Publish ─────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            {epicTitle ? (
              <div className={cn("rounded-md border px-4 py-3", dark ? "border-neutral-700 bg-neutral-800/50" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-xs font-medium uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>Epic</p>
                <p className={cn("mt-0.5 text-base font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{epicTitle}</p>
                {epicDescription && (
                  <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>{epicDescription}</p>
                )}
              </div>
            ) : null}
            <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
              Acceptance Criteria are structured conditions that must be true for a story to be complete. Review them, then publish to your PM board.
            </p>

            {validationErrors.length > 0 ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
                <div className="mb-1 font-semibold">Fix before pushing:</div>
                <ul className="list-disc pl-4">
                  {validationErrors.map((err) => <li key={err}>{err}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="space-y-4">
              {compiledStories.map((story, index) => (
                <div
                  key={`${story.title}-${index}`}
                  className={cn("rounded-md border p-4", dark ? "border-neutral-800 bg-[#1f1f21]" : "border-slate-200 bg-slate-50")}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Input
                      className="flex-1 font-semibold"
                      value={story.title}
                      onChange={(event) =>
                        setCompiledStories((stories) =>
                          stories.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)),
                        )
                      }
                    />
                    <button
                      className="shrink-0 rounded border border-violet-700 bg-violet-950 px-3 py-1.5 text-xs font-bold text-violet-200 transition-colors hover:bg-violet-900"
                      title="Click to cycle size: XS → S"
                      onClick={() => cycleSize(index)}
                    >
                      {story.size || "XS"}
                    </button>
                    <button
                      className="grid size-8 shrink-0 place-items-center rounded text-red-400 transition-colors hover:bg-red-950"
                      onClick={() => setCompiledStories((s) => s.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <Textarea
                    rows={10}
                    value={story.gherkin}
                    onChange={(event) =>
                      setCompiledStories((stories) =>
                        stories.map((item, i) => (i === index ? { ...item, gherkin: event.target.value } : item)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <button
              className={cn(
                "flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors",
                dark
                  ? "border-neutral-700 text-neutral-300 hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-300"
                  : "border-slate-300 text-slate-600 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700",
              )}
              onClick={() => setCompiledStories((s) => [...s, { title: "New Story", size: "XS", gherkin: "Feature: \n\nScenario: \n  Given \n  When \n  Then " }])}
            >
              <Plus className="size-4" /> Add Story
            </button>

            {pushSuccess ? (
              <div className="space-y-4">
                <Callout>{push.data?.count ?? 0} stories pushed and locked in the functional spec.</Callout>
                {push.data?.story_urls?.length ? (
                  <div className="space-y-1">
                    <div className={cn("text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>Created stories:</div>
                    {push.data.story_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-violet-400 transition-colors hover:text-violet-300"
                      >
                        <ExternalLink className="size-3" />
                        {url}
                      </a>
                    ))}
                  </div>
                ) : null}
                {/* Optional: project-wide constraints (EARS). */}
                <div className={cn("rounded-lg border p-4", dark ? "border-neutral-800 bg-neutral-900/40" : "border-slate-200 bg-slate-50")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>Constraints</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")}>Optional</span>
                  </div>
                  <p className={cn("mt-1 text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
                    EARS quality constraints (performance, security, reliability…) saved to <code>constraints.md</code> and injected into Phase 3 developer packs &amp; Phase 4 test plans. Editable anytime in the sidebar.
                  </p>
                  {constraintsGenerated ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                      <CheckCircle2 className="size-4" /> Saved to constraints.md
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      className="mt-3 w-full"
                      disabled={genConstraints.isPending || updateContextFile.isPending}
                      onClick={() =>
                        genConstraints.mutate(undefined, {
                          onSuccess: (res) => {
                            updateContextFile.mutate({ filename: "constraints.md", content: res.constraints_md });
                            setConstraintsGenerated(true);
                            toast.success(`Generated ${res.constraints.length} constraints`);
                          },
                        })
                      }
                    >
                      {genConstraints.isPending
                        ? <><Loader2 className="size-4 animate-spin" /> Generating…</>
                        : "Generate constraints"}
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <Button onClick={() => router.push("/phase2")} className="w-full">
                    <ChevronRight className="size-4" /> Move to Phase 2
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={() => { startNewEpic(true); toast.info("Ready for next epic — suggestions kept"); }}>
                    <RefreshCw className="size-4" /> Start New Epic
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  className="w-full"
                  disabled={!canPush}
                  onClick={() =>
                    push.mutate(
                      {
                        epic_subject: epicTitle,
                        epic_description: epicDescription,
                        epic_id: epicId,
                        stories: compiledStories,
                      },
                      {
                        onSuccess: (data) => {
                          setPushSuccess(true);
                          toast.success(`${data.count} stories pushed`);
                        },
                      },
                    )
                  }
                >
                  {push.isPending
                    ? <><Loader2 className="size-4 animate-spin" /> Pushing…</>
                    : <><Upload className="size-4" /> Push Stories</>}
                </Button>
                <AIProgressIndicator steps={PUSH_STEPS} isPending={push.isPending} dark={dark} />
                {push.isError ? (
                  <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    Push failed: {errMsg(push.error)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
