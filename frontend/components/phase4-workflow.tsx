"use client";

import { Fragment, useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Rocket,
  ShieldAlert,
  Sparkles,
  StopCircle,
  XCircle,
} from "lucide-react";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import {
  useClearTestPlan,
  useEligibleStories,
  useFailGate,
  useGenerateBugReport,
  useGenerateEdgeCases,
  useGenerateTestPlan,
  useLoadTestPlan,
  usePassGate,
  useSaveTestPlan,
  useStoryContext,
  useStoryTasks,
  useUpdatePmStoryStatus,
} from "@/lib/hooks/use-phase4";
import { pmTaskWebUrl } from "@/lib/hooks/use-phase3";
import { getTestPlan } from "@/lib/api/phase4";
import { useServerConfig, useLogDecision } from "@/lib/hooks/use-workspace";
import { downloadZip } from "@/lib/utils/zip";
import { usePhase4Store } from "@/lib/stores/phase4-store";
import { useDiffStore } from "@/lib/stores/diff-store";
import { useApiContext } from "@/lib/stores/session-store";
import { SignInRequired } from "@/components/sign-in-required";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, errMsg } from "@/lib/utils";
import type { Phase4StoryPreview } from "@/lib/api/types";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";
import { useGroundingFiles } from "@/lib/hooks/use-grounding-files";

