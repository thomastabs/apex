"use client";

import { Fragment, useState, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  useEligibleStories,
  useFailGate,
  useGenerateBugReport,
  useGenerateTestPlan,
  useLoadTestPlan,
  usePassGate,
  useSaveTestPlan,
  useStoryContext,
  useUpdatePmStoryStatus,
} from "@/lib/hooks/use-phase4";
import { decodeApexMeta } from "@/lib/hooks/use-phase3";
import { usePhase4Store } from "@/lib/stores/phase4-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import type { Phase4StoryPreview } from "@/lib/api/types";

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
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data, isLoading, error } = useEligibleStories();
  const [activeEpic, setActiveEpic] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 4;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stories…
      </div>
    );
  }
  if (error) return <Callout>Failed to load stories: {errMsg(error)}</Callout>;

  const stories = data?.stories ?? [];
  if (stories.length === 0) {
    return (
      <Callout>
        No implementation-locked stories found. Complete Phase 3 for at least one story first.
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
        <SectionHeading>Select a story to test</SectionHeading>
        <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
          Choose an implementation-locked user story to generate a QA test plan for.
        </p>
      </div>

      {epics.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 shrink-0">
            Epic
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
              <option key={epic} value={epic}>{epic}</option>
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
                ? "border-neutral-700 bg-neutral-900 hover:border-emerald-500 hover:bg-neutral-800"
                : "border-slate-200 bg-white hover:border-emerald-400 hover:shadow-md shadow-sm",
            )}
          >
            {story.is_regression_bypass && (
              <span className={cn(
                "absolute top-2 right-2 rounded text-xs font-semibold px-1.5 py-0.5",
                dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
              )}>
                Regression Bypass
              </span>
            )}
            <div className="flex items-start gap-2 mb-2">
              <span className={cn(
                "rounded text-xs font-mono font-bold px-1.5 py-0.5 shrink-0",
                dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700",
              )}>
                US#{story.story_id}
              </span>
              {story.has_bdd && (
                <span className={cn(
                  "rounded text-xs px-1.5 py-0.5",
                  dark ? "bg-sky-900/40 text-sky-400" : "bg-sky-100 text-sky-700",
                )}>
                  Plan ready
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
            ‹ Prev
          </Button>
          <span className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
            {page + 1} / {totalPages}
          </span>
          <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
            Next ›
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
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);
  const { data: savedPlan, isLoading: planLoading } = useLoadTestPlan(storyId);

  const testPlanMd = usePhase4Store((s) => s.testPlanMd);
  const setTestPlanMd = usePhase4Store((s) => s.setTestPlanMd);
  const setCurrentStoryMeta = usePhase4Store((s) => s.setCurrentStoryMeta);

  const generateMut = useGenerateTestPlan();
  const saveMut = useSaveTestPlan();

  const displayMd = testPlanMd ?? savedPlan?.test_plan_md ?? "";

  useEffect(() => {
    if (ctx && !testPlanMd && savedPlan?.test_plan_md) {
      setTestPlanMd(savedPlan.test_plan_md);
    }
  }, [ctx, testPlanMd, savedPlan?.test_plan_md, setTestPlanMd]);

  useEffect(() => {
    if (ctx) setCurrentStoryMeta(ctx.title, ctx.epic_title);
  }, [ctx, setCurrentStoryMeta]);

  const handleGenerate = () => {
    generateMut.mutate(storyId);
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
      <SectionHeading>Test Plan</SectionHeading>

      {ctx && (
        <details open className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
          <summary className={cn("cursor-pointer px-4 py-2.5 font-medium", dark ? "text-neutral-300" : "text-slate-700")}>
            Acceptance Criteria (Gherkin)
          </summary>
          <pre className={cn("p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono", dark ? "text-neutral-400" : "text-slate-600")}>
            {ctx.gherkin}
          </pre>
        </details>
      )}

      {ctx && (ctx.task_list ?? []).length > 0 && (
        <div className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
          <div className={cn("px-4 py-2.5 font-medium border-b", dark ? "text-neutral-300 border-neutral-700" : "text-slate-700 border-slate-200")}>
            Implementation Tasks
          </div>
          <ul className="divide-y divide-inherit">
            {(ctx.task_list ?? []).map((task) => {
              // Strip any residual apex meta block — description may be encoded
              const cleanDesc = decodeApexMeta(task.description ?? "").description.trim();
              const displayDesc = cleanDesc.length > 140 ? `${cleanDesc.slice(0, 137)}…` : cleanDesc;
              const scenarios = task.covered_scenarios ?? [];
              return (
                <li key={task.id} className={cn("px-4 py-2.5 flex items-start gap-3", dark ? "divide-neutral-700" : "divide-slate-200")}>
                  <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-semibold", dark ? "bg-neutral-700 text-neutral-300" : "bg-slate-100 text-slate-500")}>
                    {task.effort_estimate || "?"}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("font-medium leading-snug", dark ? "text-neutral-200" : "text-slate-700")}>{task.subject}</p>
                    {displayDesc ? (
                      <p className={cn("mt-0.5 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{displayDesc}</p>
                    ) : scenarios.length > 0 ? (
                      <p className={cn("mt-0.5 text-xs italic", dark ? "text-neutral-600" : "text-slate-400")}>
                        Covers: {scenarios.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {generateMut.isPending && (
        <AIProgressIndicator
          steps={["Analysing Gherkin…", "Mapping test steps…", "Writing edge cases…"]}
          isPending={generateMut.isPending}
          dark={dark}
        />
      )}

      {displayMd && (
        <div className="space-y-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Edit</p>
              <Textarea
                value={displayMd}
                onChange={(e) => setTestPlanMd(e.target.value)}
                rows={28}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Preview</p>
              <MarkdownPreview content={displayMd} dark={dark} className="max-h-[28rem]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => blobDownload(displayMd, `test-plan-us${storyId}.md`)}>
              Download .md
            </Button>
            <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(displayMd); toast.success("Copied."); }}>
              Copy
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={generateMut.isPending || saveMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={generateMut.isPending}
          className="flex-1 justify-center"
        >
          {generateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : (displayMd ? "Regenerate" : "Generate Test Plan")}
        </Button>
        {displayMd && (
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="flex-1 justify-center"
          >
            {saveMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              : "Save & Continue"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage C — Execution tracking
// ---------------------------------------------------------------------------

function StageC({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);

  const testPlanMd = usePhase4Store((s) => s.testPlanMd);
  const scenarioResults = usePhase4Store((s) => s.scenarioResults);
  const scenarioNotes = usePhase4Store((s) => s.scenarioNotes);
  const isRegressionBypass = usePhase4Store((s) => s.isRegressionBypass);
  const failedScenarioNames = usePhase4Store((s) => s.failedScenarioNames);
  const setScenarioResult = usePhase4Store((s) => s.setScenarioResult);
  const setScenarioNotes = usePhase4Store((s) => s.setScenarioNotes);

  const scenarios = useMemo(() => parseScenarioNames(testPlanMd ?? ""), [testPlanMd]);

  const markedCount = scenarios.filter((n) => scenarioResults[n] && scenarioResults[n] !== "pending").length;
  const failCount = scenarios.filter((n) => scenarioResults[n] === "fail").length;
  const allMarked = markedCount === scenarios.length && scenarios.length > 0;

  if (!testPlanMd || scenarios.length === 0) {
    return (
      <Callout>
        No test plan found. Go back and generate one first.
        <Button variant="secondary" onClick={onBack} className="mt-2 text-sm">← Back</Button>
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading>Execute Tests</SectionHeading>

      {isRegressionBypass && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm font-medium",
          dark ? "border-amber-700 bg-amber-900/20 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-800",
        )}>
          Regression Bypass mode — previously failed scenarios highlighted. Re-test those before proceeding.
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>{markedCount}/{scenarios.length} scenarios tested</span>
          {failCount > 0 && <span className="text-red-500">{failCount} failed</span>}
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
                        Previously failed
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
                        : dark ? "bg-neutral-800 text-neutral-400 hover:bg-emerald-900/40 hover:text-emerald-400" : "bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700",
                    )}
                  >
                    Pass
                  </button>
                  <button
                    onClick={() => setScenarioResult(name, "fail")}
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-semibold transition",
                      result === "fail"
                        ? "bg-red-500 text-white"
                        : dark ? "bg-neutral-800 text-neutral-400 hover:bg-red-900/40 hover:text-red-400" : "bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-700",
                    )}
                  >
                    Fail
                  </button>
                </div>
              </div>

              {/* Test plan section preview */}
              {sectionMd && (
                <details className={cn("text-xs rounded", dark ? "text-neutral-400" : "text-slate-500")}>
                  <summary className="cursor-pointer font-medium">View test steps</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono">{sectionMd}</pre>
                </details>
              )}

              {/* Notes on fail */}
              {result === "fail" && (
                <Textarea
                  placeholder="Describe what failed — reproduction steps, error messages, observed vs expected…"
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
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          className="flex-1 justify-center"
          onClick={onContinue}
          disabled={!allMarked}
        >
          Testing Gate <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {!allMarked && (
        <p className={cn("text-xs text-center", dark ? "text-neutral-500" : "text-slate-400")}>
          Mark all {scenarios.length} scenarios before proceeding.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage D — Testing Gate
// ---------------------------------------------------------------------------

function StageD({ storyId, onBack, onNewStory }: { storyId: number; onBack: () => void; onNewStory: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
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

  const handlePass = () => {
    passGateMut.mutate(storyId, {
      onSuccess: () => {
        setRegressionBypass(false, []);
      },
    });
  };

  const handleFail = () => {
    if (!combinedBugReport.trim()) {
      toast.error("Generate the bug report first.");
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
        resolution_summary: `Patch scope: ${patchScope.slice(0, 300)}`,
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
            Testing Gate Passed
          </h3>
          <p className={cn("text-sm", dark ? "text-emerald-400" : "text-emerald-700")}>
            US#{storyId} is ready for production deployment.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {ctx && (
            <Button
              variant="secondary"
              className="w-full justify-center"
              disabled={pmStatusMut.isPending}
              onClick={() => pmStatusMut.mutate({ pmStoryId: String(storyId), statusName: "production" })}
            >
              {pmStatusMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating PM…</>
                : "Update PM Story Status"}
            </Button>
          )}
          <Button className="w-full justify-center" onClick={() => { clearPhase4Draft(); onNewStory(); }}>
            Test Another Story
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
              Fix-Bolt Triggered — US#{storyId}
            </h3>
          </div>
          <p className={cn("text-sm", dark ? "text-amber-400" : "text-amber-700")}>
            Bug report saved. Vaccine record appended. Hand the Fix-Bolt artifact to the developer.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={() => blobDownload(combinedBugReport, `fix-bolt-us${storyId}.md`)}
          >
            Download Fix-Bolt Artifact
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={() => { void navigator.clipboard.writeText(combinedBugReport); toast.success("Copied."); }}
          >
            Copy Fix-Bolt Brief
          </Button>
          <Button className="w-full justify-center" onClick={() => { clearPhase4Draft(); onNewStory(); }}>
            Test Another Story
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading>Testing Gate</SectionHeading>

      {/* Summary */}
      <div className={cn(
        "rounded-xl border p-4 space-y-2",
        allPassed
          ? dark ? "border-emerald-700/60 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
          : dark ? "border-red-700/60 bg-red-900/10" : "border-red-200 bg-red-50",
      )}>
        <div className="flex items-center gap-2">
          {allPassed
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : <XCircle className="h-4 w-4 text-red-500" />}
          <span className={cn("font-semibold text-sm", allPassed
            ? dark ? "text-emerald-300" : "text-emerald-800"
            : dark ? "text-red-300" : "text-red-800",
          )}>
            {allPassed ? `All ${scenarios.length} scenarios passed` : `${failedScenarios.length} of ${scenarios.length} scenarios failed`}
          </span>
        </div>
        {!allPassed && (
          <ul className={cn("text-xs list-disc list-inside space-y-0.5", dark ? "text-red-400" : "text-red-700")}>
            {failedScenarios.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </div>

      {/* Pass path */}
      {allPassed && (
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={passGateMut.isPending}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={handlePass}
            disabled={passGateMut.isPending}
          >
            {passGateMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Passing gate…</>
              : "Pass Testing Gate"}
          </Button>
        </div>
      )}

      {/* Fail path — Bug Isolation Wizard */}
      {!allPassed && (
        <div className="space-y-4">
          <div>
            <h3 className={cn("font-semibold text-sm mb-1", dark ? "text-neutral-200" : "text-slate-800")}>
              Bug Isolation Wizard
            </h3>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
              AI analyses the failed scenarios + QA notes to generate a Fix-Bolt artifact for the developer.
            </p>
          </div>

          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={handleGenerateBugReport}
            disabled={bugReportMut.isPending}
          >
            {bugReportMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</>
              : (combinedBugReport ? "Regenerate Bug Report" : "Generate Fix-Bolt Artifact")}
          </Button>

          {bugReportMut.isPending && (
            <AIProgressIndicator
              steps={["Analysing failures…", "Forming root cause hypothesis…", "Writing Fix-Bolt artifact…"]}
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
                <Button variant="secondary" onClick={() => blobDownload(combinedBugReport, `fix-bolt-us${storyId}.md`)}>
                  Download .md
                </Button>
                <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(extractSection(combinedBugReport, "## Fix-Bolt Brief") || combinedBugReport); toast.success("Copied."); }}>
                  Copy Fix-Bolt Brief
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={failGateMut.isPending}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="flex-1 justify-center"
              onClick={handleFail}
              disabled={failGateMut.isPending || !combinedBugReport}
              variant="danger"
            >
              {failGateMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : "Trigger Fix-Bolt"}
            </Button>
          </div>
          {!combinedBugReport && (
            <p className={cn("text-xs text-center", dark ? "text-neutral-500" : "text-slate-400")}>
              Generate the Fix-Bolt artifact first.
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

const STAGE_LABELS: Record<Stage, string> = {
  A: "Select Story",
  B: "Test Plan",
  C: "Execute",
  D: "Testing Gate",
};

export function Phase4Workflow() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const [stage, setStage] = useState<Stage>("A");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const selectedStoryId = usePhase4Store((s) => s.selectedStoryId);
  const currentStoryMeta = usePhase4Store((s) => s.currentStoryMeta);
  const setSelectedStoryId = usePhase4Store((s) => s.setSelectedStoryId);
  const clearPhase4Draft = usePhase4Store((s) => s.clearPhase4Draft);

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  const handleSelect = (id: number) => {
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleNewStory = () => {
    clearPhase4Draft();
    setStage("A");
  };

  const handleStepperGoA = () => {
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
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Phase 4</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          Testing
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          Generate AI-assisted test plans, track scenario execution, and isolate bugs with the Fix-Bolt wizard.
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
            <img src="/images/testing.svg" alt="Phase 4 testing process diagram" className="mx-auto max-w-full" />
          </div>
        )}
      </div>

      {!context && (
        <Callout>Log in and select a project to use Phase 4.</Callout>
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
                ← Stories
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
