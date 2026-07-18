"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FilePlus2, GitCompare, HelpCircle, Info, Loader2, Plus, RefreshCw, RotateCcw, ScanSearch, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import {
  useAnalyzeGaps,
  useCompileGherkin,
  useGenerateClarifyingQuestions,
  useGenerateConstraints,
  useCrossCheckStories,
  useGenerateNlStories,
  usePhase1Epics,
  usePushPhase1Stories,
  useSuggestPhase1Epics,
} from "@/lib/hooks/use-phase1";
import { useAiConfig, useContextFiles, useUpdateContextFile } from "@/lib/hooks/use-workspace";
import type { CrossCheckResult } from "@/lib/api/phase1";
import { CrossCheckPanel, AltModelSelect } from "@/components/cross-check-panel";
import { GuideTheAI } from "@/components/guide-the-ai";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { ClarifyingQuestion, CompiledStory, EpicSuggestion, QaPair, RequirementGapReport } from "@/lib/api/types";
import { cn, errMsg } from "@/lib/utils";
import { FigmaStoryPanel } from "@/components/figma-story-panel";

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

function validateStories(stories: CompiledStory[], t: ReturnType<typeof useT>): string[] {
  const errors: string[] = [];
  for (let i = 0; i < stories.length; i++) {
    const { title, gherkin } = stories[i];
    const label = title.trim() ? `"${title.trim()}"` : t("phase1.validation.storyLabel", { n: i + 1 });
    if (!title.trim()) errors.push(t("phase1.validation.noTitle", { n: i + 1 }));
    if (!gherkin.includes("Feature:")) errors.push(t("phase1.validation.missingFeature", { label }));
    if (!gherkin.includes("Scenario")) errors.push(t("phase1.validation.missingScenario", { label }));
  }
  return errors;
}

