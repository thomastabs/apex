"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  StopCircle,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, Input, SectionHeading, Skeleton, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  DESIGN_SECTION_ORDER,
  useGenerateDesignSections,
  useLockDesign,
  useLockTechStack,
  useProposeTechStack,
  useRefreshStoryIndex,
  useTechStackStatus,
} from "@/lib/hooks/use-phase2";
import type { DesignSectionKey } from "@/lib/api/types";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";

const PROPOSE_STEPS = [
  "Loading project information…",
  "Analysing all stories and requirements…",
  "Evaluating technology options…",
  "Ranking alternatives by project fit…",
];

const DESIGN_STEPS: Record<DesignSectionKey, string> = {
  ux_brief:   "Writing UX Brief…",
  endpoints:  "Defining Endpoints…",
  data_model: "Building Data Model…",
};

type SectionCfg = {
  stepLabel: string;
  title: string;
  description: string;
  dependsOn: DesignSectionKey[];
};

const SECTION_CONFIG: Record<DesignSectionKey, SectionCfg> = {
  ux_brief: {
    stepLabel:   "Step 1",
    title:       "UX Brief",
    description: "Screen inventory and navigation paths — every screen grouped by epic, plus the key navigation flows.",
    dependsOn:   [],
  },
  endpoints: {
    stepLabel:   "Step 2",
    title:       "Endpoints",
    description: "REST endpoint list grouped by epic — method, path, auth, request fields, and response fields per story.",
    dependsOn:   ["ux_brief"],
  },
  data_model: {
    stepLabel:   "Step 3",
    title:       "Data Model",
    description: "Core entities, fields, and relations derived from the endpoint list.",
    dependsOn:   ["endpoints"],
  },
};

function downloadDesignBundle(bundle: { ux_brief: string; endpoints: string; data_model: string }) {
  const content = [
    "# Project Design Bundle",
    "",
    "## UX Brief",
    bundle.ux_brief,
    "",
    "## Endpoints",
    bundle.endpoints,
    "",
    "## Data Model",
    bundle.data_model,
  ].join("\n");
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "design-bundle.md";
  a.click();
  URL.revokeObjectURL(url);
}

const DRAFT_KEY = "apex-phase2-bundle-draft";

function saveBundleDraft(projectId: number | null, bundle: object | null) {
  if (typeof window === "undefined") return;
  const key = `${DRAFT_KEY}-${projectId ?? "none"}`;
  if (!bundle) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(bundle));
  }
}