const TEST_PLAN_EMPHASIS: { key: string; labelKey: TranslationKey }[] = [
  { key: "edge_cases", labelKey: "phase4.emphasis.edgeCases" },
  { key: "negative_paths", labelKey: "phase4.emphasis.negativePaths" },
  { key: "security", labelKey: "phase4.emphasis.security" },
  { key: "performance", labelKey: "phase4.emphasis.performance" },
  { key: "data_integrity", labelKey: "phase4.emphasis.dataIntegrity" },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function blobDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function extractSection(md: string, heading: string): string {
  const idx = md.indexOf(heading);
  if (idx === -1) return "";
  const after = md.slice(idx + heading.length);
  const next = after.search(/\n## /);
  return next !== -1 ? after.slice(0, next).trim() : after.trim();
}

function parseScenarioNames(testPlanMd: string): string[] {
  const names: string[] = [];
  for (const m of testPlanMd.matchAll(/^## Scenario:\s*(.+)$/gm)) {
    names.push(m[1].trim());
  }
  // Fallback: parse Gherkin Scenario lines
  if (names.length === 0) {
    for (const m of testPlanMd.matchAll(/Scenario(?:\s+Outline)?:\s*(.+)/g)) {
      names.push(m[1].trim());
    }
  }
  return [...new Set(names)];
}

function extractScenarioSection(testPlanMd: string, scenarioName: string): string {
  const heading = `## Scenario: ${scenarioName}`;
  return extractSection(testPlanMd, heading);
}

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
// Stage A — Story selection
// ---------------------------------------------------------------------------

function StageA({ onSelect }: { onSelect: (id: number) => void }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const ctx = useApiContext();
  const { data, isLoading, error } = useEligibleStories();
  const [activeEpic, setActiveEpic] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const readyStories = (data?.stories ?? []).filter((s) => s.has_bdd);
  const downloadAllMut = useMutation({
    mutationFn: async () => {
      const contents = await Promise.all(
        readyStories.map((s) => getTestPlan(ctx!, s.story_id).then((r) => r.test_plan_md ?? "")),
      );
      return contents.map((content, i) => ({ filename: `test_plan_story_${readyStories[i].story_id}.md`, content }));
    },
    onSuccess: (files) => downloadZip(files, "apex-test-plans.zip"),
    onError: (err: Error) => toast.error(t("phase4.toast.downloadFailed", { err: err.message })),
  });

  const PAGE_SIZE = 4;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loadingStories")}
      </div>
    );
  }
  if (error) return <Callout variant="danger">{t("common.failedLoadStories", { err: errMsg(error) })}</Callout>;

  const stories = data?.stories ?? [];
  if (stories.length === 0) {
    return (
      <Callout>
        {t("phase4.noEligibleStories")}
      </Callout>
    );
  }

  const byEpic = new Map<string, Phase4StoryPreview[]>();
  for (const s of stories) {
    const epic = s.epic_title || "Ungrouped";
    if (!byEpic.has(epic)) byEpic.set(epic, []);
    byEpic.get(epic)!.push(s);
  }
  const epics = [...byEpic.keys()];
  const currentEpic = activeEpic ?? epics[0];
  const epicStories = byEpic.get(currentEpic) ?? [];
  const pageStories = epicStories.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(epicStories.length / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionHeading>{t("phase4.selectStoryTitle")}</SectionHeading>
            <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
              {t("phase4.selectStoryDesc")}
            </p>
          </div>
          {readyStories.length > 0 && (
            <Button
              variant="secondary"
              className="shrink-0 gap-1.5"
              disabled={downloadAllMut.isPending}
              onClick={() => downloadAllMut.mutate()}
            >
              {downloadAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("common.downloadAll")}
            </Button>
          )}
        </div>
      </div>

      {epics.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 shrink-0">
            {t("phase3.epicLabel")}
          </label>
          <select
            value={currentEpic}
            onChange={(e) => { setActiveEpic(e.target.value); setPage(0); }}
            className={cn(
              "appearance-none rounded-lg border px-4 py-2.5 pr-9 text-sm font-medium transition cursor-pointer",
              dark
                ? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-emerald-500 focus:border-emerald-500 focus:outline-none"
                : "border-slate-300 bg-white text-slate-800 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none shadow-sm",
            )}
          >
            {epics.map((epic) => (
              <option key={epic} value={epic}>{epic} ({byEpic.get(epic)!.length})</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {pageStories.map((story) => (
          <button
            key={story.story_id}
            onClick={() => onSelect(story.story_id)}
            className={cn(
              "relative rounded-xl border p-4 text-left transition-all",
              dark
                ? "border-neutral-700 bg-neutral-900 hover:border-violet-500 hover:bg-neutral-800"
                : "border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50",
            )}
          >
            {story.is_regression_bypass && (
              <span className={cn(
                "absolute top-2 right-2 rounded text-xs font-semibold px-1.5 py-0.5",
                dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
              )}>
                {t("phase4.regressionBypassBadge")}
              </span>
            )}
            <div className="flex items-start gap-2 mb-2">
              <span className={cn(
                "rounded text-xs font-mono font-bold px-1.5 py-0.5 shrink-0",
                dark ? "bg-neutral-800 text-violet-400" : "bg-violet-50 text-violet-700",
              )}>
                US#{story.story_id}
              </span>
              {story.has_bdd && (
                <span className={cn(
                  "rounded text-xs px-1.5 py-0.5",
                  dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500",
                )}>
                  {t("phase4.planReadyBadge")}
                </span>
              )}
            </div>
            <p className={cn("font-semibold text-sm leading-tight mb-1", dark ? "text-neutral-100" : "text-slate-800")}>
              {story.title}
            </p>
            <p className={cn("text-xs line-clamp-2", dark ? "text-neutral-500" : "text-slate-400")}>
              {story.gherkin_preview}
            </p>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            {t("phase4.prev")}
          </Button>
          <span className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
            {t("phase4.pageOfSimple", { page: page + 1, count: totalPages })}
          </span>
          <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
            {t("phase4.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage B — Test plan generation
// ---------------------------------------------------------------------------

function StageB({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const linkCtx = useApiContext();
  const pmWebUrl = useServerConfig().data?.pm_web_url;
  const { data: ctx } = useStoryContext(storyId);
  const { tasks: storyTasks } = useStoryTasks(storyId);
  const { data: savedPlan, isLoading: planLoading } = useLoadTestPlan(storyId);

  const testPlanMd = usePhase4Store((s) => s.testPlanMd);
  const setTestPlanMd = usePhase4Store((s) => s.setTestPlanMd);
  const requestDiff = useDiffStore((s) => s.requestDiff);
  const logDecision = useLogDecision();
  const setCurrentStoryMeta = usePhase4Store((s) => s.setCurrentStoryMeta);

  const generateMut = useGenerateTestPlan();
  const saveMut = useSaveTestPlan();
  const clearMut = useClearTestPlan();

  const displayMd = testPlanMd ?? savedPlan?.test_plan_md ?? "";

  const [guidance, setGuidance] = useState("");
  const [emphasis, setEmphasis] = useState<string[]>([]);
  const [showGuidance, setShowGuidance] = useState(false);
  const [testPlanExtraContext, setTestPlanExtraContext] = useState<string[]>([]);
  const availableGroundingFiles = useGroundingFiles();
  const toggleEmphasis = (key: string) =>
    setEmphasis((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  useEffect(() => {
    if (ctx && !testPlanMd && savedPlan?.test_plan_md) {
      setTestPlanMd(savedPlan.test_plan_md);
    }
  }, [ctx, testPlanMd, savedPlan?.test_plan_md, setTestPlanMd]);

  useEffect(() => {
    if (ctx) setCurrentStoryMeta(ctx.title, ctx.epic_title);
  }, [ctx, setCurrentStoryMeta]);

  const handleGenerate = () => {
    const prev = displayMd;
    generateMut.mutate(
      { storyId, instructions: guidance, emphasis, extraContextFiles: testPlanExtraContext },
      {
        onSuccess: (data) => {
          if (prev.trim() && prev !== data.test_plan_md) {
            requestDiff({
              title: t("phase4.diffTitle", { storyId }),
              oldText: prev,
              newText: data.test_plan_md,
              onAccept: () => setTestPlanMd(data.test_plan_md),
              onDiscard: () => logDecision.mutate({
                scope: t("phase4.logDecisionScope", { storyId }),
                summary: t("phase4.logDecisionSummary"),
                reason: t("phase4.logDecisionReason"),
              }),
            });
          } else {
            setTestPlanMd(data.test_plan_md);
          }
        },
      },
    );
  };

  const handleSave = () => {
    if (!displayMd.trim()) return;
    saveMut.mutate(
      { storyId, testPlanMd: displayMd },
      { onSuccess: () => onContinue() },
    );
  };

  return (
    <div className="space-y-5">
      <SectionHeading>{t("phase4.testPlanHeading")}</SectionHeading>

      {ctx && (
        <details open className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
          <summary className={cn("cursor-pointer px-4 py-2.5 font-medium", dark ? "text-neutral-300" : "text-slate-700")}>
            {t("phase4.acceptanceCriteriaGherkin")}
          </summary>
          <pre className={cn("p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono", dark ? "text-neutral-400" : "text-slate-600")}>
            {ctx.gherkin}
          </pre>
        </details>
      )}

      {storyTasks.length > 0 && (
        <div className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
          <div className={cn("px-4 py-2.5 font-medium border-b", dark ? "text-neutral-300 border-neutral-700" : "text-slate-700 border-slate-200")}>
            {t("phase4.implementationTasks")}
          </div>
          <ul className="divide-y divide-inherit">
            {storyTasks.map((task) => {
              // Descriptions arrive pre-decoded from useStoryTasks
              const cleanDesc = task.description.trim();
              const displayDesc = cleanDesc.length > 140 ? `${cleanDesc.slice(0, 137)}…` : cleanDesc;
              const scenarios = task.covered_scenarios ?? [];
              const taskUrl = pmTaskWebUrl(linkCtx, task.pm_task_ref, pmWebUrl);
              return (
                <li key={task.id} className={cn("px-4 py-2.5 flex items-start gap-3", dark ? "divide-neutral-700" : "divide-slate-200")}>
                  <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-semibold", dark ? "bg-neutral-700 text-neutral-300" : "bg-slate-100 text-slate-500")}>
                    {task.effort_estimate || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium leading-snug", dark ? "text-neutral-200" : "text-slate-700")}>{task.subject}</p>
                    {displayDesc ? (
                      <p className={cn("mt-0.5 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{displayDesc}</p>
                    ) : scenarios.length > 0 ? (
                      <p className={cn("mt-0.5 text-xs italic", dark ? "text-neutral-600" : "text-slate-400")}>
                        {t("phase4.covers", { scenarios: scenarios.join(" · ") })}
                      </p>
                    ) : null}
                  </div>
                  {taskUrl ? (
                    <a
                      href={taskUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("phase3.openInPmTool")}
                      aria-label={t("phase4.openTaskAria", { subject: task.subject })}
                      className={cn(
                        "mt-0.5 shrink-0 rounded p-1 transition",
                        dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
                      )}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {generateMut.isPending && (
        <AIProgressIndicator
          steps={[t("phase4.step.analysingGherkin"), t("phase4.step.mappingSteps"), t("phase4.step.writingEdgeCases")]}
          isPending={generateMut.isPending}
          dark={dark}
        />
      )}

      {displayMd && (
        <div className="space-y-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("phase3.editLabel")}</p>
              <Textarea
                value={displayMd}
                onChange={(e) => setTestPlanMd(e.target.value)}
                className="font-mono text-xs h-[34rem] resize-y"
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("common.preview")}</p>
              <MarkdownPreview content={displayMd} dark={dark} className="h-[34rem] resize-y" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="gap-1.5" onClick={() => blobDownload(displayMd, `test-plan-us${storyId}.md`)}>
              <Download className="h-4 w-4" /> {t("phase4.downloadMd")}
            </Button>
            <Button variant="secondary" className="gap-1.5" onClick={() => { void navigator.clipboard.writeText(displayMd); toast.success(t("common.copied")); }}>
              <Copy className="h-4 w-4" /> {t("common.copy")}
            </Button>
            <Button
              variant="secondary"
              className={dark ? "text-red-400 hover:text-red-300" : "text-red-600 hover:text-red-500"}
              disabled={clearMut.isPending || generateMut.isPending}
              onClick={() => clearMut.mutate(storyId)}
            >
              {clearMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase4.clearing")}</>
                : t("phase4.clearPlan")}
            </Button>
          </div>
        </div>
      )}

      {!displayMd && (
        <div className={cn("rounded-lg border", dark ? "border-neutral-700" : "border-slate-200")}>
          <button
            type="button"
            onClick={() => setShowGuidance((v) => !v)}
            aria-expanded={showGuidance}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors",
              dark ? "text-neutral-300 hover:text-neutral-100" : "text-slate-600 hover:text-slate-800",
            )}
          >
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !showGuidance && "-rotate-90")} />
            {t("phase4.guideTheAi")} <span className={cn("font-normal", dark ? "text-neutral-500" : "text-slate-400")}>{t("phase4.optionalParen")}</span>
            {(guidance.trim() || emphasis.length > 0) && !showGuidance ? (
              <span className={cn("ml-auto rounded px-1.5 py-0.5 text-xs", dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700")}>
                {emphasis.length > 0
                  ? t(guidance.trim()
                      ? (emphasis.length === 1 ? "phase4.emphasisNotesOne" : "phase4.emphasisNotesOther")
                      : (emphasis.length === 1 ? "phase4.emphasisOnlyOne" : "phase4.emphasisOnlyOther"), { n: emphasis.length })
                  : t("phase4.notesAdded")}
              </span>
            ) : null}
          </button>
          {showGuidance && (
            <div className={cn("border-t px-4 py-3", dark ? "border-neutral-700" : "border-slate-200")}>
              <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-400")}>
                {t("phase4.emphasisLabel")}
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {TEST_PLAN_EMPHASIS.map((opt) => {
                  const on = emphasis.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleEmphasis(opt.key)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-violet-500 bg-violet-500/15 text-violet-300"
                          : dark
                            ? "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                            : "border-slate-200 text-slate-500 hover:border-slate-300",
                      )}
                    >
                      {t(opt.labelKey)}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                maxLength={2000}
                placeholder={t("phase4.guidancePlaceholder")}
                className="h-28 resize-y text-xs"
              />
              <p className={cn("mt-1 text-[11px]", dark ? "text-neutral-500" : "text-slate-400")}>
                {t("phase4.advisoryOnly", { n: guidance.length })}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={generateMut.isPending || saveMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={generateMut.isPending}
          className="flex-1 justify-center"
        >
          {generateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.generating")}</>
            : (displayMd ? t("phase3.regenerate") : t("phase4.generateTestPlan"))}
        </Button>
        {generateMut.isPending && <CancelButton onCancel={() => generateMut.cancel()} />}
        {displayMd && (
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="flex-1 justify-center"
          >
            {saveMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.saving")}</>
              : t("phase4.saveAndContinue")}
          </Button>
        )}
      </div>
      <AiGroundingNote
        files={AI_GROUNDING.phase4TestPlan}
        dark={dark}
        availableFiles={availableGroundingFiles}
        selectedExtraFiles={testPlanExtraContext}
        onSelectedExtraFilesChange={setTestPlanExtraContext}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage C — Execution tracking
// ---------------------------------------------------------------------------

function StageC({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);
  // Load the saved plan into the store even when the user jumps straight here
  // via the stepper (skipping the Test Plan stage that normally loads it).
  const { isLoading: planLoading } = useLoadTestPlan(storyId);

  const testPlanMd = usePhase4Store((s) => s.testPlanMd);
  const scenarioResults = usePhase4Store((s) => s.scenarioResults);
  const scenarioNotes = usePhase4Store((s) => s.scenarioNotes);
  const isRegressionBypass = usePhase4Store((s) => s.isRegressionBypass);
  const failedScenarioNames = usePhase4Store((s) => s.failedScenarioNames);
  const setScenarioResult = usePhase4Store((s) => s.setScenarioResult);
  const setScenarioNotes = usePhase4Store((s) => s.setScenarioNotes);

  const edgeCasesMut = useGenerateEdgeCases();
  const [edgeCases, setEdgeCases] = useState<Record<string, string>>({});
  const [edgeLoading, setEdgeLoading] = useState<string | null>(null);
  const [edgeExtraContext, setEdgeExtraContext] = useState<string[]>([]);
  const availableGroundingFiles = useGroundingFiles();

  const scenarios = useMemo(() => parseScenarioNames(testPlanMd ?? ""), [testPlanMd]);

  const markedCount = scenarios.filter((n) => scenarioResults[n] && scenarioResults[n] !== "pending").length;
  const failCount = scenarios.filter((n) => scenarioResults[n] === "fail").length;
  const allMarked = markedCount === scenarios.length && scenarios.length > 0;

  if (planLoading && !testPlanMd) {
    return <Callout>{t("phase4.loadingSavedPlan")}</Callout>;
  }

  if (!testPlanMd || scenarios.length === 0) {
    return (
      <Callout>
        {t("phase4.noPlanFound")}
        <Button variant="secondary" onClick={onBack} className="mt-2 text-sm">{t("phase4.backSimple")}</Button>
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading>{t("phase4.executeTests")}</SectionHeading>

      {isRegressionBypass && (
        <Callout variant="warning">
          {t("phase4.regressionBypassWarning")}
        </Callout>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>{t("phase4.scenariosTestedOf", { marked: markedCount, total: scenarios.length })}</span>
          {failCount > 0 && <span className="text-red-500">{t("phase4.failedCount", { n: failCount })}</span>}
        </div>
        <div className={cn("h-1.5 rounded-full overflow-hidden", dark ? "bg-neutral-800" : "bg-slate-200")}>
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${scenarios.length > 0 ? (markedCount / scenarios.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Scenario list */}
      <div className="space-y-3">
        {scenarios.map((name) => {
          const result = scenarioResults[name] ?? "pending";
          const notes = scenarioNotes[name] ?? "";
          const isRegFailed = isRegressionBypass && failedScenarioNames.includes(name);
          const sectionMd = extractScenarioSection(testPlanMd, name);

          return (
            <div
              key={name}
              className={cn(
                "rounded-xl border p-4 space-y-3 transition-all",
                result === "pass"
                  ? dark ? "border-emerald-700/60 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
                  : result === "fail"
                  ? dark ? "border-red-700/60 bg-red-900/10" : "border-red-200 bg-red-50"
                  : isRegFailed
                  ? dark ? "border-amber-700/60 bg-amber-900/10" : "border-amber-200 bg-amber-50"
                  : dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {result === "pass"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : result === "fail"
                    ? <XCircle className="h-4 w-4 text-red-500" />
                    : <div className={cn("h-4 w-4 rounded-full border-2", dark ? "border-neutral-600" : "border-slate-300")} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn("font-medium text-sm", dark ? "text-neutral-100" : "text-slate-800")}>{name}</p>
                    {isRegFailed && (
                      <span className={cn("text-xs rounded px-1.5 py-0.5", dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700")}>
                        {t("phase4.previouslyFailed")}
                      </span>
                    )}
                  </div>
                </div>
                {/* Pass/Fail buttons */}
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setScenarioResult(name, "pass")}
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-semibold transition",
                      result === "pass"
                        ? "bg-emerald-500 text-white"
                        : dark ? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-emerald-400" : "bg-slate-100 text-slate-600 hover:bg-white hover:text-emerald-700",
                    )}
                  >
                    {t("phase4.pass")}
                  </button>
                  <button
                    onClick={() => setScenarioResult(name, "fail")}
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-semibold transition",
                      result === "fail"
                        ? "bg-red-500 text-white"
                        : dark ? "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-red-400" : "bg-slate-100 text-slate-600 hover:bg-white hover:text-red-700",
                    )}
                  >
                    {t("phase4.fail")}
                  </button>
                </div>
              </div>

              {/* Test plan section preview */}
              {sectionMd && (
                <details className={cn("text-xs rounded", dark ? "text-neutral-400" : "text-slate-500")}>
                  <summary className="cursor-pointer font-medium">{t("phase4.viewTestSteps")}</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono">{sectionMd}</pre>
                </details>
              )}

              {/* On-demand edge-case exploration */}
              <div className="text-xs">
                <button
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition disabled:opacity-50",
                    dark ? "text-violet-400 hover:bg-violet-500/15" : "text-violet-600 hover:bg-violet-50",
                  )}
                  disabled={edgeLoading === name}
                  onClick={() => {
                    setEdgeLoading(name);
                    edgeCasesMut.mutate(
                      { storyId, scenarioText: sectionMd || name, extraContextFiles: edgeExtraContext },
                      {
                        onSuccess: (d) => setEdgeCases((prev) => ({ ...prev, [name]: d.edge_cases_md })),
                        onError: (e) => toast.error(errMsg(e)),
                        onSettled: () => setEdgeLoading(null),
                      },
                    );
                  }}
                >
                  {edgeLoading === name
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("phase4.exploring")}</>
                    : <><Sparkles className="h-3 w-3" /> {t("phase4.exploreEdgeCases")}</>}
                </button>
                <AiGroundingNote
                  files={AI_GROUNDING.phase4EdgeCases}
                  dark={dark}
                  className="mt-1"
                  availableFiles={availableGroundingFiles}
                  selectedExtraFiles={edgeExtraContext}
                  onSelectedExtraFilesChange={setEdgeExtraContext}
                />
                {edgeLoading === name && (
                  <button
                    className={cn(
                      "ml-2 inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition",
                      dark ? "text-red-400 hover:bg-red-500/15" : "text-red-600 hover:bg-red-50",
                    )}
                    onClick={() => { edgeCasesMut.cancel(); setEdgeLoading(null); }}
                  >
                    <StopCircle className="h-3 w-3" /> {t("common.cancel")}
                  </button>
                )}
                {!edgeCases[name] && edgeLoading !== name && (
                  <p className={cn("mt-1 leading-4", dark ? "text-neutral-500" : "text-slate-400")}>
                    {t("phase4.edgeCaseHint")}{" "}
                    <b>{t("phase4.fail")}</b> {t("phase4.edgeCaseHintSuffix")}
                  </p>
                )}
                {edgeLoading === name && (
                  <p className={cn("mt-1 leading-4", dark ? "text-neutral-500" : "text-slate-400")}>
                    {t("phase4.generatingEdgeCases")}
                  </p>
                )}
                {edgeCases[name] && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={cn("font-semibold uppercase tracking-wider text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                        {t("phase4.edgeCaseProbesLabel")}
                      </span>
                      <button
                        className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition", dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-100")}
                        onClick={() => { void navigator.clipboard.writeText(edgeCases[name]); toast.success(t("phase4.toast.edgeCasesCopied")); }}
                      >
                        <Copy className="h-3 w-3" /> {t("common.copy")}
                      </button>
                    </div>
                    <pre className={cn("whitespace-pre-wrap rounded-lg border p-2 font-mono", dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700")}>
                      {edgeCases[name]}
                    </pre>
                  </div>
                )}
              </div>

              {/* Notes on fail */}
              {result === "fail" && (
                <Textarea
                  placeholder={t("phase4.failNotesPlaceholder")}
                  value={notes}
                  onChange={(e) => setScenarioNotes(name, e.target.value)}
                  className={cn(
                    "text-xs min-h-[80px] w-full",
                    dark ? "bg-neutral-950 border-neutral-700" : "bg-white border-slate-300",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="gap-1.5" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button
          className="flex-1 justify-center"
          onClick={onContinue}
          disabled={!allMarked}
        >
          {t("phase4.testingGateLink")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {!allMarked && (
        <p className={cn("text-xs text-center", dark ? "text-neutral-500" : "text-slate-400")}>
          {t("phase4.markAllScenarios", { n: scenarios.length })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage D — Testing Gate
// ---------------------------------------------------------------------------

function StageD({ storyId, onBack, onNewStory }: { storyId: number; onBack: () => void; onNewStory: () => void }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const router = useRouter();
  const apiCtx = useApiContext();
  const { data: ctx } = useStoryContext(storyId);

  const testPlanMd = usePhase4Store((s) => s.testPlanMd);
  const scenarioResults = usePhase4Store((s) => s.scenarioResults);
  const scenarioNotes = usePhase4Store((s) => s.scenarioNotes);
  const bugReportDrafts = usePhase4Store((s) => s.bugReportDrafts);
  const setBugReportDraft = usePhase4Store((s) => s.setBugReportDraft);
  const setRegressionBypass = usePhase4Store((s) => s.setRegressionBypass);
  const clearPhase4Draft = usePhase4Store((s) => s.clearPhase4Draft);

  const scenarios = useMemo(() => parseScenarioNames(testPlanMd ?? ""), [testPlanMd]);
  const failedScenarios = scenarios.filter((n) => scenarioResults[n] === "fail");
  const allPassed = failedScenarios.length === 0 && scenarios.length > 0;

  const passGateMut = usePassGate();
  const failGateMut = useFailGate();
  const bugReportMut = useGenerateBugReport();
  const pmStatusMut = useUpdatePmStoryStatus();

  const combinedBugReport = Object.values(bugReportDrafts).join("\n\n---\n\n");

  // Persist the per-scenario verdicts server-side at gate time — they only
  // exist in this browser's draft store until now.
  const gateScenarioResults = scenarios
    .filter((n) => scenarioResults[n] === "pass" || scenarioResults[n] === "fail")
    .map((n) => ({
      scenario: n,
      result: scenarioResults[n] as "pass" | "fail",
      notes: scenarioNotes[n] ?? "",
    }));

  const handlePass = () => {
    if (!window.confirm(t("phase4.confirmPassGate"))) return;
    passGateMut.mutate({ storyId, scenarioResults: gateScenarioResults }, {
      onSuccess: () => {
        setRegressionBypass(false, []);
      },
    });
  };

  const handleFail = () => {
    if (!combinedBugReport.trim()) {
      toast.error(t("phase4.toast.generateBugReportFirst"));
      return;
    }
    const primaryBug = combinedBugReport;
    const rootCause = extractSection(primaryBug, "## Root Cause Hypothesis");
    const patchScope = extractSection(primaryBug, "## Patch Scope");
    failGateMut.mutate(
      {
        story_id: storyId,
        bug_report_md: combinedBugReport,
        root_cause: rootCause,
        // Keep the full patch scope (was hard-capped at 300 chars → truncated the
        // Fix Log mid-sentence). Bound only by the schema limit (5000).
        resolution_summary: `Patch scope: ${patchScope}`.slice(0, 5000),
        scenario_results: gateScenarioResults,
      },
      {
        onSuccess: () => {
          setRegressionBypass(true, failedScenarios);
        },
      },
    );
  };

  const handleGenerateBugReport = () => {
    bugReportMut.mutate(
      {
        storyId,
        failedScenarios: failedScenarios.map((name) => ({
          scenario_name: name,
          qa_notes: scenarioNotes[name] ?? "",
        })),
      },
    );
  };

  if (passGateMut.isSuccess && !failGateMut.isSuccess) {
    return (
      <div className="space-y-5">
        <div className={cn(
          "rounded-xl border px-6 py-8 text-center space-y-3",
          dark ? "border-emerald-700 bg-emerald-900/20" : "border-emerald-200 bg-emerald-50",
        )}>
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h3 className={cn("text-lg font-semibold", dark ? "text-emerald-300" : "text-emerald-800")}>
            {t("phase4.testingGatePassed")}
          </h3>
          <p className={cn("text-sm", dark ? "text-emerald-400" : "text-emerald-700")}>
            {t("phase4.readyForProd", { storyId })}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full justify-center"
            onClick={() => router.push("/phase5")}
          >
            <Rocket className="h-4 w-4" /> {t("phase4.continueToPhase5")}
          </Button>
          {ctx && (
            <>
              <Button
                variant="secondary"
                className="w-full justify-center"
                disabled={pmStatusMut.isPending}
                onClick={() => pmStatusMut.mutate({ pmStoryId: String(storyId) })}
              >
                {pmStatusMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase4.updatingPm")}</>
                  : t("phase4.updatePmStatus")}
              </Button>
              <p className={cn("px-1 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                {t("phase4.pmStatusNote", { pmTool: apiCtx?.pmTool === "jira" ? "Jira" : "Taiga" })}
              </p>
            </>
          )}
          <Button variant="secondary" className="w-full justify-center" onClick={() => { clearPhase4Draft(); onNewStory(); }}>
            {t("phase4.testAnotherStory")}
          </Button>
        </div>
      </div>
    );
  }

  if (failGateMut.isSuccess) {
    return (
      <div className="space-y-5">
        <div className={cn(
          "rounded-xl border px-6 py-6 space-y-3",
          dark ? "border-amber-700 bg-amber-900/20" : "border-amber-200 bg-amber-50",
        )}>
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-amber-500 shrink-0" />
            <h3 className={cn("font-semibold", dark ? "text-amber-300" : "text-amber-800")}>
              {t("phase4.fixBoltTriggered", { storyId })}
            </h3>
          </div>
          <p className={cn("text-sm", dark ? "text-amber-400" : "text-amber-700")}>
            {t("phase4.bugReportSaved")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full justify-center gap-1.5"
            onClick={() => blobDownload(combinedBugReport, `fix-bolt-us${storyId}.md`)}
          >
            <Download className="h-4 w-4" /> {t("phase4.downloadFixBoltArtifact")}
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-center gap-1.5"
            onClick={() => { void navigator.clipboard.writeText(combinedBugReport); toast.success(t("common.copied")); }}
          >
            <Copy className="h-4 w-4" /> {t("phase4.copyFixBoltBrief")}
          </Button>
          <Button className="w-full justify-center" onClick={() => { clearPhase4Draft(); onNewStory(); }}>
            {t("phase4.testAnotherStory")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading>{t("phase4.stage.testingGate")}</SectionHeading>

      {/* Summary */}
      <Callout variant={allPassed ? "success" : "danger"}>
        <div className="flex items-center gap-2">
          {allPassed
            ? <CheckCircle2 className="h-4 w-4" />
            : <XCircle className="h-4 w-4" />}
          <span className="font-semibold text-sm">
            {allPassed ? t("phase4.allScenariosPassed", { n: scenarios.length }) : t("phase4.scenariosFailedOf", { failed: failedScenarios.length, total: scenarios.length })}
          </span>
        </div>
        {!allPassed && (
          <ul className="mt-2 text-xs list-disc list-inside space-y-0.5">
            {failedScenarios.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </Callout>

      {/* Pass path */}
      {allPassed && (
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={passGateMut.isPending}>
            <ChevronLeft className="h-4 w-4" /> {t("common.back")}
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={handlePass}
            disabled={passGateMut.isPending}
          >
            {passGateMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase4.passingGate")}</>
              : t("phase4.passTestingGate")}
          </Button>
        </div>
      )}

      {/* Fail path — Bug Isolation Wizard */}
      {!allPassed && (
        <div className="space-y-4">
          <div>
            <h3 className={cn("font-semibold text-sm mb-1", dark ? "text-neutral-200" : "text-slate-800")}>
              {t("phase4.bugIsolationWizard")}
            </h3>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
              {t("phase4.bugWizardDesc")}
            </p>
          </div>

          {bugReportMut.isPending ? (
            <CancelButton onCancel={() => bugReportMut.cancel()} label={t("phase4.cancelAnalysis")} className="w-full" />
          ) : (
            <Button
              variant="secondary"
              className="w-full justify-center"
              onClick={handleGenerateBugReport}
            >
              {combinedBugReport ? t("phase4.regenerateBugReport") : t("phase4.generateFixBoltArtifact")}
            </Button>
          )}
          <AiGroundingNote files={AI_GROUNDING.phase4FixBolt} dark={dark} />

          {bugReportMut.isPending && (
            <AIProgressIndicator
              steps={[t("phase4.step.analysingFailures"), t("phase4.step.formingHypothesis"), t("phase4.step.writingArtifact")]}
              isPending={bugReportMut.isPending}
              dark={dark}
            />
          )}

          {combinedBugReport && (
            <div className="space-y-2">
              <pre className={cn(
                "rounded-lg border p-3 text-xs whitespace-pre-wrap font-mono max-h-80 overflow-y-auto",
                dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700",
              )}>
                {combinedBugReport}
              </pre>
              <div className="flex gap-2">
                <Button variant="secondary" className="gap-1.5" onClick={() => blobDownload(combinedBugReport, `fix-bolt-us${storyId}.md`)}>
                  <Download className="h-4 w-4" /> {t("phase4.downloadMd")}
                </Button>
                <Button variant="secondary" className="gap-1.5" onClick={() => { void navigator.clipboard.writeText(extractSection(combinedBugReport, "## Fix-Bolt Brief") || combinedBugReport); toast.success(t("common.copied")); }}>
                  <Copy className="h-4 w-4" /> {t("phase4.copyFixBoltBrief")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={failGateMut.isPending}>
              <ChevronLeft className="h-4 w-4" /> {t("common.back")}
            </Button>
            <Button
              className="flex-1 justify-center"
              onClick={handleFail}
              disabled={failGateMut.isPending || !combinedBugReport}
              variant="danger"
            >
              {failGateMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.saving")}</>
                : t("phase4.triggerFixBolt")}
            </Button>
          </div>
          {!combinedBugReport && (
            <p className={cn("text-xs text-center", dark ? "text-neutral-500" : "text-slate-400")}>
              {t("phase4.generateArtifactFirst")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — Phase4Workflow
// ---------------------------------------------------------------------------

type Stage = "A" | "B" | "C" | "D";

const STAGE_LABEL_KEYS: Record<Stage, TranslationKey> = {
  A: "phase4.stage.selectStory",
  B: "phase4.stage.testPlan",
  C: "phase4.stage.execute",
  D: "phase4.stage.testingGate",
};

export function Phase4Workflow() {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const [stage, setStage] = useState<Stage>("A");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const selectedStoryId = usePhase4Store((s) => s.selectedStoryId);
  const currentStoryMeta = usePhase4Store((s) => s.currentStoryMeta);
  const setSelectedStoryId = usePhase4Store((s) => s.setSelectedStoryId);
  const clearPhase4Draft = usePhase4Store((s) => s.clearPhase4Draft);

  const mutedClass = dark ? "text-neutral-400" : "text-slate-600";

  const handleSelect = (id: number) => {
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleNewStory = () => {
    clearPhase4Draft();
    setStage("A");
  };

  const handleStepperGoA = () => {
    if (stage !== "A" && !window.confirm(t("phase4.confirmGoStories"))) return;
    clearPhase4Draft();
    setStage("A");
  };

  const stages: Stage[] = ["A", "B", "C", "D"];
  const stageNums: Record<Stage, number> = { A: 1, B: 2, C: 3, D: 4 };
  const currentIdx = stages.indexOf(stage);

  return (
    <section className="px-8 py-8">
      {/* Phase header */}
      <div className="mb-7">
        <p className={cn("mb-1 text-xs font-bold uppercase tracking-widest", dark ? "text-violet-400" : "text-violet-600")}>{t("common.phaseEyebrow", { n: 4 })}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("phase4.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          {t("phase4.subtitle")}
        </p>
      </div>

      {!context ? <SignInRequired unlocks={t("phase4.signInUnlocks")} /> : null}

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
            <img src="/images/testing.svg" alt={t("phase4.diagramAlt")} className="mx-auto max-w-full" />
          </div>
        )}
      </div>

      {!context && (
        <Callout>{t("phase4.loginHint")}</Callout>
      )}

      <div className={cn("space-y-6 border-t pt-6", dark ? "border-neutral-700" : "border-slate-200")}>
        <div className="space-y-6">

          {/* Stage stepper */}
          <div className={cn("rounded-xl border px-6 py-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
            <div className="flex w-full items-center">
              {stages.map((s, i) => {
                const num = stageNums[s];
                const isActive = stage === s;
                const isDone = i < currentIdx;
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

          {/* Breadcrumb — shown when a story is selected */}
          {selectedStoryId !== null && stage !== "A" && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3",
              dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
            )}>
              <button
                onClick={handleStepperGoA}
                className={cn("shrink-0 text-xs font-medium transition", dark ? "text-neutral-400 hover:text-violet-400" : "text-slate-500 hover:text-violet-600")}
              >
                {t("phase3.backToStories")}
              </button>
              {currentStoryMeta.epicTitle && (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
                  <span className={cn("shrink-0 text-xs font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
                    {currentStoryMeta.epicTitle}
                  </span>
                </>
              )}
              <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
              <span className={cn("shrink-0 inline-flex items-center gap-1.5 text-xs font-mono font-semibold", dark ? "text-violet-400" : "text-violet-700")}>
                US#{selectedStoryId}
              </span>
              <span className={cn("text-sm font-medium truncate", dark ? "text-neutral-300" : "text-slate-700")}>
                {currentStoryMeta.title}
              </span>
            </div>
          )}

          {/* Stage content */}
          <div>
            {stage === "A" && <StageA onSelect={handleSelect} />}
            {stage === "B" && selectedStoryId !== null && (
              <StageB storyId={selectedStoryId} onBack={handleStepperGoA} onContinue={() => setStage("C")} />
            )}
            {stage === "C" && selectedStoryId !== null && (
              <StageC storyId={selectedStoryId} onBack={() => setStage("B")} onContinue={() => setStage("D")} />
            )}
            {stage === "D" && selectedStoryId !== null && (
              <StageD storyId={selectedStoryId} onBack={() => setStage("C")} onNewStory={handleNewStory} />
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
