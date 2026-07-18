"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GitCompare,
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
import { CancelButton } from "@/components/ui/cancel-button";
import {
  DESIGN_SECTION_ORDER,
  useGenerateDiagram,
  useGenerateScreenFlow,
  useGenerateDesignSections,
  useLoadDesignSystem,
  useLockDesign,
  useLockTechStack,
  useDesignBundle,
  useProposeTechStack,
  useRefreshStoryIndex,
  useTechStackStatus,
  useCrossCheckEndpoints,
} from "@/lib/hooks/use-phase2";
import { useAiConfig, useLogDecision } from "@/lib/hooks/use-workspace";
import { CrossCheckPanel, AltModelSelect } from "@/components/cross-check-panel";
import { GuideTheAI } from "@/components/guide-the-ai";
import type { CrossCheckResult } from "@/lib/api/phase1";
import type { AssumptionEntry, DesignSectionKey } from "@/lib/api/types";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { TECH_STACK_PRESETS } from "@/lib/tech-stack-presets";
import { useDiffStore } from "@/lib/stores/diff-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, errMsg } from "@/lib/utils";
import { DesignDeltaPanel } from "@/components/design-delta-panel";
import { DesignSystemPanel } from "@/components/design-system-panel";
import { ERDiagramPanel } from "@/components/er-diagram-panel";
import { ScreenFlowPanel } from "@/components/screen-flow-panel";
import { EndpointTable } from "@/components/endpoint-table";

const PROPOSE_STEP_KEYS = [
  "phase2.propose.step1", "phase2.propose.step2", "phase2.propose.step3", "phase2.propose.step4",
] as const;

const DESIGN_STEP_KEYS: Record<DesignSectionKey, TranslationKey> = {
  ux_brief:   "phase2.step.uxBrief",
  endpoints:  "phase2.step.endpoints",
  data_model: "phase2.step.dataModel",
  runtime:    "phase2.step.runtime",
};

type SectionCfg = {
  stepNum: number;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  dependsOn: DesignSectionKey[];
};

// Step 2 ("Project Design") is organised into two groups rather than one flat
// list: Visual Design (UX Brief + the Visual Design System card below) and
// Technical Design (Endpoints, Data Model, Runtime Contract). Step numbering
// on each card restarts per group so it reads as a sequence within its own
// group instead of a single 1-5 run that would look out of order once the
// groups are visually separated.
const SECTION_CONFIG: Record<DesignSectionKey, SectionCfg> = {
  ux_brief: {
    stepNum:        1,
    titleKey:       "phase2.section.uxBrief.title",
    descriptionKey: "phase2.section.uxBrief.desc",
    dependsOn:      [],
  },
  endpoints: {
    stepNum:        1,
    titleKey:       "phase2.section.endpoints.title",
    descriptionKey: "phase2.section.endpoints.desc",
    dependsOn:      ["ux_brief"],
  },
  data_model: {
    stepNum:        2,
    titleKey:       "phase2.section.dataModel.title",
    descriptionKey: "phase2.section.dataModel.desc",
    dependsOn:      ["endpoints"],
  },
  runtime: {
    stepNum:        3,
    titleKey:       "phase2.section.runtime.title",
    descriptionKey: "phase2.section.runtime.desc",
    dependsOn:      ["endpoints", "data_model"],
  },
};

const VISUAL_DESIGN_SECTIONS: DesignSectionKey[] = ["ux_brief"];
const TECHNICAL_DESIGN_SECTIONS: DesignSectionKey[] = ["endpoints", "data_model", "runtime"];