function loadBundleDraft(projectId: number | null): object | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY}-${projectId ?? "none"}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function Phase2Workflow() {
  const dark = useUiStore((state) => state.theme) === "dark";
  const context = useApiContext();
  const [stackHint, setStackHint] = useState("");
  const [stackReopened, setStackReopened] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [partial, setPartial] = useState<Partial<Record<DesignSectionKey, string>>>({});
  const [partialStoryIds, setPartialStoryIds] = useState<number[]>([]);
  const {
    alternatives,
    selectedAlternativeIndex,
    techStackDraft,
    designBundle,
    designLeadApproved,
    techLeadApproved,
    setAlternatives,
    setSelectedAlternativeIndex,
    setTechStackDraft,
    setDesignBundle,
    setDesignLeadApproved,
    setTechLeadApproved,
  } = usePhase2Store();

  const bundleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designBundleRef = useRef(designBundle);
  designBundleRef.current = designBundle;

  const techStack = useTechStackStatus();
  const proposeStack = useProposeTechStack();
  const lockStack = useLockTechStack();
  const generateSections = useGenerateDesignSections();
  const lockDesign = useLockDesign();
  const refreshIndex = useRefreshStoryIndex();

  useEffect(() => {
    if (techStack.data?.tech_stack && !techStackDraft) {
      setTechStackDraft(techStack.data.tech_stack);
    }
  }, [setTechStackDraft, techStack.data?.tech_stack, techStackDraft]);

  useEffect(() => {
    const saved = loadBundleDraft(context?.projectId ?? null);
    if (saved && !designBundleRef.current) {
      setDesignBundle(saved as Parameters<typeof setDesignBundle>[0]);
    }
  }, [context?.projectId, setDesignBundle]);

  useEffect(() => {
    if (bundleSaveTimer.current) clearTimeout(bundleSaveTimer.current);
    bundleSaveTimer.current = setTimeout(() => {
      saveBundleDraft(context?.projectId ?? null, designBundle);
    }, 500);
    return () => { if (bundleSaveTimer.current) clearTimeout(bundleSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.projectId, designBundle]);

  const stackDefined = Boolean(techStack.data?.defined) && !stackReopened;
  const noContext = !context;
  const busy = proposeStack.isPending || lockStack.isPending || generateSections.isPending || lockDesign.isPending || refreshIndex.isPending;

  const activeBundle = generateSections.isPending && Object.keys(partial).length > 0
    ? {
        ux_brief:   partial.ux_brief   ?? designBundle?.ux_brief   ?? "",
        endpoints:  partial.endpoints  ?? designBundle?.endpoints  ?? "",
        data_model: partial.data_model ?? designBundle?.data_model ?? "",
        story_ids:  partialStoryIds.length ? partialStoryIds : (designBundle?.story_ids ?? []),
      }
    : designBundle;

  const allSectionsPopulated = Boolean(activeBundle?.ux_brief && activeBundle?.endpoints && activeBundle?.data_model);
  const canSave = Boolean(activeBundle && !generateSections.isPending && allSectionsPopulated && designLeadApproved && techLeadApproved);

  const activeStepIdx = generateSections.currentSection
    ? DESIGN_SECTION_ORDER.indexOf(generateSections.currentSection)
    : undefined;

  function clearDesign() {
    setDesignBundle(null);
    setDesignLeadApproved(false);
    setTechLeadApproved(false);
    setPartial({});
    toast.info("Design cleared");
  }

  function reopenStack() {
    setStackReopened(true);
    setTechStackDraft(techStack.data?.tech_stack ?? "");
  }

  function doGenerate() {
    setDesignLeadApproved(false);
    setTechLeadApproved(false);
    const accumulated: Partial<Record<DesignSectionKey, string>> = {};
    let accStoryIds: number[] = [];
    setPartial({});
    generateSections.generate({
      onSection: (section, content, storyIds) => {
        accumulated[section] = content;
        accStoryIds = storyIds;
        setPartial({ ...accumulated });
        setPartialStoryIds(storyIds);
      },
      onDone: () => {
        setDesignBundle({
          ux_brief:   accumulated.ux_brief   ?? "",
          endpoints:  accumulated.endpoints  ?? "",
          data_model: accumulated.data_model ?? "",
          story_ids:  accStoryIds,
        });
        setPartial({});
        toast.success("Project design generated");
      },
    });
  }

  function doGenerateSection(targetSection: DesignSectionKey) {
    const existingBundle = designBundle;
    setDesignLeadApproved(false);
    setTechLeadApproved(false);
    setPartial({});
    setPartialStoryIds([]);

    const idx = DESIGN_SECTION_ORDER.indexOf(targetSection);
    const downstreamHasContent = DESIGN_SECTION_ORDER.slice(idx + 1).some((s) => existingBundle?.[s as DesignSectionKey]);
    if (downstreamHasContent) {
      toast.warning(
        `Regenerating "${SECTION_CONFIG[targetSection].title}" may make later sections inconsistent — regenerate them afterwards.`,
        { duration: 6000 },
      );
    }

    const prior: Record<string, string> = {};
    for (const s of DESIGN_SECTION_ORDER) {
      if (s === targetSection) break;
      const prev = existingBundle?.[s as DesignSectionKey];
      if (prev) prior[s] = prev;
    }

    let latestContent = "";
    let latestStoryIds: number[] = [];
    generateSections.generateSection(targetSection, prior, {
      onSection: (section, content, storyIds) => {
        latestContent = content;
        latestStoryIds = storyIds;
        setPartial({ [section]: content });
        setPartialStoryIds(storyIds);
      },
      onDone: () => {
        setDesignBundle({
          ux_brief:   existingBundle?.ux_brief   ?? "",
          endpoints:  existingBundle?.endpoints  ?? "",
          data_model: existingBundle?.data_model ?? "",
          story_ids:  latestStoryIds.length ? latestStoryIds : (existingBundle?.story_ids ?? []),
          [targetSection]: latestContent,
        });
        setPartial({});
        toast.success(`${SECTION_CONFIG[targetSection].title} generated`);
      },
    });
  }

  const sectionBorderClass = dark ? "border-neutral-700" : "border-slate-200";
  const labelClass = dark ? "text-neutral-200" : "text-slate-700";
  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";
  const cardClass = dark ? "border-neutral-800 bg-[#1f1f21]" : "border-slate-200 bg-slate-50";
  const outlineButtonClass = dark
    ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
    : "border-slate-300 text-slate-600 hover:bg-slate-100";

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Phase 2</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>Design</h1>
        <p className={cn("mt-2", mutedClass)}>
          Two-gate approval process: your Design Lead and Tech Lead review and lock the project design before implementation begins.
        </p>
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
            <img src="/images/design.svg" alt="Phase 2 design process diagram" className="mx-auto max-w-full" />
          </div>
        ) : null}
      </div>

      {noContext ? (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Sign in required</p>
            <p className="mt-0.5 text-xs text-amber-400/80">Sign in and select a Taiga project in the sidebar to unlock Phase 2 design tools.</p>
          </div>
        </div>
      ) : null}

      <div className={cn("space-y-8 border-t pt-6", sectionBorderClass)}>
        {/* ── Stage A: Tech Stack ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeading>Stage A · Technology Choices</SectionHeading>
          <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
            Example: React frontend, FastAPI backend, PostgreSQL database, hosted on Azure.
          </p>
          {stackDefined ? (
            <div className="flex items-start justify-between gap-4">
              <Callout>Technology choices are locked for this project. You can review them below before generating the design.</Callout>
              <button
                className={cn("flex shrink-0 items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                title="Reopen technology choices for editing"
                onClick={reopenStack}
              >
                <Unlock className="size-3" />
                Reopen
              </button>
            </div>
          ) : (
            <Callout>Choose and lock in the technologies your team will use. This guides the AI when generating your project design.</Callout>
          )}
          <label className={cn("block text-sm font-medium", labelClass)}>
            Tech Lead Notes <span className={mutedClass}>Optional</span>
            <Input value={stackHint} onChange={(event) => setStackHint(event.target.value)} placeholder="e.g. prefer Python backend, PostgreSQL, simple deployment" />
          </label>
          {!stackDefined ? (
            <Button
              className="w-full"
              disabled={busy || noContext}
              onClick={() =>
                proposeStack.mutate(
                  { hint: stackHint },
                  {
                    onSuccess: (data) => {
                      setAlternatives(data.alternatives);
                      setSelectedAlternativeIndex(-1);
                      toast.success("Architecture alternatives proposed");
                    },
                  },
                )
              }
            >
              <Sparkles className="size-4" />
              Propose Architecture
            </Button>
          ) : null}
          <AIProgressIndicator steps={PROPOSE_STEPS} isPending={proposeStack.isPending} dark={dark} />
          {proposeStack.isError ? (
            <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              Proposal failed: {errMsg(proposeStack.error)}
            </div>
          ) : null}

          {alternatives.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {alternatives.map((alt, index) => (
                <button
                  key={alt.name}
                  onClick={() => {
                    setSelectedAlternativeIndex(index);
                    setTechStackDraft(`${alt.name}\n\n${alt.description}\n\n${alt.trade_offs}`);
                  }}
                  className={cn(
                    "rounded-md border p-4 text-left transition-colors",
                    dark ? "bg-[#1f1f21]" : "bg-slate-50",
                    selectedAlternativeIndex === index
                      ? "border-violet-500"
                      : dark ? "border-neutral-800 hover:border-neutral-700" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <div className={cn("mb-2 font-semibold", dark ? "text-white" : "text-slate-900")}>
                    Option {index + 1}: {alt.name}
                  </div>
                  <p className={cn("mb-3 text-sm leading-6", dark ? "text-neutral-400" : "text-slate-600")}>{alt.description}</p>
                  <pre className={cn("whitespace-pre-wrap text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{alt.trade_offs}</pre>
                </button>
              ))}
            </div>
          ) : null}

          <label className={cn("block text-sm font-medium", labelClass)}>
            Technology Choices Draft
            <Textarea rows={8} value={techStackDraft} onChange={(event) => setTechStackDraft(event.target.value)} />
          </label>
          <Button
            className="w-full"
            disabled={busy || noContext || !techStackDraft.trim()}
            onClick={() => {
              lockStack.mutate(
                { tech_stack: techStackDraft },
                {
                  onSuccess: () => {
                    setStackReopened(false);
                    toast.success("Technology choices saved");
                  },
                },
              );
            }}
          >
            <Save className="size-4" />
            Save Technology Choices
          </Button>
          {lockStack.isError ? (
            <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              Lock failed: {errMsg(lockStack.error)}
            </div>
          ) : null}
        </section>

        {/* ── Stage B: Project Design (2 sections) ────────────────────────── */}
        {stackDefined ? (
          <section className={cn("space-y-5 border-t pt-6", sectionBorderClass)}>
            <SectionHeading>Stage B · Project Design</SectionHeading>
            <p className={cn("text-sm", mutedClass)}>
              Generate a concise UX Brief and API Surface covering all your project stories.
            </p>
            <div className={cn("flex items-start gap-3 rounded-md border px-4 py-3 text-sm", dark ? "border-amber-600/30 bg-amber-500/8" : "border-amber-400/50 bg-amber-50")}>
              <Info className={cn("mt-0.5 size-4 shrink-0", dark ? "text-amber-400" : "text-amber-600")} />
              <p className={dark ? "text-amber-300/90" : "text-amber-700"}>
                <span className="font-semibold">These are AI-generated drafts</span> — starting points for team review, not final deliverables.
                Read each section carefully, edit the content as needed, and only lock once both leads have signed off.
              </p>
            </div>

            {/* Action bar */}
            <div className="space-y-2">
              {generateSections.isPending ? (
                <button
                  className={cn("flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                  onClick={() => generateSections.cancel()}
                >
                  <StopCircle className="size-4 text-red-400" />
                  Cancel Generation
                </button>
              ) : (
                <Button
                  className="w-full"
                  disabled={busy || noContext}
                  onClick={() => {
                    if (designBundle) {
                      toast.warning("A design already exists. Regenerating all sections will overwrite it.", {
                        action: { label: "Regenerate All", onClick: doGenerate },
                        duration: 8000,
                      });
                    } else {
                      doGenerate();
                    }
                  }}
                >
                  <Sparkles className="size-4" />
                  Generate Design
                </Button>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors disabled:opacity-40", outlineButtonClass)}
                  disabled={busy}
                  title="Refresh story index from Taiga"
                  onClick={() =>
                    refreshIndex.mutate(undefined, {
                      onSuccess: () => toast.success("Story index refreshed"),
                    })
                  }
                >
                  <RefreshCw className="size-3" />
                  Refresh Index
                </button>
                {activeBundle && !generateSections.isPending ? (
                  <>
                    <button
                      className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                      title="Download design bundle as Markdown"
                      onClick={() => downloadDesignBundle(activeBundle)}
                    >
                      <Download className="size-3" />
                      Export
                    </button>
                    <button
                      className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                      title="Clear current design"
                      onClick={clearDesign}
                    >
                      <RotateCcw className="size-3" />
                      Clear
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <AIProgressIndicator
              steps={DESIGN_SECTION_ORDER.map((s) => DESIGN_STEPS[s])}
              isPending={generateSections.isPending}
              dark={dark}
              activeStep={activeStepIdx}
            />
            {generateSections.error ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                Generation failed: {generateSections.error}
              </div>
            ) : null}

            {/* ── 2 Design Sections ─────────────────────────────────────────── */}
            <div className="space-y-4">
              {DESIGN_SECTION_ORDER.map((section) => {
                const cfg = SECTION_CONFIG[section];
                const content = activeBundle?.[section] ?? "";
                const isThisGenerating = generateSections.isPending && generateSections.currentSection === section;
                const hasContent = Boolean(content);
                const depsOk = cfg.dependsOn.every((dep) => Boolean(activeBundle?.[dep]));
                const canGenerate = !busy && !noContext && depsOk;

                return (
                  <div
                    key={section}
                    className={cn("overflow-hidden rounded-md border", dark ? "border-neutral-800" : "border-slate-200")}
                  >
                    {/* Panel header */}
                    <div className={cn("flex items-center justify-between px-4 py-3", dark ? "bg-neutral-900" : "bg-slate-50")}>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "inline-flex h-5 items-center justify-center rounded px-2 text-xs font-bold",
                          dark ? "bg-violet-900/60 text-violet-300" : "bg-violet-100 text-violet-700",
                        )}>
                          {cfg.stepLabel}
                        </span>
                        <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>
                          {cfg.title}
                        </span>
                      </div>
                      {isThisGenerating ? (
                        <span className="animate-pulse text-xs text-violet-400">Generating…</span>
                      ) : hasContent ? (
                        <span className={cn("flex items-center gap-1 text-xs", dark ? "text-emerald-400" : "text-emerald-600")}>
                          <CheckCircle2 className="size-3" /> Generated
                        </span>
                      ) : (
                        <span className={cn("text-xs", mutedClass)}>Not generated</span>
                      )}
                    </div>

                    {/* Description */}
                    <div className={cn("border-t px-4 py-2 text-xs", dark ? "border-neutral-800 text-neutral-500" : "border-slate-100 text-slate-500")}>
                      {cfg.description}
                    </div>

                    {/* Content */}
                    {isThisGenerating ? (
                      <div className={cn("border-t px-4 py-4", dark ? "border-neutral-800" : "border-slate-100")}>
                        <Skeleton className="h-48 w-full" />
                      </div>
                    ) : hasContent ? (
                      <textarea
                        className={cn(
                          "w-full resize-y border-t p-4 font-mono text-xs leading-5 outline-none",
                          dark
                            ? "border-neutral-800 bg-neutral-950 text-neutral-200 placeholder-neutral-600"
                            : "border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400",
                        )}
                        style={{ minHeight: "8rem", height: "20rem" }}
                        value={content}
                        onChange={(e) => {
                          if (!designBundle) return;
                          setDesignBundle({ ...designBundle, [section]: e.target.value });
                        }}
                        spellCheck={false}
                      />
                    ) : (
                      <div className={cn("border-t px-4 py-8 text-center text-sm", dark ? "border-neutral-800 text-neutral-700" : "border-slate-100 text-slate-400")}>
                        {!depsOk
                          ? `Generate ${cfg.dependsOn.map((d) => SECTION_CONFIG[d].title).join(" and ")} first.`
                          : "Not generated yet."}
                      </div>
                    )}

                    {/* Generate / Regenerate button */}
                    <div className={cn("border-t px-4 py-3", dark ? "border-neutral-800" : "border-slate-100")}>
                      {isThisGenerating ? (
                        <button
                          className={cn("flex w-full items-center justify-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors", outlineButtonClass)}
                          onClick={() => generateSections.cancel()}
                        >
                          <StopCircle className="size-3.5 text-red-400" />
                          Cancel
                        </button>
                      ) : (
                        <button
                          className={cn(
                            "flex w-full items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                            canGenerate
                              ? "bg-violet-700 text-white hover:bg-violet-600"
                              : cn("cursor-not-allowed opacity-40", dark ? "bg-neutral-800 text-neutral-500" : "bg-slate-100 text-slate-400"),
                          )}
                          disabled={!canGenerate}
                          onClick={() => doGenerateSection(section)}
                        >
                          <Sparkles className="size-3.5" />
                          {hasContent ? `Regenerate ${cfg.title}` : `Generate ${cfg.title}`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Sign-off & Lock ───────────────────────────────────────────── */}
            {activeBundle && !generateSections.isPending ? (
              <div className={cn("space-y-4 rounded-md border p-4", cardClass)}>
                <div className="flex flex-wrap gap-4">
                  <label className={cn("inline-flex items-center gap-2 text-sm", labelClass)}>
                    <input type="checkbox" checked={designLeadApproved} disabled={busy} onChange={(event) => setDesignLeadApproved(event.target.checked)} />
                    Design Lead Sign-off (UX Brief)
                  </label>
                  <label className={cn("inline-flex items-center gap-2 text-sm", labelClass)}>
                    <input type="checkbox" checked={techLeadApproved} disabled={busy} onChange={(event) => setTechLeadApproved(event.target.checked)} />
                    Tech Lead Sign-off (Endpoints &amp; Data Model)
                  </label>
                </div>
                <Button
                  className="w-full"
                  disabled={!canSave || busy}
                  onClick={() =>
                    lockDesign.mutate(
                      {
                        story_ids:  activeBundle.story_ids,
                        ux_brief:   activeBundle.ux_brief,
                        endpoints:  activeBundle.endpoints,
                        data_model: activeBundle.data_model,
                      },
                      {
                        onSuccess: (data) => toast.success(`Design locked for ${data.story_ids.length} stories`),
                      },
                    )
                  }
                >
                  {lockDesign.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {lockDesign.isPending ? "Saving…" : "Save & Lock Design"}
                </Button>
                {lockDesign.isPending ? (
                  <div className={cn("space-y-1 rounded-md border px-4 py-3 text-xs", dark ? "border-violet-800/40 bg-violet-950/30 text-violet-300" : "border-violet-200 bg-violet-50 text-violet-700")}>
                    <p className="flex items-center gap-2 font-medium">
                      <Loader2 className="size-3 animate-spin" />
                      Saving design bundle to context files…
                    </p>
                    <p className={dark ? "text-violet-400/70" : "text-violet-500"}>
                      Taiga story transitions will run after the bundle is saved.
                      {activeBundle.story_ids.length > 0 && ` ${activeBundle.story_ids.length} stories to update.`}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {lockDesign.data ? (
              <Callout>
                Design locked for {lockDesign.data.story_ids.length} stories.
                {lockDesign.data.taiga_failures?.length ? ` ${lockDesign.data.taiga_failures.length} Taiga transition(s) failed.` : ""}
              </Callout>
            ) : null}
            {lockDesign.isError ? (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                Save failed: {errMsg(lockDesign.error)}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