const SUGGEST_STEPS = [
  "Loading project information…",
  "Analyzing functional requirements…",
  "Generating epic candidates…",
  "Ranking by project fit…",
];
const GAP_STEPS = [
  "Reading project concept…",
  "Mapping current epics & stories…",
  "Comparing coverage against the concept…",
  "Surfacing requirement gaps…",
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
const CLARIFY_STEPS = [
  "Reading the draft…",
  "Checking for ambiguous points…",
  "Ranking by impact on acceptance criteria…",
];
const PUSH_STEPS = [
  "Validating Gherkin stories…",
  "Creating PM stories…",
  "Locking functional spec…",
  "Syncing context files…",
];
const CONSTRAINT_STEPS = [
  "Reading project concept & tech stack…",
  "Scoping quality attributes…",
  "Writing EARS 'shall' statements…",
  "Saving constraints.md…",
];

const STEP_LABEL_KEYS = ["phase1.step.defineEpic", "phase1.step.generate", "phase1.step.reviewDraft", "phase1.step.publish"] as const;

// Lower number = ranked first. Drives both the gap sort order and the rank badge.
const IMPORTANCE_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const IMPORTANCE_STYLE: Record<string, string> = {
  critical: "border-red-500/40 text-red-500",
  high: "border-amber-500/40 text-amber-500",
  medium: "border-neutral-500/40 text-neutral-500",
  low: "border-slate-400/40 text-slate-400",
};
const IMPORTANCE_LABEL_KEYS = {
  critical: "phase1.importance.critical", high: "phase1.importance.high",
  medium: "phase1.importance.medium", low: "phase1.importance.low",
} as const;

export function Phase1Workflow() {
  const t = useT();
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
  const [gapReport, setGapReport] = useState<RequirementGapReport | null>(null);
  const [appliedGapIndex, setAppliedGapIndex] = useState<number | null>(null);
  const [editedDescriptions, setEditedDescriptions] = useState<Record<number, string>>({});
  const [expandedLoadEpic, setExpandedLoadEpic] = useState<number | null>(null);
  const [selectedLoadEpicId, setSelectedLoadEpicId] = useState<number | null>(null);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [constraintsGenerated, setConstraintsGenerated] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [earsOpen, setEarsOpen] = useState(false);
  const draftRestored = useRef(false);

  const epics = usePhase1Epics();
  const contextFiles = useContextFiles();
  const suggestEpics = useSuggestPhase1Epics();
  const analyzeGaps = useAnalyzeGaps();
  const generate = useGenerateNlStories();
  const crossCheck = useCrossCheckStories();
  const [crossResult, setCrossResult] = useState<CrossCheckResult | null>(null);
  const [altModel, setAltModel] = useState("");
  const aiConfig = useAiConfig();
  const crossEnabled = (aiConfig.data?.configured_providers?.length ?? 0) >= 2;
  const compile = useCompileGherkin();
  const clarify = useGenerateClarifyingQuestions();
  const [qaQuestions, setQaQuestions] = useState<ClarifyingQuestion[]>([]);
  const [qaAnswers, setQaAnswers] = useState<Record<string, string>>({});
  const [clarifications, setClarifications] = useState<QaPair[]>([]);
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
      toast.warning(t("phase1.toast.restoredEpicGone"));
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
  const busy = generate.isPending || compile.isPending || clarify.isPending || push.isPending || suggestEpics.isPending || analyzeGaps.isPending;
  const noContext = !context;
  const hasUnsaved = Boolean(nlDraft || compiledStories.length);
  const hasWorkInProgress = Boolean(epicTitle || epicDescription || epicId || nlDraft || compiledStories.length || suggestions.length);
  const validationErrors = compiledStories.length ? validateStories(compiledStories, t) : [];
  const canPush = !busy && !noContext && compiledStories.length > 0 && validationErrors.length === 0;

  const maxUnlockedStep: 1 | 2 | 3 | 4 =
    compiledStories.length > 0 ? 4 :
    nlDraft ? 3 :
    canGenerate ? 2 :
    1;

  function requestModeSwitch(next: Mode) {
    if (hasUnsaved && mode !== next) {
      toast.info(t("phase1.toast.modeSwitch"), {
        action: { label: t("phase1.undo"), onClick: () => setMode(mode) },
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

  // Build the current epic/story snapshot the AI audits against the concept.
  function runGapAnalysis() {
    const existingEpics = (epics.data ?? []).map((epic) => ({
      title: epic.subject,
      description: epic.description ?? "",
      stories: epic.stories.map((s) => s.subject),
    }));
    setAppliedGapIndex(null);
    analyzeGaps.mutate(
      { existingEpics, hint: suggestHint },
      {
        onSuccess: (report) => {
          setGapReport(report);
          toast.success(
            report.gaps.length
              ? t(report.gaps.length === 1 ? "phase1.toast.gapsFoundOne" : "phase1.toast.gapsFoundOther", { n: report.gaps.length })
              : t("phase1.toast.gapsNone"),
          );
        },
      },
    );
  }

  // Seed the Create-New epic fields from a gap so the user can generate stories for it.
  function applyGap(gap: RequirementGapReport["gaps"][number], index: number) {
    setAppliedGapIndex(index);
    const storyHints = gap.suggested_stories.length
      ? `\n\nSuggested stories:\n${gap.suggested_stories.map((s) => `- ${s}`).join("\n")}`
      : "";
    setEpicTitle(gap.title);
    setEpicDescription(`${gap.rationale}${storyHints}`);
    setEpicId(null);
    setMode("create");
    toast.success(t("phase1.toast.gapLoaded", { title: gap.title }));
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
      setGapReport(null);
      setAppliedGapIndex(null);
      analyzeGaps.reset();
    }
  }

  function clearSuggestions() {
    suggestEpics.reset();
    setSuggestions([]);
    setAppliedSuggestionIndex(null);
    setSelectedSuggestion(null);
    setEditedDescriptions({});
    toast.info(t("phase1.toast.suggestionsCleared"));
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
  const mutedClass = dark ? "text-neutral-400" : "text-slate-600";

  return (
    <section
      className="relative px-8 py-8"
      style={{ cursor: busy ? "wait" : undefined }}
      onClickCapture={(e) => { if (busy) { e.stopPropagation(); e.preventDefault(); } }}
    >
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className={cn("mb-1 text-xs font-bold uppercase tracking-widest", dark ? "text-violet-400" : "text-violet-600")}>{t("common.phaseEyebrow", { n: 1 })}</p>
          <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
            {t("phase1.heading")}
          </h1>
          <p className="mt-2 text-neutral-500">
            {t("phase1.subtitle")}
          </p>
        </div>
        {hasWorkInProgress && !pushSuccess ? (
          <button
            className={cn(
              "mt-2 flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition-colors",
              dark
                ? "border-neutral-700 text-neutral-400 hover:border-red-800 hover:bg-neutral-800 hover:text-red-300"
                : "border-slate-300 text-slate-600 hover:border-red-300 hover:bg-white hover:text-red-600",
            )}
            onClick={() => {
              toast.warning(t("phase1.toast.startOverConfirm"), {
                action: {
                  label: t("phase1.startOver"),
                  onClick: () => { startNewEpic(); toast.info(t("phase1.toast.startedOver")); },
                },
              });
            }}
          >
            <RotateCcw className="size-3.5" />
            {t("phase1.startOver")}
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
          <span>{t("common.viewProcessDiagram")}</span>
        </button>
        {diagramOpen ? (
          <div className={cn("border-t p-4", dark ? "border-neutral-800" : "border-slate-200")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/requirements.svg" alt={t("phase1.diagramAlt")} className="mx-auto max-w-full" />
          </div>
        ) : null}
      </div>

      {!context ? (
        <div className="mb-6">
          <Callout variant="warning">
            <p className="font-semibold">{t("common.signInRequired")}</p>
            <p className="mt-0.5">{t("phase1.signInBody")}</p>
          </Callout>
        </div>
      ) : null}

      {!hasProjectConcept && contextFiles.data ? (
        <div className="mb-4"><Callout variant="warning">{t("phase1.emptyConceptWarning")}</Callout></div>
      ) : null}

      {hasUnsaved && (
        <div className="mb-4"><Callout variant="info">{t("common.draftSavedLocally")}</Callout></div>
      )}

      <div className={cn("space-y-6 border-t pt-6", sectionBorderClass)}>
        {/* Stepper */}
        <div className={cn("rounded-xl border px-6 py-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <div className="flex w-full items-center">
            {STEP_LABEL_KEYS.map((labelKey, i) => {
              const label = t(labelKey);
              const stepNum = (i + 1) as 1 | 2 | 3 | 4;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              const canNav = stepNum <= maxUnlockedStep;
              return (
                <Fragment key={label}>
                  <button
                    onClick={() => { if (canNav) setStep(stepNum); }}
                    aria-disabled={!canNav}
                    aria-label={!canNav ? t("phase1.stepLockedAria", { label }) : label}
                    className={cn("group flex shrink-0 flex-col items-center gap-1.5 transition", !canNav && "cursor-not-allowed opacity-35")}
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
                      isActive || isDone
                        ? dark ? "text-violet-400" : "text-violet-600"
                        : dark ? "text-neutral-500" : "text-slate-400",
                    )}>
                      {label}
                    </span>
                  </button>
                  {i < STEP_LABEL_KEYS.length - 1 && (
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
                { value: "create", Icon: FilePlus2, label: t("phase1.mode.createNew") },
                { value: "load", Icon: Download, label: t("phase1.mode.loadFromPm") },
                { value: "suggest", Icon: Sparkles, label: t("phase1.mode.aiSuggests") },
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
                    {t("phase1.epicTitleLabel")} <span className={cn("block text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{t("common.required")}</span>
                    <Input value={epicTitle} onChange={(event) => setEpicTitle(event.target.value)} placeholder={t("phase1.epicTitlePlaceholder")} />
                  </label>
                  <label className={cn("text-sm font-medium", labelClass)}>
                    {t("phase1.epicIdLabel")} <span className={cn("block text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{t("phase1.epicIdHint")}</span>
                    <Input
                      value={epicId ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        if (!raw) { setEpicId(null); return; }
                        const num = Number(raw);
                        if (!Number.isNaN(num)) setEpicId(num);
                      }}
                      placeholder={t("phase1.epicIdPlaceholder")}
                    />
                  </label>
                </div>
                <label className={cn("block text-sm font-medium", labelClass)}>
                  {t("common.description")}
                  <Textarea rows={5} value={epicDescription} onChange={(event) => setEpicDescription(event.target.value)} placeholder={t("phase1.epicDescPlaceholder")} />
                </label>
                {(epicTitle || epicDescription || epicId) && (
                  <Button variant="secondary" className="gap-2" onClick={clearEpicInputs}>
                    <RotateCcw className="size-3.5" /> {t("phase1.clearFields")}
                  </Button>
                )}
              </div>
            ) : null}

            {mode === "load" ? (
              <div className="space-y-3">
                <div className={cn("flex items-center justify-between text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
                  <span>{t("phase1.epicsCountInProject", { n: epics.data?.length ?? 0 })}</span>
                  <button
                    className={cn("transition-colors", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700")}
                    onClick={() => { epics.refetch(); toast.info(t("phase1.toast.epicsRefreshed")); }}
                  >
                    <RefreshCw className="mr-1 inline size-3" />
                    {t("common.refresh")}
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
                        <span className={cn("rounded border px-2 py-0.5 text-xs", isSelected ? "border-emerald-500/40 text-emerald-400" : dark ? "border-violet-700 text-violet-200" : "border-violet-300 text-violet-700")}>
                          <span className="font-mono">#{epic.ref}</span>
                        </span>
                        <span className={cn("flex-1 font-semibold", isSelected ? "text-emerald-300" : dark ? "text-white" : "text-slate-800")}>
                          {epic.subject}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {epic.stories.length > 0 ? (
                            <span className={cn("rounded border px-1.5 py-0.5 text-xs", dark ? "border-neutral-700 text-neutral-600" : "border-slate-300 text-slate-400")}>
                              {epic.stories.length === 1 ? t("phase1.storiesCountOne", { n: epic.stories.length }) : t("phase1.storiesCountOther", { n: epic.stories.length })}
                            </span>
                          ) : null}
                          {pushedCount > 0 ? (
                            <span className="rounded border border-emerald-700/50 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
                              {t("phase1.pushedBadge", { n: pushedCount })}
                            </span>
                          ) : null}
                        </div>
                        {isSelected ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="size-3.5" /> {t("common.selected")}
                          </span>
                        ) : null}
                      </button>
                      {isExpanded ? (
                        <div className={cn("space-y-3 border-t px-4 pb-4 pt-3", dark ? "border-neutral-800" : "border-slate-200")}>
                          {epic.description ? (
                            <p className={cn("text-sm leading-6", dark ? "text-neutral-400" : "text-slate-600")}>{epic.description}</p>
                          ) : (
                            <p className={cn("text-sm italic", dark ? "text-neutral-600" : "text-slate-400")}>{t("phase1.noDescription")}</p>
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
                                  ? "border-neutral-600 bg-neutral-800 text-neutral-200 hover:border-violet-500/50 hover:bg-neutral-700 hover:text-violet-300"
                                  : "border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:bg-white hover:text-violet-700",
                            )}
                            onClick={() => {
                              setSelectedLoadEpicId(epic.id);
                              setEpicId(epic.id);
                              setEpicTitle(epic.subject);
                              setEpicDescription(epic.description);
                              toast.success(t("phase1.toast.epicLoaded", { title: epic.subject }));
                            }}
                          >
                            <CheckCircle2 className="size-4" />
                            {isSelected ? t("common.selected") : t("phase1.useEpic")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!epics.isLoading && !epics.data?.length ? (
                  <div className={cn("py-4 text-center text-sm", dark ? "text-neutral-500" : "text-slate-400")}>{t("phase1.noEpicsFound")}</div>
                ) : null}
              </div>
            ) : null}

            {mode === "suggest" ? (
              <div className="space-y-4">
                <FigmaStoryPanel
                  dark={dark}
                  onGenerated={(draft) => {
                    setNlDraft(draft);
                    setStep(3);
                  }}
                />
                <GuideTheAI
                  value={suggestHint}
                  onChange={setSuggestHint}
                  placeholder={t("phase1.suggestHintPlaceholder")}
                  dark={dark}
                />
                <Button
                  className="w-full"
                  onClick={() => {
                    setEditedDescriptions({});
                    setAppliedSuggestionIndex(null);
                    suggestEpics.mutate(suggestHint, {
                      onSuccess: (data) => {
                        setSuggestions(data.epics);
                        toast.success(t("phase1.toast.suggestionsReady"));
                      },
                    });
                  }}
                  disabled={suggestEpics.isPending || noContext}
                >
                  <Sparkles className="size-4" />
                  {suggestEpics.isPending ? t("common.generating") : t("phase1.mode.aiSuggests")}
                </Button>
                <AIProgressIndicator steps={SUGGEST_STEPS} isPending={suggestEpics.isPending} dark={dark} />
                {suggestEpics.isPending && <CancelButton onCancel={() => suggestEpics.cancel()} className="mt-2" />}
                {suggestions.length && !suggestEpics.isPending ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm", dark ? "text-neutral-500" : "text-slate-500")}>
                        {t("phase1.suggestionsCount", { n: suggestions.length })}
                      </span>
                      <button
                        className={cn("text-sm transition-colors", dark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-700")}
                        onClick={clearSuggestions}
                      >
                        {t("phase1.clearSuggestions")}
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
                                <CheckCircle2 className="size-3.5" /> {t("common.selected")}
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
                                      ? "border-neutral-600 bg-neutral-800 text-neutral-200 hover:border-violet-500/50 hover:bg-neutral-700 hover:text-violet-300"
                                      : "border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:bg-white hover:text-violet-700",
                                )}
                                onClick={() => {
                                  applySuggestion(suggestion, index);
                                  toast.success(t("phase1.toast.suggestionSelected", { title: suggestion.title }));
                                }}
                              >
                                <CheckCircle2 className="size-4" />
                                {isApplied ? t("common.selected") : t("phase1.useSuggestion")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {suggestEpics.isError ? (
                  <Callout variant="danger">{t("phase1.suggestionFailed", { err: errMsg(suggestEpics.error) })}</Callout>
                ) : null}

                {/* ── Coverage gap analysis ─────────────────────────────── */}
                <div className={cn("space-y-3 rounded-md border border-dashed p-4", dark ? "border-neutral-700" : "border-slate-300")}>
                  <div className="flex items-start gap-3">
                    <ScanSearch className={cn("mt-0.5 size-5 shrink-0", dark ? "text-violet-400" : "text-violet-600")} />
                    <div className="space-y-0.5">
                      <p className={cn("text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{t("phase1.gapAnalysisTitle")}</p>
                      <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
                        {t((epics.data?.length ?? 0) === 1 ? "phase1.gapAnalysisDescOne" : "phase1.gapAnalysisDescOther", { n: epics.data?.length ?? 0 })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={runGapAnalysis}
                    disabled={analyzeGaps.isPending || noContext || !hasProjectConcept}
                  >
                    <ScanSearch className="size-4" />
                    {analyzeGaps.isPending ? t("common.analyzing") : t("phase1.analyzeCoverageGaps")}
                  </Button>
                  {!hasProjectConcept ? (
                    <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                      {t("phase1.gapNeedsConcept")}
                    </p>
                  ) : null}
                  <AIProgressIndicator steps={GAP_STEPS} isPending={analyzeGaps.isPending} dark={dark} />
                  {analyzeGaps.isPending && <CancelButton onCancel={() => analyzeGaps.cancel()} className="mt-2" />}

                  {gapReport && !analyzeGaps.isPending ? (
                    <div className="space-y-3">
                      {gapReport.assessment ? (
                        <p className={cn("rounded-md px-3 py-2 text-sm", dark ? "bg-neutral-800/60 text-neutral-300" : "bg-slate-100 text-slate-600")}>
                          {gapReport.assessment}
                        </p>
                      ) : null}
                      {gapReport.gaps.length === 0 ? (
                        <div className={cn("flex items-center gap-2 text-sm", dark ? "text-emerald-400" : "text-emerald-600")}>
                          <CheckCircle2 className="size-4" /> {t("phase1.coverageStrong")}
                        </div>
                      ) : (
                        [...gapReport.gaps]
                          .sort((a, b) => (IMPORTANCE_RANK[a.importance] ?? 2) - (IMPORTANCE_RANK[b.importance] ?? 2))
                          .map((gap, index) => {
                          const isApplied = appliedGapIndex === index;
                          const missing = gap.kind === "missing_epic";
                          const importance = gap.importance in IMPORTANCE_RANK ? gap.importance : "medium";
                          return (
                            <div key={`${gap.title}-${index}`} className={cn("rounded-md border p-3", isApplied ? "border-emerald-500/50 bg-emerald-500/10" : cardClass)}>
                              <div className="flex items-start gap-2">
                                <span className={cn(
                                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                                  dark ? "bg-neutral-700 text-neutral-200" : "bg-slate-300 text-slate-700",
                                )} title={t("phase1.priorityRank", { n: index + 1 })}>
                                  {index + 1}
                                </span>
                                <span className={cn(
                                  "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                                  IMPORTANCE_STYLE[importance],
                                )}>
                                  {t(IMPORTANCE_LABEL_KEYS[importance as keyof typeof IMPORTANCE_LABEL_KEYS] ?? "phase1.importance.medium")}
                                </span>
                                <span className={cn(
                                  "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                                  missing
                                    ? "border-amber-500/40 text-amber-500"
                                    : "border-neutral-500/40 text-neutral-500",
                                )}>
                                  {missing ? t("phase1.missingEpic") : t("phase1.incomplete")}
                                </span>
                                <span className={cn("flex-1 font-semibold", dark ? "text-white" : "text-slate-800")}>{gap.title}</span>
                                {isApplied ? (
                                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-400">
                                    <CheckCircle2 className="size-3.5" /> {t("common.loaded")}
                                  </span>
                                ) : null}
                              </div>
                              {gap.rationale ? (
                                <p className={cn("mt-1.5 text-sm leading-6", dark ? "text-neutral-400" : "text-slate-600")}>{gap.rationale}</p>
                              ) : null}
                              {gap.suggested_stories.length ? (
                                <ul className={cn("mt-2 list-disc space-y-0.5 pl-5 text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
                                  {gap.suggested_stories.map((story, si) => (
                                    <li key={si}>{story}</li>
                                  ))}
                                </ul>
                              ) : null}
                              <button
                                className={cn(
                                  "mt-3 flex w-full items-center justify-center gap-2 rounded border py-1.5 text-sm font-semibold transition-all duration-200",
                                  isApplied
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                    : dark
                                      ? "border-neutral-600 bg-neutral-800 text-neutral-200 hover:border-violet-500/50 hover:bg-neutral-700 hover:text-violet-300"
                                      : "border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:bg-white hover:text-violet-700",
                                )}
                                onClick={() => applyGap(gap, index)}
                              >
                                <Plus className="size-4" />
                                {isApplied ? t("phase1.loadedIntoCreateNew") : t("phase1.useAsEpic")}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}

                  {analyzeGaps.isError ? (
                    <Callout variant="danger">{t("phase1.gapAnalysisFailed", { err: errMsg(analyzeGaps.error) })}</Callout>
                  ) : null}
                </div>

                {/* ── Constraints (EARS) — available here so you don't need to push stories first ── */}
                <div className={cn("rounded-lg border p-4", dark ? "border-neutral-800 bg-neutral-900/40" : "border-slate-200 bg-slate-50")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>{t("common.constraints")}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")}>{t("common.optional")}</span>
                  </div>
                  <p className={cn("mt-1 text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
                    {t("phase1.earsDescPre")} <code>constraints.md</code> {t("phase1.earsDescPost")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEarsOpen((v) => !v)}
                    className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium transition-colors", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700")}
                  >
                    <Info className="size-3.5" />
                    {t("phase1.whatIsEars")}
                    <ChevronRight className={cn("size-3.5 transition-transform", earsOpen && "rotate-90")} />
                  </button>
                  {earsOpen ? (
                    <div className={cn("mt-2 space-y-2 rounded-md border p-3 text-xs leading-5", dark ? "border-neutral-800 bg-neutral-950 text-neutral-400" : "border-slate-200 bg-white text-slate-600")}>
                      <p>{t("phase1.earsExplain1")}</p>
                      <p>{t("phase1.earsExplain2")}</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        <li><strong>{t("phase1.earsUbiquitous")}</strong> — {t("phase1.earsUbiquitousPattern")}</li>
                        <li><strong>{t("phase1.earsEventDriven")}</strong> — {t("phase1.earsEventDrivenPattern")}</li>
                        <li><strong>{t("phase1.earsStateDriven")}</strong> — {t("phase1.earsStateDrivenPattern")}</li>
                        <li><strong>{t("phase1.earsUnwanted")}</strong> — {t("phase1.earsUnwantedPattern")}</li>
                      </ul>
                      <p>{t("phase1.earsExplain3")}</p>
                    </div>
                  ) : null}
                  {constraintsGenerated ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                      <CheckCircle2 className="size-4" /> {t("phase1.savedToConstraints")}
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        className="mt-3 w-full"
                        disabled={genConstraints.isPending || updateContextFile.isPending}
                        onClick={() =>
                          genConstraints.mutate(undefined, {
                            onSuccess: (res) => {
                              updateContextFile.mutate({ filename: "constraints.md", content: res.constraints_md });
                              setConstraintsGenerated(true);
                              toast.success(t(res.constraints.length === 1 ? "phase1.toast.constraintsGeneratedOne" : "phase1.toast.constraintsGeneratedOther", { n: res.constraints.length }));
                            },
                          })
                        }
                      >
                        {genConstraints.isPending
                          ? <><Loader2 className="size-4 animate-spin" /> {t("common.generating")}</>
                          : t("phase1.generateConstraints")}
                      </Button>
                      <AIProgressIndicator steps={CONSTRAINT_STEPS} isPending={genConstraints.isPending} dark={dark} />
                      {genConstraints.isPending && <CancelButton onCancel={() => genConstraints.cancel()} className="mt-2" />}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <Button
              className="w-full"
              disabled={!canGenerate}
              onClick={() => setStep(2)}
            >
              {t("phase1.continueToGenerate")}
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
                  <p className={cn("text-xs font-medium uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>{t("common.epic")}</p>
                  <p className={cn("mt-0.5 text-base font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{epicTitle}</p>
                  {epicDescription && (
                    <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>{epicDescription}</p>
                  )}
                </div>
                <button
                  onClick={() => setStep(1)}
                  className={cn("ml-4 shrink-0 text-xs font-medium transition", dark ? "text-neutral-400 hover:text-violet-400" : "text-slate-400 hover:text-violet-600")}
                >
                  {t("common.change")}
                </button>
              </div>
            ) : null}
            {!canGenerate ? <Callout>{t("phase1.fillEpicHint")}</Callout> : null}
            <GuideTheAI
              value={generateHint}
              onChange={setGenerateHint}
              dark={dark}
              disabled={busy}
              placeholder={t("phase1.generateHintPlaceholder")}
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="gap-1.5" onClick={() => setStep(1)} disabled={busy}>
                <ChevronLeft className="size-4" /> {t("common.back")}
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
                        toast.success(t("phase1.toast.storiesGenerated"));
                      },
                    },
                  )
                }
              >
                <Sparkles className="size-4" />
                {generate.isPending ? t("common.generating") : t("phase1.generateStories")}
              </Button>
            </div>
            <AIProgressIndicator steps={GENERATE_STEPS} isPending={generate.isPending} dark={dark} />
            {generate.isPending && <CancelButton onCancel={() => generate.cancel()} className="w-full" />}
            {generate.isError ? (
              <Callout variant="danger">{t("phase1.generationFailed", { err: errMsg(generate.error) })}</Callout>
            ) : null}
          </div>
        )}

        {/* ── Step 3: Review Story Descriptions ────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {epicTitle ? (
              <div className={cn("rounded-md border px-4 py-3", dark ? "border-neutral-700 bg-neutral-800/50" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-xs font-medium uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>{t("common.epic")}</p>
                <p className={cn("mt-0.5 text-base font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{epicTitle}</p>
                {epicDescription && (
                  <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>{epicDescription}</p>
                )}
              </div>
            ) : null}
            <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
              {t("phase1.reviewDraftHint")}
            </p>
            <Textarea rows={14} value={nlDraft} onChange={(event) => setNlDraft(event.target.value)} />

            {crossEnabled ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <AltModelSelect aiConfig={aiConfig.data} value={altModel} onChange={setAltModel} dark={dark} disabled={crossCheck.isPending} />
                  <Button
                    variant="secondary"
                    className="flex-1 justify-center"
                    disabled={busy || noContext || !epicTitle.trim()}
                    onClick={() =>
                      crossCheck.mutate(
                        { epic_subject: epicTitle, epic_description: epicDescription, altModel },
                        {
                          onSuccess: (r) => {
                            setCrossResult(r);
                            toast.success(
                              r.only_alt.length
                                ? t(r.only_alt.length === 1 ? "phase1.toast.crossCheckFoundOne" : "phase1.toast.crossCheckFoundOther", { altLabel: r.alt_label, n: r.only_alt.length })
                                : t("phase1.toast.crossCheckAgreed", { altLabel: r.alt_label }),
                            );
                          },
                        },
                      )
                    }
                  >
                    <GitCompare className="size-4" /> {crossCheck.isPending ? t("phase1.crossChecking") : t("phase1.crossCheck")}
                  </Button>
                </div>
                <AIProgressIndicator steps={GENERATE_STEPS} isPending={crossCheck.isPending} dark={dark} />
                {crossCheck.isPending && <CancelButton onCancel={() => crossCheck.cancel()} className="w-full" />}
                {crossResult ? (
                  <CrossCheckPanel
                    result={crossResult}
                    dark={dark}
                    noun="scenario"
                    onDismiss={() => setCrossResult(null)}
                    onAdd={(s) => {
                      setNlDraft((d) => `${d.trimEnd()}\n\n  Scenario: ${s.title}\n  ${s.description}`);
                      toast.success(t("phase1.toast.addedToDraft"));
                    }}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy || noContext || !nlDraft.trim()}
                onClick={() =>
                  clarify.mutate(
                    { epic_subject: epicTitle, epic_description: epicDescription, nl_draft: nlDraft, hint: generateHint },
                    {
                      onSuccess: (data) => {
                        setQaQuestions(data.questions);
                        setQaAnswers({});
                        if (data.questions.length === 0) {
                          toast.info(t("phase1.toast.noAmbiguity"));
                        }
                      },
                    },
                  )
                }
              >
                {clarify.isPending
                  ? <><Loader2 className="size-4 animate-spin" /> {t("phase1.checkingAmbiguity")}</>
                  : <><HelpCircle className="size-4" /> {t("phase1.clarifyAmbiguities")}</>}
              </Button>
              <AIProgressIndicator steps={CLARIFY_STEPS} isPending={clarify.isPending} dark={dark} />
              {clarify.isPending && <CancelButton onCancel={() => clarify.cancel()} className="w-full" />}
              {qaQuestions.length > 0 ? (
                <div className={cn("space-y-3 rounded-md border p-3", dark ? "border-neutral-700 bg-neutral-800/50" : "border-slate-200 bg-slate-50")}>
                  <div className="flex items-center justify-between">
                    <p className={cn("text-xs font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
                      {t("phase1.clarifyHint")}
                    </p>
                    <button
                      className={cn("shrink-0 rounded p-1", dark ? "text-neutral-500 hover:bg-neutral-700" : "text-slate-400 hover:bg-slate-200")}
                      onClick={() => { setQaQuestions([]); setQaAnswers({}); }}
                      title={t("phase1.dismiss")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {qaQuestions.map((q) => (
                    <div key={q.id} className="space-y-1">
                      <p className={cn("text-sm font-medium", dark ? "text-neutral-100" : "text-slate-800")}>{q.question}</p>
                      <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{q.rationale}</p>
                      <Input
                        placeholder={t("phase1.answerPlaceholder")}
                        value={qaAnswers[q.id] ?? ""}
                        onChange={(event) => setQaAnswers((a) => ({ ...a, [q.id]: event.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Button
              className="w-full"
              disabled={busy || noContext}
              onClick={() => {
                const answered = qaQuestions
                  .map((q) => ({ question: q.question, answer: (qaAnswers[q.id] ?? "").trim() }))
                  .filter((p) => p.answer);
                setClarifications(answered);
                compile.mutate(
                  { nlDraft, clarifications: answered },
                  {
                    onSuccess: (data) => {
                      setCompiledStories(data.stories);
                      setStep(4);
                      toast.success(t("phase1.toast.storiesConverted", { n: data.stories.length }));
                    },
                  },
                );
              }}
            >
              {compile.isPending
                ? <><Loader2 className="size-4 animate-spin" /> {t("phase1.converting")}</>
                : <><Sparkles className="size-4" /> {t("phase1.convertToAc")}</>}
            </Button>
            <AIProgressIndicator steps={COMPILE_STEPS} isPending={compile.isPending} dark={dark} />
            {compile.isPending && <CancelButton onCancel={() => compile.cancel()} className="w-full" />}
            {compile.isError ? (
              <Callout variant="danger">{t("phase1.compileFailed", { err: errMsg(compile.error) })}</Callout>
            ) : null}
          </div>
        )}

        {/* ── Step 4: Review Acceptance Criteria & Publish ─────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            {epicTitle ? (
              <div className={cn("rounded-md border px-4 py-3", dark ? "border-neutral-700 bg-neutral-800/50" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-xs font-medium uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>{t("common.epic")}</p>
                <p className={cn("mt-0.5 text-base font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>{epicTitle}</p>
                {epicDescription && (
                  <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>{epicDescription}</p>
                )}
              </div>
            ) : null}
            <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
              {t("phase1.acHint")}
            </p>

            {validationErrors.length > 0 ? (
              <Callout variant="danger">
                <div className="mb-1 font-semibold">{t("phase1.fixBeforePushing")}</div>
                <ul className="list-disc pl-4">
                  {validationErrors.map((err) => <li key={err}>{err}</li>)}
                </ul>
              </Callout>
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
                      title={t("phase1.cycleSizeTitle")}
                      onClick={() => cycleSize(index)}
                    >
                      {story.size || "XS"}
                    </button>
                    <button
                      className="grid size-8 shrink-0 place-items-center rounded text-red-400 transition-colors hover:bg-red-950"
                      onClick={() => setCompiledStories((s) => s.filter((_, i) => i !== index))}
                      aria-label={t("phase1.deleteStory")}
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
                  {story.assumptions && story.assumptions.length > 0 && (
                    <div
                      className={cn(
                        "mt-2 space-y-1 rounded-md border px-3 py-2.5 text-xs",
                        dark ? "border-amber-600/40 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-700",
                      )}
                    >
                      <p className="flex items-center gap-1.5 font-semibold">
                        <AlertCircle className="size-3.5" />
                        {t("phase1.assumptionsWarning")}
                      </p>
                      <ul className="list-disc pl-5">
                        {story.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              className={cn(
                "flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors",
                dark
                  ? "border-neutral-700 text-neutral-300 hover:border-violet-500/50 hover:bg-neutral-800 hover:text-violet-300"
                  : "border-slate-300 text-slate-600 hover:border-violet-400 hover:bg-white hover:text-violet-700",
              )}
              onClick={() => setCompiledStories((s) => [...s, { title: t("phase1.newStoryTitle"), size: "XS", gherkin: "Feature: \n\nScenario: \n  Given \n  When \n  Then " }])}
            >
              <Plus className="size-4" /> {t("phase1.addStory")}
            </button>

            {pushSuccess ? (
              <div className="space-y-4">
                <Callout variant="success">{t("phase1.pushedAndLocked", { n: push.data?.count ?? 0 })}</Callout>
                {push.data?.story_urls?.length ? (
                  <div className="space-y-1">
                    <div className={cn("text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>{t("phase1.createdStories")}</div>
                    {push.data.story_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn("flex items-center gap-1 text-sm transition-colors", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700")}
                      >
                        <ExternalLink className="size-3" />
                        <span className="font-mono">{url}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
                {/* Optional: project-wide constraints (EARS). */}
                <div className={cn("rounded-lg border p-4", dark ? "border-neutral-800 bg-neutral-900/40" : "border-slate-200 bg-slate-50")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>{t("common.constraints")}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-200 text-slate-500")}>{t("common.optional")}</span>
                  </div>
                  <p className={cn("mt-1 text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
                    {t("phase1.earsDescPre")} <code>constraints.md</code> {t("phase1.earsDescPost")}
                  </p>

                  {/* What is EARS? — disclosure explaining the notation + what gets generated. */}
                  <button
                    type="button"
                    onClick={() => setEarsOpen((v) => !v)}
                    className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium transition-colors", dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700")}
                  >
                    <Info className="size-3.5" />
                    {t("phase1.whatIsEars")}
                    <ChevronRight className={cn("size-3.5 transition-transform", earsOpen && "rotate-90")} />
                  </button>
                  {earsOpen ? (
                    <div className={cn("mt-2 space-y-2 rounded-md border p-3 text-xs leading-5", dark ? "border-neutral-800 bg-neutral-950 text-neutral-400" : "border-slate-200 bg-white text-slate-600")}>
                      <p>{t("phase1.earsExplain1")}</p>
                      <p>{t("phase1.earsExplain2")}</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        <li><strong>{t("phase1.earsUbiquitous")}</strong> — {t("phase1.earsUbiquitousPattern")}</li>
                        <li><strong>{t("phase1.earsEventDriven")}</strong> — {t("phase1.earsEventDrivenPattern")}</li>
                        <li><strong>{t("phase1.earsStateDriven")}</strong> — {t("phase1.earsStateDrivenPattern")}</li>
                        <li><strong>{t("phase1.earsUnwanted")}</strong> — {t("phase1.earsUnwantedPattern")}</li>
                      </ul>
                      <p>{t("phase1.earsExplain3")}</p>
                    </div>
                  ) : null}

                  {constraintsGenerated ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                      <CheckCircle2 className="size-4" /> {t("phase1.savedToConstraints")}
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        className="mt-3 w-full"
                        disabled={genConstraints.isPending || updateContextFile.isPending}
                        onClick={() =>
                          genConstraints.mutate(undefined, {
                            onSuccess: (res) => {
                              updateContextFile.mutate({ filename: "constraints.md", content: res.constraints_md });
                              setConstraintsGenerated(true);
                              toast.success(t(res.constraints.length === 1 ? "phase1.toast.constraintsGeneratedOne" : "phase1.toast.constraintsGeneratedOther", { n: res.constraints.length }));
                            },
                          })
                        }
                      >
                        {genConstraints.isPending
                          ? <><Loader2 className="size-4 animate-spin" /> {t("common.generating")}</>
                          : t("phase1.generateConstraints")}
                      </Button>
                      <AIProgressIndicator steps={CONSTRAINT_STEPS} isPending={genConstraints.isPending} dark={dark} />
                      {genConstraints.isPending && <CancelButton onCancel={() => genConstraints.cancel()} className="mt-2" />}
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <Button onClick={() => router.push("/phase2")} className="w-full">
                    <ChevronRight className="size-4" /> {t("phase1.moveToPhase2")}
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={() => { startNewEpic(true); toast.info(t("phase1.toast.readyForNextEpic")); }}>
                    <RefreshCw className="size-4" /> {t("phase1.startNewEpic")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  className="w-full"
                  disabled={!canPush}
                  onClick={() => {
                    if (!window.confirm(t("phase1.pushConfirm", { n: compiledStories.length }))) return;
                    push.mutate(
                      {
                        epic_subject: epicTitle,
                        epic_description: epicDescription,
                        epic_id: epicId,
                        stories: compiledStories,
                        clarifications,
                      },
                      {
                        onSuccess: (data) => {
                          setPushSuccess(true);
                          toast.success(t("phase1.toast.storiesPushed", { n: data.count }));
                        },
                      },
                    );
                  }}
                >
                  {push.isPending
                    ? <><Loader2 className="size-4 animate-spin" /> {t("phase1.pushing")}</>
                    : <><Upload className="size-4" /> {t("phase1.pushStories")}</>}
                </Button>
                <AIProgressIndicator steps={PUSH_STEPS} isPending={push.isPending} dark={dark} />
                {push.isError ? (
                  <Callout variant="danger">{t("phase1.pushFailed", { err: errMsg(push.error) })}</Callout>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