function downloadDesignBundle(bundle: { ux_brief: string; endpoints: string; data_model: string; runtime: string }, t: ReturnType<typeof useT>) {
  const content = [
    "# Project Design Bundle",
    "",
    `## ${t("phase2.section.uxBrief.title")}`,
    bundle.ux_brief,
    "",
    `## ${t("phase2.section.endpoints.title")}`,
    bundle.endpoints,
    "",
    `## ${t("phase2.section.dataModel.title")}`,
    bundle.data_model,
    "",
    `## ${t("phase2.section.runtime.title")}`,
    bundle.runtime,
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

const STEP_LABEL_KEYS = ["phase2.step.techStack", "phase2.step.visualDesign", "phase2.step.technicalDesign"] as const;

export function Phase2Workflow() {
  const t = useT();
  const dark = useUiStore((state) => state.theme) === "dark";
  const router = useRouter();
  const context = useApiContext();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stackHint, setStackHint] = useState("");
  const [stackReopened, setStackReopened] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [partial, setPartial] = useState<Partial<Record<DesignSectionKey, string>>>({});
  const [partialStoryIds, setPartialStoryIds] = useState<number[]>([]);
  const [sectionAssumptions, setSectionAssumptions] = useState<Partial<Record<DesignSectionKey, AssumptionEntry[]>>>({});
  const {
    alternatives,
    selectedAlternativeIndex,
    techStackDraft,
    designBundle,
    setAlternatives,
    setSelectedAlternativeIndex,
    setTechStackDraft,
    setDesignBundle,
  } = usePhase2Store();
  const requestDiff = useDiffStore((s) => s.requestDiff);
  const logDecision = useLogDecision();
  const crossCheckEndpointsMut = useCrossCheckEndpoints();
  const [endpointsCross, setEndpointsCross] = useState<CrossCheckResult | null>(null);
  const [altModel, setAltModel] = useState("");
  const [designGuidance, setDesignGuidance] = useState("");
  const aiConfig = useAiConfig();
  const crossEnabled = (aiConfig.data?.configured_providers?.length ?? 0) >= 2;

  const bundleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designBundleRef = useRef(designBundle);
  designBundleRef.current = designBundle;

  const techStack = useTechStackStatus();
  const serverDesign = useDesignBundle();
  const proposeStack = useProposeTechStack();
  const lockStack = useLockTechStack();
  const generateSections = useGenerateDesignSections();
  const designSystemQuery = useLoadDesignSystem();
  const generateDiagramMut = useGenerateDiagram();
  const generateScreenFlowMut = useGenerateScreenFlow();
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

  // Re-hydrate from the server's locked design-bundle.md when there is no
  // browser-local draft (different browser / cleared storage / another device).
  useEffect(() => {
    const d = serverDesign.data;
    if (
      d &&
      !designBundleRef.current &&
      (d.ux_brief.trim() || d.endpoints.trim() || d.data_model.trim())
    ) {
      setDesignBundle({
        ux_brief: d.ux_brief,
        endpoints: d.endpoints,
        data_model: d.data_model,
        runtime: d.runtime_spec,
        story_ids: [],
      });
    }
  }, [serverDesign.data, setDesignBundle]);

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
        runtime:    partial.runtime    ?? designBundle?.runtime    ?? "",
        story_ids:  partialStoryIds.length ? partialStoryIds : (designBundle?.story_ids ?? []),
      }
    : designBundle;

  const allSectionsPopulated = Boolean(
    activeBundle?.ux_brief && activeBundle?.endpoints && activeBundle?.data_model && activeBundle?.runtime,
  );
  const canSave = Boolean(activeBundle && !generateSections.isPending && allSectionsPopulated);

  const activeStepIdx = generateSections.currentSection
    ? DESIGN_SECTION_ORDER.indexOf(generateSections.currentSection)
    : undefined;

  const maxUnlockedStep: 1 | 2 | 3 = stackDefined ? 3 : 1;

  function clearDesign() {
    setDesignBundle(null);
    setPartial({});
    toast.info(t("phase2.toast.designCleared"));
  }

  function reopenStack() {
    setStackReopened(true);
    setTechStackDraft(techStack.data?.tech_stack ?? "");
    setStep(1);
  }

  function doGenerate() {
    const accumulated: Partial<Record<DesignSectionKey, string>> = {};
    let accStoryIds: number[] = [];
    setPartial({});
    setSectionAssumptions({});
    generateSections.generate({
      onSection: (section, content, storyIds, assumptions) => {
        accumulated[section] = content;
        // Runtime Contract generates over ALL stories regardless of phase_status
        // (it's project-wide infra, meaningful after implementation started —
        // see Phase2Service._all_stories_for_runtime), while the design lock
        // itself must only ever cover the narrower design-eligible set. Never
        // let its broader story list become "the stories this lock covers".
        if (section !== "runtime") {
          accStoryIds = storyIds;
          setPartialStoryIds(storyIds);
        }
        setPartial({ ...accumulated });
        setSectionAssumptions((prev) => ({ ...prev, [section]: assumptions }));
        if (section === "data_model" && content.trim()) {
          generateDiagramMut.mutate(content);
        }
        if (section === "ux_brief" && content.trim()) {
          generateScreenFlowMut.mutate(content);
        }
      },
      onDone: () => {
        setDesignBundle({
          ux_brief:   accumulated.ux_brief   ?? "",
          endpoints:  accumulated.endpoints  ?? "",
          data_model: accumulated.data_model ?? "",
          runtime:    accumulated.runtime    ?? "",
          story_ids:  accStoryIds,
        });
        setPartial({});
        toast.success(t("phase2.toast.designGenerated"));
      },
    }, designGuidance);
  }

  function doGenerateSection(targetSection: DesignSectionKey) {
    const existingBundle = designBundle;
    setPartial({});
    setPartialStoryIds([]);
    setSectionAssumptions((prev) => ({ ...prev, [targetSection]: undefined }));

    const idx = DESIGN_SECTION_ORDER.indexOf(targetSection);
    const downstreamHasContent = DESIGN_SECTION_ORDER.slice(idx + 1).some((s) => existingBundle?.[s as DesignSectionKey]);
    if (downstreamHasContent) {
      toast.warning(
        t("phase2.toast.regenerateWarning", { title: t(SECTION_CONFIG[targetSection].titleKey) }),
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
      onSection: (section, content, storyIds, assumptions) => {
        latestContent = content;
        setPartial({ [section]: content });
        // See doGenerate's onSection: Runtime Contract's broader story list
        // must never become the design lock's story_ids.
        if (section !== "runtime") {
          latestStoryIds = storyIds;
          setPartialStoryIds(storyIds);
        }
        setSectionAssumptions((prev) => ({ ...prev, [section]: assumptions }));
      },
      onDone: () => {
        const commit = () => {
          setDesignBundle({
            ux_brief:   existingBundle?.ux_brief   ?? "",
            endpoints:  existingBundle?.endpoints  ?? "",
            data_model: existingBundle?.data_model ?? "",
            runtime:    existingBundle?.runtime    ?? "",
            story_ids:  targetSection === "runtime"
              ? (existingBundle?.story_ids ?? [])
              : (latestStoryIds.length ? latestStoryIds : (existingBundle?.story_ids ?? [])),
            [targetSection]: latestContent,
          });
          setPartial({});
          toast.success(t("phase2.toast.sectionGenerated", { title: t(SECTION_CONFIG[targetSection].titleKey) }));
          if (targetSection === "data_model" && latestContent.trim()) {
            generateDiagramMut.mutate(latestContent);
          }
          if (targetSection === "ux_brief" && latestContent.trim()) {
            generateScreenFlowMut.mutate(latestContent);
          }
        };
        // Regenerate over an existing section → show the diff before replacing.
        const priorContent = existingBundle?.[targetSection] ?? "";
        if (priorContent.trim() && priorContent !== latestContent) {
          const sectionTitle = t(SECTION_CONFIG[targetSection].titleKey);
          requestDiff({
            title: t("phase2.diffTitle", { title: sectionTitle }),
            oldText: priorContent,
            newText: latestContent,
            onAccept: commit,
            onDiscard: () => {
              setPartial({});
              logDecision.mutate({
                scope: t("phase2.logDecisionScope", { title: sectionTitle }),
                summary: t("phase2.logDecisionSummary", { title: sectionTitle }),
                reason: t("phase2.logDecisionReason"),
              });
            },
          });
        } else {
          commit();
        }
      },
    }, designGuidance);
  }

  const sectionBorderClass = dark ? "border-neutral-700" : "border-slate-200";
  const labelClass = dark ? "text-neutral-200" : "text-slate-700";
  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";
  const cardClass = dark ? "border-neutral-800 bg-[#1f1f21]" : "border-slate-200 bg-slate-50";
  const outlineButtonClass = dark
    ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
    : "border-slate-300 text-slate-600 hover:bg-slate-100";

  function renderSectionCard(section: DesignSectionKey) {
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
        <div className={cn("flex items-center justify-between px-4 py-3", dark ? "bg-neutral-900" : "bg-slate-50")}>
          <div className="flex items-center gap-3">
            <span className={cn(
              "inline-flex h-5 items-center justify-center rounded px-2 text-xs font-bold",
              dark ? "bg-violet-900/60 text-violet-300" : "bg-violet-100 text-violet-700",
            )}>
              {t("common.stepLabel", { n: cfg.stepNum })}
            </span>
            <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>
              {t(cfg.titleKey)}
            </span>
          </div>
          {isThisGenerating ? (
            <span className="animate-pulse text-xs text-violet-400">{t("common.generating")}</span>
          ) : hasContent ? (
            <span className={cn("flex items-center gap-1 text-xs", dark ? "text-emerald-400" : "text-emerald-600")}>
              <CheckCircle2 className="size-3" /> {t("common.generated")}
            </span>
          ) : (
            <span className={cn("text-xs", mutedClass)}>{t("common.notGenerated")}</span>
          )}
        </div>

        <div className={cn("border-t px-4 py-2 text-xs", dark ? "border-neutral-800 text-neutral-500" : "border-slate-100 text-slate-500")}>
          {t(cfg.descriptionKey)}
        </div>

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
              ? t("phase2.generateFirst", { deps: cfg.dependsOn.map((d) => t(SECTION_CONFIG[d].titleKey)).join(` ${t("common.and")} `) })
              : t("phase2.notGeneratedYet")}
          </div>
        )}

        {(section === "ux_brief" || section === "endpoints" || section === "data_model") && (
          <div className={cn("border-t px-4 py-3", dark ? "border-neutral-800" : "border-slate-100")}>
            {section === "ux_brief" && (
              <ScreenFlowPanel uxBriefContent={content} dark={dark} />
            )}
            {section === "endpoints" && (
              <EndpointTable endpointsContent={content} dark={dark} />
            )}
            {section === "endpoints" && hasContent && crossEnabled && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <AltModelSelect aiConfig={aiConfig.data} value={altModel} onChange={setAltModel} dark={dark} disabled={crossCheckEndpointsMut.isPending} />
                  <button
                    className={cn("flex flex-1 items-center justify-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors", outlineButtonClass)}
                    disabled={crossCheckEndpointsMut.isPending}
                    onClick={() =>
                      crossCheckEndpointsMut.mutate({ uxBrief: activeBundle?.ux_brief ?? "", altModel }, {
                        onSuccess: (r) => {
                          setEndpointsCross(r);
                          toast.success(
                            r.only_alt.length
                              ? t(r.only_alt.length === 1 ? "phase2.toast.crossCheckEndpointsFoundOne" : "phase2.toast.crossCheckEndpointsFoundOther", { altLabel: r.alt_label, n: r.only_alt.length })
                              : t("phase2.toast.crossCheckEndpointsAgreed", { altLabel: r.alt_label }),
                          );
                        },
                      })
                    }
                  >
                    <GitCompare className="size-3.5" /> {crossCheckEndpointsMut.isPending ? t("phase1.crossChecking") : t("phase2.crossCheckEndpoints")}
                  </button>
                </div>
                {crossCheckEndpointsMut.isPending && <CancelButton onCancel={() => crossCheckEndpointsMut.cancel()} className="w-full" />}
                {endpointsCross ? (
                  <CrossCheckPanel
                    result={endpointsCross}
                    dark={dark}
                    noun="endpoint"
                    onDismiss={() => setEndpointsCross(null)}
                    onAdd={(s) => {
                      if (!designBundle) return;
                      setDesignBundle({ ...designBundle, endpoints: `${(designBundle.endpoints ?? "").trimEnd()}\n- \`${s.title}\`` });
                      toast.success(t("phase2.toast.endpointAdded"));
                    }}
                  />
                ) : null}
              </div>
            )}
            {section === "data_model" && (
              <ERDiagramPanel dataModelContent={content} dark={dark} />
            )}
          </div>
        )}

        {hasContent && (sectionAssumptions[section]?.length ?? 0) > 0 && (
          <div
            className={cn(
              "space-y-1 border-t px-4 py-2.5 text-xs",
              dark ? "border-neutral-800 bg-amber-500/10 text-amber-300" : "border-slate-100 bg-amber-50 text-amber-700",
            )}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="size-3.5" />
              {t("phase2.assumptionsWarning")}
            </p>
            <ul className="list-disc pl-5">
              {sectionAssumptions[section]!.map((a) => (
                <li key={a.id}>
	                  <span className="font-mono text-xs">{a.id}</span>: {a.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={cn("border-t px-4 py-3", dark ? "border-neutral-800" : "border-slate-100")}>
          {isThisGenerating ? (
            <button
              className={cn("flex w-full items-center justify-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors", outlineButtonClass)}
              onClick={() => generateSections.cancel()}
            >
              <StopCircle className="size-3.5 text-red-400" />
              {t("common.cancel")}
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
              {t(hasContent ? "phase2.regenerateSection" : "phase2.generateSection", { title: t(cfg.titleKey) })}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="px-8 py-8">
      <div className="mb-7">
        <p className={cn("mb-1 text-xs font-bold uppercase tracking-widest", dark ? "text-violet-400" : "text-violet-600")}>{t("common.phaseEyebrow", { n: 2 })}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("phase2.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          {t("phase2.subtitle")}
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
          <span>{t("common.viewProcessDiagram")}</span>
        </button>
        {diagramOpen ? (
          <div className={cn("border-t p-4", dark ? "border-neutral-800" : "border-slate-200")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/design.svg" alt={t("phase2.diagramAlt")} className="mx-auto max-w-full" />
          </div>
        ) : null}
      </div>

      {/* Post-lock stories → additive design delta, no full regeneration.
          Lives here, not tied to either stepper step — it applies regardless
          of which step is active. */}
      <div className="mb-6">
        <DesignDeltaPanel dark={dark} />
      </div>

      {noContext ? (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">{t("common.signInRequired")}</p>
            <p className="mt-0.5 text-xs text-amber-300">{t("phase2.signInBody")}</p>
          </div>
        </div>
      ) : null}

      <div className={cn("space-y-6 border-t pt-6", sectionBorderClass)}>
        {/* Stepper */}
        <div className={cn("rounded-xl border px-6 py-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <div className="flex w-full items-center">
            {STEP_LABEL_KEYS.map((labelKey, i) => {
              const label = t(labelKey);
              const stepNum = (i + 1) as 1 | 2 | 3;
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

        {/* ── Step 1: Technology Choices ────────────────────────────────── */}
        {step === 1 && (
          <section className="space-y-4">
            <SectionHeading>{t("phase2.stageA")}</SectionHeading>
            <p className={cn("text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
              {t("phase2.stackExample")}
            </p>
            {stackDefined ? (
              <div className="flex items-start justify-between gap-4">
                <Callout>{t("phase2.stackLocked")}</Callout>
                <button
                  className={cn("flex shrink-0 items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                  title={t("phase2.reopenTitle")}
                  onClick={reopenStack}
                >
                  <Unlock className="size-3" />
                  {t("phase2.reopen")}
                </button>
              </div>
            ) : (
              <Callout>{t("phase2.stackUnlockedHint")}</Callout>
            )}
            <label className={cn("block text-sm font-medium", labelClass)}>
              {t("phase2.notesLabel")} <span className={mutedClass}>{t("common.optional")}</span>
              <Input value={stackHint} onChange={(event) => setStackHint(event.target.value)} placeholder={t("phase2.notesPlaceholder")} />
            </label>
            {!stackDefined ? (
              <>
                <label className={cn("block text-sm font-medium", labelClass)}>
                  {t("phase2.presetLabel")} <span className={mutedClass}>{t("phase2.presetHint")}</span>
                  <select
                    aria-label={t("phase2.techStackPresetAria")}
                    defaultValue=""
                    disabled={busy || noContext}
                    onChange={(event) => {
                      const preset = TECH_STACK_PRESETS.find((p) => p.label === event.target.value);
                      if (preset) {
                        setTechStackDraft(preset.body);
                        setSelectedAlternativeIndex(-1);
                        toast.success(t("phase2.toast.presetSeeded", { label: preset.label }));
                      }
                      event.target.value = "";
                    }}
                    className={cn(
                      "mt-1 w-full rounded-md border px-3 py-2 text-sm",
                      dark ? "border-neutral-800 bg-[#1f1f21] text-neutral-200" : "border-slate-200 bg-white text-slate-900",
                    )}
                  >
                    <option value="" disabled>{t("phase2.presetPick")}</option>
                    {TECH_STACK_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>{p.label}</option>
                    ))}
                  </select>
                </label>
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
                          toast.success(t("phase2.toast.alternativesProposed"));
                        },
                      },
                    )
                  }
                >
                  <Sparkles className="size-4" />
                  {t("phase2.proposeArchitecture")}
                </Button>
              </>
            ) : null}
            <AIProgressIndicator steps={PROPOSE_STEP_KEYS.map((k) => t(k))} isPending={proposeStack.isPending} dark={dark} />
            {proposeStack.isPending && <CancelButton onCancel={() => proposeStack.cancel()} className="w-full" />}
            {proposeStack.isError ? (
              <Callout variant="danger">{t("phase2.proposalFailed", { err: errMsg(proposeStack.error) })}</Callout>
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
                      {t("phase2.option", { n: index + 1, name: alt.name })}
                    </div>
                    <p className={cn("mb-3 text-sm leading-6", dark ? "text-neutral-400" : "text-slate-600")}>{alt.description}</p>
                    <pre className={cn("whitespace-pre-wrap text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{alt.trade_offs}</pre>
                  </button>
                ))}
              </div>
            ) : null}

            <label className={cn("block text-sm font-medium", labelClass)}>
              {t("phase2.techStackDraftLabel")}
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
                      setStep(2);
                      toast.success(t("phase2.toast.techStackSaved"));
                    },
                  },
                );
              }}
            >
              <Save className="size-4" />
              {t("phase2.saveTechStack")}
            </Button>
            {lockStack.isError ? (
              <Callout variant="danger">{t("phase2.lockFailed", { err: errMsg(lockStack.error) })}</Callout>
            ) : null}
          </section>
        )}

        {/* ── Step 2: Visual Design ─────────────────────────────────────── */}
        {step === 2 && (
          <section className="space-y-5">
            <SectionHeading>{t("phase2.stageB.visual")}</SectionHeading>
            <p className={cn("text-sm", mutedClass)}>
              {t("phase2.visualDesignDesc")}
            </p>
            <div className={cn("flex items-start gap-3 rounded-md border px-4 py-3 text-sm", dark ? "border-amber-600/30 bg-amber-500/8" : "border-amber-400/50 bg-amber-50")}>
              <Info className={cn("mt-0.5 size-4 shrink-0", dark ? "text-amber-400" : "text-amber-600")} />
              <p className={dark ? "text-amber-300/90" : "text-amber-700"}>
                <span className="font-semibold">{t("phase2.aiDraftsWarningTitle")}</span> {t("phase2.aiDraftsWarningBody")}
              </p>
            </div>

            <div className="space-y-2">
              <GuideTheAI
                value={designGuidance}
                onChange={setDesignGuidance}
                dark={dark}
                disabled={generateSections.isPending}
                placeholder={t("phase2.guideThePlaceholder")}
              />
              {generateSections.isPending ? (
                <button
                  className={cn("flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                  onClick={() => generateSections.cancel()}
                >
                  <StopCircle className="size-4 text-red-400" />
                  {t("phase2.cancelGeneration")}
                </button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" className="gap-1.5" onClick={() => setStep(1)} disabled={busy}>
                    <ChevronLeft className="size-4" /> {t("common.back")}
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={busy || noContext}
                    onClick={() => {
                      if (designBundle) {
                        toast.warning(t("phase2.toast.designExistsWarning"), {
                          action: { label: t("phase2.regenerateAll"), onClick: doGenerate },
                          duration: 8000,
                        });
                      } else {
                        doGenerate();
                      }
                    }}
                  >
                    <Sparkles className="size-4" />
                    {t("phase2.generateDesign")}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors disabled:opacity-40", outlineButtonClass)}
                  disabled={busy}
                  title={t("phase2.refreshIndexTitle")}
                  onClick={() =>
                    refreshIndex.mutate(undefined, {
                      onSuccess: () => toast.success(t("phase2.toast.indexRefreshed")),
                    })
                  }
                >
                  <RefreshCw className="size-3" />
                  {t("phase2.refreshIndex")}
                </button>
                {activeBundle && !generateSections.isPending ? (
                  <>
                    <button
                      className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                      title={t("phase2.exportTitle")}
                      onClick={() => downloadDesignBundle(activeBundle, t)}
                    >
                      <Download className="size-3" />
                      {t("phase2.export")}
                    </button>
                    <button
                      className={cn("flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors", outlineButtonClass)}
                      title={t("phase2.clearTitle")}
                      onClick={clearDesign}
                    >
                      <RotateCcw className="size-3" />
                      {t("phase2.clear")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <AIProgressIndicator
              steps={DESIGN_SECTION_ORDER.map((s) => t(DESIGN_STEP_KEYS[s]))}
              isPending={generateSections.isPending}
              dark={dark}
              activeStep={activeStepIdx}
            />
            {generateSections.error ? (
              <Callout variant="danger">{t("phase2.generationFailed", { err: generateSections.error })}</Callout>
            ) : null}

            {/* Visual Design — UX Brief + the derived Visual Design System */}
            <div className="space-y-4">
              {VISUAL_DESIGN_SECTIONS.map((section) => renderSectionCard(section))}

              <div className={cn("overflow-hidden rounded-md border", dark ? "border-neutral-800" : "border-slate-200")}>
                <div className={cn("flex items-center justify-between px-4 py-3", dark ? "bg-neutral-900" : "bg-slate-50")}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "inline-flex h-5 items-center justify-center rounded px-2 text-xs font-bold",
                      dark ? "bg-violet-900/60 text-violet-300" : "bg-violet-100 text-violet-700",
                    )}>
                      {t("common.stepLabel", { n: 2 })}
                    </span>
                    <span className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>
                      {t("phase2.visualDesignSystem")}
                    </span>
                  </div>
                  {designSystemQuery.data ? (
                    <span className={cn("flex items-center gap-1 text-xs", dark ? "text-emerald-400" : "text-emerald-600")}>
                      <CheckCircle2 className="size-3" /> {t("common.generated")}
                    </span>
                  ) : (
                    <span className={cn("text-xs", mutedClass)}>{t("common.notGenerated")}</span>
                  )}
                </div>
                <div className={cn("border-t px-4 py-2 text-xs", dark ? "border-neutral-800 text-neutral-500" : "border-slate-100 text-slate-500")}>
                  {t("phase2.visualDesignSystemDesc")}
                </div>
                <div className={cn("border-t px-4 py-3", dark ? "border-neutral-800" : "border-slate-100")}>
                  <DesignSystemPanel uxBriefContent={activeBundle?.ux_brief ?? ""} dark={dark} standalone guidance={designGuidance} />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="gap-1.5" onClick={() => setStep(1)} disabled={busy}>
                <ChevronLeft className="size-4" /> {t("common.back")}
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)} disabled={busy}>
                {t("phase2.continueToTechnical")} <ChevronRight className="size-4" />
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 3: Technical Design ──────────────────────────────────── */}
        {step === 3 && (
          <section className="space-y-5">
            <SectionHeading>{t("phase2.stageB.technical")}</SectionHeading>
            <p className={cn("text-sm", mutedClass)}>
              {t("phase2.technicalDesignDesc")}
            </p>
            <Button variant="secondary" className="gap-1.5" onClick={() => setStep(2)} disabled={busy}>
              <ChevronLeft className="size-4" /> {t("phase2.backToVisual")}
            </Button>

            <div className="space-y-4">
              {TECHNICAL_DESIGN_SECTIONS.map((section) => renderSectionCard(section))}
            </div>

            {/* Save & Lock — the last thing on the step, saves everything above */}
            <div className={cn("space-y-4 rounded-md border p-4", cardClass)}>
              {!activeBundle ? (
                <Callout>{t("phase2.generateSectionsFirst")}</Callout>
              ) : (
                <>
                  <Button
                    className="w-full"
                    disabled={!canSave || busy}
                    onClick={() =>
                      lockDesign.mutate(
                        {
                          story_ids:    activeBundle.story_ids,
                          ux_brief:     activeBundle.ux_brief,
                          endpoints:    activeBundle.endpoints,
                          data_model:   activeBundle.data_model,
                          runtime_spec: activeBundle.runtime,
                        },
                        {
                          onSuccess: (data) => toast.success(t("phase2.toast.designLocked", { n: data.story_ids.length })),
                        },
                      )
                    }
                  >
                    {lockDesign.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {lockDesign.isPending ? t("phase2.saving") : t("phase2.saveAndLock")}
                  </Button>
                  {!canSave && !busy ? (
                    <p className={cn("text-xs", mutedClass)}>
                      {t("phase2.generateEverySection")}
                    </p>
                  ) : null}
                  {lockDesign.isPending ? (
                    <div className={cn("space-y-1 rounded-md border px-4 py-3 text-xs", dark ? "border-violet-800/40 bg-violet-950/30 text-violet-300" : "border-violet-200 bg-violet-50 text-violet-700")}>
                      <p className="flex items-center gap-2 font-medium">
                        <Loader2 className="size-3 animate-spin" />
                        {t("phase2.savingBundle")}
                      </p>
                      <p className={dark ? "text-violet-400/70" : "text-violet-500"}>
                        {t("phase2.pmTransitionsNote")}
                        {activeBundle.story_ids.length > 0 && t("phase2.storiesToUpdate", { n: activeBundle.story_ids.length })}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
              {lockDesign.data ? (
                <>
                  <Callout variant="success">
                    {t("phase2.designLockedFor", { n: lockDesign.data.story_ids.length })}
                    {lockDesign.data.taiga_failures?.length ? t("phase2.taigaFailures", { n: lockDesign.data.taiga_failures.length }) : ""}
                  </Callout>
                  <Button className="w-full" onClick={() => router.push("/phase3")}>
                    {t("phase2.continueToPhase3")} <ChevronRight className="size-4" />
                  </Button>
                </>
              ) : null}
              {lockDesign.isError ? (
                <Callout variant="danger">{t("phase2.saveFailed", { err: errMsg(lockDesign.error) })}</Callout>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
