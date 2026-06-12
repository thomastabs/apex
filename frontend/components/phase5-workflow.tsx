"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Rocket,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  useEligibleStories,
  useGenerateDeployPack,
  useGenerateInfraDelta,
  useLoadDeployPack,
  useLoadInfraDelta,
  usePassDeploymentGate,
  useReviseDeployPack,
  useSaveDeployPack,
  useSaveInfraDelta,
  useSaveVerification,
  useStoryContext,
  useTraceabilityMatrix,
} from "@/lib/hooks/use-phase5";
import { useUpdatePmStoryStatus } from "@/lib/hooks/use-phase4";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import type { InfraDelta, InfraDeltaCategory, InfraDeltaItem, Phase5StoryPreview } from "@/lib/api/types";

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
// Traceability matrix panel (Feature B — zero AI, assembled from artifacts)
// ---------------------------------------------------------------------------

const GAP_LABELS: Record<string, string> = {
  NO_COVERING_TASK: "no covering task",
  TASK_WITHOUT_PACK: "task without pack",
  NOT_TESTED: "not tested",
  ORPHAN_COVERS: "covers unknown scenario",
};

function TraceabilityPanel({ storyId }: { storyId: number }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { matrix, isLoading } = useTraceabilityMatrix(storyId);

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border px-4 py-3 text-sm flex items-center gap-2", dark ? "border-neutral-700 text-neutral-400" : "border-slate-200 text-slate-500")}>
        <Loader2 className="h-4 w-4 animate-spin" /> Assembling traceability matrix…
      </div>
    );
  }
  if (!matrix) {
    return (
      <div className={cn("rounded-lg border px-4 py-3 text-sm", dark ? "border-neutral-700 text-neutral-500" : "border-slate-200 text-slate-400")}>
        No Gherkin scenarios found for this story — nothing to trace.
      </div>
    );
  }

  const { summary } = matrix;
  return (
    <div className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
      <div className={cn("flex items-center justify-between px-4 py-2.5 border-b", dark ? "border-neutral-700" : "border-slate-200")}>
        <span className={cn("font-medium", dark ? "text-neutral-300" : "text-slate-700")}>
          Traceability Matrix
        </span>
        <span className={cn(
          "rounded px-2 py-0.5 text-xs font-semibold",
          matrix.complete
            ? dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700"
            : dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
        )}>
          {matrix.complete ? "Complete" : `${summary.gap_count} gap(s)`}
        </span>
      </div>
      <p className={cn("px-4 py-2 text-xs border-b", dark ? "text-neutral-500 border-neutral-800" : "text-slate-400 border-slate-100")}>
        {summary.covered}/{summary.total} scenarios covered by tasks · {summary.with_pack}/{summary.total} fully packed · {summary.tested}/{summary.total} QA-tested
      </p>
      <ul className={cn("divide-y", dark ? "divide-neutral-800" : "divide-slate-100")}>
        {matrix.scenarios.map((row) => (
          <li
            key={row.scenario}
            className={cn(
              "px-4 py-2 flex items-start gap-3",
              row.gaps.length > 0 && (dark ? "bg-amber-950/20" : "bg-amber-50/60"),
            )}
          >
            <span className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-semibold",
              row.qa_result === "pass"
                ? dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700"
                : row.qa_result === "fail"
                  ? dark ? "bg-red-900/40 text-red-400" : "bg-red-100 text-red-700"
                  : dark ? "bg-neutral-800 text-neutral-500" : "bg-slate-100 text-slate-400",
            )}>
              {row.qa_result}
            </span>
            <div className="min-w-0">
              <p className={cn("leading-snug", dark ? "text-neutral-200" : "text-slate-700")}>{row.scenario}</p>
              <p className={cn("mt-0.5 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                {row.tasks.length > 0 ? `Tasks ${row.tasks.join(", ")}` : "No covering task"}
                {row.tasks.length > 0 && ` · packs: ${row.tasks_with_pack.length}/${row.tasks.length}`}
                {row.gaps.length > 0 && (
                  <span className={dark ? "text-amber-400" : "text-amber-600"}>
                    {" "}— {row.gaps.map((g) => GAP_LABELS[g] ?? g).join(", ")}
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CATEGORY_LABELS: Record<InfraDeltaCategory, string> = {
  env_var: "Env var",
  migration: "Migration",
  iac: "IaC",
  ci_config: "CI config",
  secret: "Secret",
};

const EMPTY_ITEM: InfraDeltaItem = { category: "iac", title: "", detail: "", risk: "low" };

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
        No QA-passed stories found. A story must pass the Phase 4 Testing Gate before it can be deployed.
      </Callout>
    );
  }

  const byEpic = new Map<string, Phase5StoryPreview[]>();
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
        <SectionHeading>Select a story to deploy</SectionHeading>
        <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
          Choose a QA-passed user story to take through the Deployment Gate.
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
            {story.deploy_bypass && (
              <span className={cn(
                "absolute top-2 right-2 rounded text-xs font-semibold px-1.5 py-0.5",
                dark ? "bg-sky-900/40 text-sky-400" : "bg-sky-100 text-sky-700",
              )}>
                Routine
              </span>
            )}
            <div className="flex items-start gap-2 mb-2">
              <span className={cn(
                "rounded text-xs font-mono font-bold px-1.5 py-0.5 shrink-0",
                dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700",
              )}>
                US#{story.story_id}
              </span>
              {story.has_infra_delta && (
                <span className={cn(
                  "rounded text-xs px-1.5 py-0.5",
                  dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
                )}>
                  Delta ready
                </span>
              )}
              {story.has_deploy_pack && (
                <span className={cn(
                  "rounded text-xs px-1.5 py-0.5",
                  dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
                )}>
                  Pack ready
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
// Stage B — Pre-Flight (Infra Delta Check)
// ---------------------------------------------------------------------------

function StageB({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);

  const infraDelta = usePhase5Store((s) => s.infraDelta);
  const setInfraDelta = usePhase5Store((s) => s.setInfraDelta);
  const setCurrentStoryMeta = usePhase5Store((s) => s.setCurrentStoryMeta);

  // Refresh-resume: pull a previously saved delta when the draft store is empty.
  useLoadInfraDelta(storyId, infraDelta === null);

  const generateMut = useGenerateInfraDelta();
  const saveMut = useSaveInfraDelta();

  useEffect(() => {
    if (ctx) setCurrentStoryMeta(ctx.title, ctx.epic_title);
  }, [ctx, setCurrentStoryMeta]);

  const patchDelta = (patch: Partial<InfraDelta>) => {
    if (infraDelta) setInfraDelta({ ...infraDelta, ...patch }, false);
  };

  const patchItem = (idx: number, patch: Partial<InfraDeltaItem>) => {
    if (!infraDelta) return;
    const deltas = infraDelta.deltas.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    patchDelta({ deltas });
  };

  const canSave = infraDelta !== null
    && (!infraDelta.needs_infra_change || infraDelta.deltas.length > 0)
    && (infraDelta.needs_infra_change || infraDelta.deltas.length === 0);

  const handleSave = () => {
    if (!infraDelta) return;
    saveMut.mutate({ storyId, delta: infraDelta }, { onSuccess: () => onContinue() });
  };

  const inputClass = cn(
    "w-full rounded-lg border px-3 py-2 text-sm",
    dark
      ? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-emerald-500 focus:outline-none"
      : "border-slate-300 bg-white text-slate-800 focus:border-emerald-500 focus:outline-none",
  );

  return (
    <div className="space-y-5">
      <SectionHeading>Pre-Flight — Infrastructure Delta Check</SectionHeading>
      <p className={cn("text-sm -mt-3", dark ? "text-neutral-400" : "text-slate-500")}>
        One question: does deploying this story need new infra, env vars, secrets, migrations,
        or pipeline changes — or is it a routine deployment on the existing pipeline?
      </p>

      {ctx && (
        <details className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
          <summary className={cn("cursor-pointer px-4 py-2.5 font-medium", dark ? "text-neutral-300" : "text-slate-700")}>
            Acceptance Criteria (Gherkin)
          </summary>
          <pre className={cn("p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono", dark ? "text-neutral-400" : "text-slate-600")}>
            {ctx.gherkin}
          </pre>
        </details>
      )}

      {ctx && !ctx.github_context_synced && (
        <Callout>
          No GitHub context synced — the delta check runs on specs only. Sync the repo in the
          sidebar for pipeline-aware verdicts.
        </Callout>
      )}

      <TraceabilityPanel storyId={storyId} />


      {generateMut.isPending && (
        <AIProgressIndicator
          steps={["Reading story spec…", "Checking infra surface…", "Writing verdict…"]}
          isPending={generateMut.isPending}
          dark={dark}
        />
      )}

      {infraDelta && (
        <div className={cn("rounded-xl border p-5 space-y-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Verdict</p>
            <div className="flex gap-2">
              <button
                onClick={() => patchDelta({ needs_infra_change: false, deltas: [] })}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition",
                  !infraDelta.needs_infra_change
                    ? "border-sky-500 bg-sky-600 text-white"
                    : dark ? "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-sky-600" : "border-slate-300 bg-white text-slate-500 hover:border-sky-400",
                )}
              >
                Routine deployment — no infra changes
              </button>
              <button
                onClick={() => patchDelta({
                  needs_infra_change: true,
                  deltas: infraDelta.deltas.length > 0 ? infraDelta.deltas : [{ ...EMPTY_ITEM }],
                })}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition",
                  infraDelta.needs_infra_change
                    ? "border-amber-500 bg-amber-600 text-white"
                    : dark ? "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-amber-600" : "border-slate-300 bg-white text-slate-500 hover:border-amber-400",
                )}
              >
                Infra changes required
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Rationale</p>
            <Textarea
              value={infraDelta.rationale}
              onChange={(e) => patchDelta({ rationale: e.target.value })}
              rows={3}
              className="text-sm"
            />
          </div>

          {infraDelta.needs_infra_change && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Delta items</p>
              {infraDelta.deltas.map((item, idx) => (
                <div key={idx} className={cn("rounded-lg border p-3 space-y-2", dark ? "border-neutral-700 bg-neutral-950" : "border-slate-200 bg-white")}>
                  <div className="flex gap-2">
                    <select
                      value={item.category}
                      onChange={(e) => patchItem(idx, { category: e.target.value as InfraDeltaCategory })}
                      className={cn(inputClass, "w-36 shrink-0")}
                    >
                      {(Object.keys(CATEGORY_LABELS) as InfraDeltaCategory[]).map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                    <input
                      value={item.title}
                      onChange={(e) => patchItem(idx, { title: e.target.value })}
                      placeholder="Short imperative title"
                      className={inputClass}
                    />
                    <select
                      value={item.risk}
                      onChange={(e) => patchItem(idx, { risk: e.target.value as "low" | "high" })}
                      className={cn(
                        inputClass, "w-24 shrink-0 font-semibold",
                        item.risk === "high" ? "text-red-500" : "text-emerald-500",
                      )}
                    >
                      <option value="low">low</option>
                      <option value="high">high</option>
                    </select>
                    <button
                      onClick={() => patchDelta({ deltas: infraDelta.deltas.filter((_, i) => i !== idx) })}
                      className={cn("shrink-0 rounded-lg border px-2.5 transition", dark ? "border-neutral-700 text-neutral-500 hover:text-red-400 hover:border-red-700" : "border-slate-300 text-slate-400 hover:text-red-500 hover:border-red-300")}
                      aria-label="Remove delta item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea
                    value={item.detail}
                    onChange={(e) => patchItem(idx, { detail: e.target.value })}
                    placeholder="What must change and why this story requires it"
                    rows={2}
                    className="text-xs"
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                className="gap-1.5"
                onClick={() => patchDelta({ deltas: [...infraDelta.deltas, { ...EMPTY_ITEM }] })}
              >
                <Plus className="h-4 w-4" /> Add item
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={generateMut.isPending || saveMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={() => generateMut.mutate(storyId)} disabled={generateMut.isPending} className="flex-1 justify-center">
          {generateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
            : (infraDelta ? "Re-run Delta Check" : "Run Infra Delta Check")}
        </Button>
        {infraDelta && (
          <Button onClick={handleSave} disabled={!canSave || saveMut.isPending} className="flex-1 justify-center">
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
// Stage C — Deploy Pack (or routine bypass)
// ---------------------------------------------------------------------------

function StageC({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const dark = useUiStore((s) => s.theme) === "dark";

  const infraDelta = usePhase5Store((s) => s.infraDelta);
  const deployPackMd = usePhase5Store((s) => s.deployPackMd);
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);

  const bypass = infraDelta !== null && !infraDelta.needs_infra_change;

  useLoadDeployPack(storyId, !bypass && deployPackMd === null);

  const generateMut = useGenerateDeployPack();
  const saveMut = useSaveDeployPack();

  if (bypass) {
    return (
      <div className="space-y-5">
        <SectionHeading>Deploy Pack</SectionHeading>
        <div className={cn(
          "rounded-xl border px-6 py-8 text-center space-y-3",
          dark ? "border-sky-700 bg-sky-900/20" : "border-sky-200 bg-sky-50",
        )}>
          <Rocket className="h-10 w-10 text-sky-500 mx-auto" />
          <h3 className={cn("text-lg font-semibold", dark ? "text-sky-300" : "text-sky-800")}>
            Routine Deployment
          </h3>
          <p className={cn("text-sm", dark ? "text-sky-400" : "text-sky-700")}>
            The delta check found no infrastructure changes — this story rides the existing
            automated CI/CD pipeline. No deploy pack is needed.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="gap-1.5" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={onContinue} className="flex-1 justify-center">
            Continue to Deployment Gate
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    if (!deployPackMd?.trim()) return;
    saveMut.mutate({ storyId, deployPackMd }, { onSuccess: () => onContinue() });
  };

  return (
    <div className="space-y-5">
      <SectionHeading>Deploy Pack</SectionHeading>
      <p className={cn("text-sm -mt-3", dark ? "text-neutral-400" : "text-slate-500")}>
        Concrete scripts for the flagged delta items — env diffs, migrations, IaC and pipeline
        fragments. The DevOps Alliance security-reviews this pack at the gate.
      </p>

      {generateMut.isPending && (
        <AIProgressIndicator
          steps={["Reading delta items…", "Writing scripts…", "Adding rollback plan…"]}
          isPending={generateMut.isPending}
          dark={dark}
        />
      )}

      {deployPackMd && (
        <div className="space-y-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Edit</p>
              <Textarea
                value={deployPackMd}
                onChange={(e) => setDeployPackMd(e.target.value, false)}
                rows={28}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Preview</p>
              <MarkdownPreview content={deployPackMd} dark={dark} className="max-h-[28rem]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => blobDownload(deployPackMd, `deploy-pack-us${storyId}.md`)}>
              Download .md
            </Button>
            <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(deployPackMd); toast.success("Copied."); }}>
              Copy
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={generateMut.isPending || saveMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={() => generateMut.mutate(storyId)} disabled={generateMut.isPending} className="flex-1 justify-center">
          {generateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : (deployPackMd ? "Regenerate Pack" : "Generate Deploy Pack")}
        </Button>
        {deployPackMd && (
          <Button onClick={handleSave} disabled={saveMut.isPending} className="flex-1 justify-center">
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
// Stage D — Deployment Gate
// ---------------------------------------------------------------------------

function StageD({ storyId, onBack, onRevise, onNewStory }: {
  storyId: number;
  onBack: () => void;
  onRevise: () => void;
  onNewStory: () => void;
}) {
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);

  const infraDelta = usePhase5Store((s) => s.infraDelta);
  const deployPackMd = usePhase5Store((s) => s.deployPackMd);
  const packSaved = usePhase5Store((s) => s.packSaved);
  const techLeadApproved = usePhase5Store((s) => s.techLeadApproved);
  const devopsApproved = usePhase5Store((s) => s.devopsApproved);
  const rejectionFeedback = usePhase5Store((s) => s.rejectionFeedback);
  const setSignOffs = usePhase5Store((s) => s.setSignOffs);
  const setRejectionFeedback = usePhase5Store((s) => s.setRejectionFeedback);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);

  const [rejecting, setRejecting] = useState(false);

  const gateMut = usePassDeploymentGate();
  const reviseMut = useReviseDeployPack();
  const pmStatusMut = useUpdatePmStoryStatus();

  // Auto-persist the matrix as gate evidence the moment it's assembled —
  // advisory only, never blocks the gate.
  const { matrix } = useTraceabilityMatrix(storyId);
  const saveVerificationMut = useSaveVerification();
  const verificationSavedRef = useRef(false);
  const saveVerification = saveVerificationMut.mutate;
  useEffect(() => {
    if (matrix && !verificationSavedRef.current) {
      verificationSavedRef.current = true;
      saveVerification({ storyId, matrix });
    }
  }, [matrix, storyId, saveVerification]);

  const bypass = infraDelta !== null && !infraDelta.needs_infra_change;
  const packOk = bypass || (Boolean(deployPackMd?.trim()) && packSaved);
  const canApprove = infraDelta !== null && packOk && techLeadApproved && devopsApproved;

  const handleReject = () => {
    if (!rejectionFeedback.trim() || !deployPackMd) return;
    reviseMut.mutate(
      { storyId, deployPackMd, feedback: rejectionFeedback },
      {
        onSuccess: () => {
          setRejectionFeedback("");
          setRejecting(false);
          onRevise();
        },
      },
    );
  };

  if (gateMut.isSuccess) {
    return (
      <div className="space-y-5">
        <div className={cn(
          "rounded-xl border px-6 py-8 text-center space-y-3",
          dark ? "border-emerald-700 bg-emerald-900/20" : "border-emerald-200 bg-emerald-50",
        )}>
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h3 className={cn("text-lg font-semibold", dark ? "text-emerald-300" : "text-emerald-800")}>
            Deployment Gate Passed
          </h3>
          <p className={cn("text-sm", dark ? "text-emerald-400" : "text-emerald-700")}>
            US#{storyId} is deployed. The gate decision was recorded in deployment-log.md.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {ctx && (
            <Button
              variant="secondary"
              className="w-full justify-center"
              disabled={pmStatusMut.isPending}
              onClick={() => pmStatusMut.mutate({ pmStoryId: String(storyId), statusName: "done" })}
            >
              {pmStatusMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating PM…</>
                : "Update PM Story Status"}
            </Button>
          )}
          <Button className="w-full justify-center" onClick={() => { clearPhase5Draft(); onNewStory(); }}>
            Deploy Another Story
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading>Deployment Gate</SectionHeading>

      {/* Evidence summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn("rounded-lg border p-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Infra delta verdict</p>
          {infraDelta ? (
            <p className={cn("text-sm font-semibold", bypass ? "text-sky-500" : "text-amber-500")}>
              {bypass ? "Routine deployment (bypass)" : `${infraDelta.deltas.length} change(s) required`}
            </p>
          ) : (
            <p className="text-sm text-red-500">Missing — run the Pre-Flight check.</p>
          )}
          {infraDelta?.rationale && (
            <p className={cn("mt-1 text-xs line-clamp-3", dark ? "text-neutral-500" : "text-slate-400")}>
              {infraDelta.rationale}
            </p>
          )}
        </div>
        <div className={cn("rounded-lg border p-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Deploy pack</p>
          {bypass ? (
            <p className="text-sm text-sky-500 font-semibold">Not required (routine)</p>
          ) : packOk ? (
            <p className="text-sm text-emerald-500 font-semibold">Saved and ready for review</p>
          ) : (
            <p className="text-sm text-red-500">Missing — generate and save the pack first.</p>
          )}
        </div>
      </div>

      {/* Traceability evidence */}
      <TraceabilityPanel storyId={storyId} />

      {/* Sign-offs */}
      <div className={cn("rounded-xl border p-5 space-y-3", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
        <p className={cn("flex items-center gap-2 text-sm font-semibold", dark ? "text-neutral-200" : "text-slate-700")}>
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Human gatekeeper sign-offs
        </p>
        <label className={cn("flex items-start gap-2.5 text-sm cursor-pointer", dark ? "text-neutral-300" : "text-slate-600")}>
          <input
            type="checkbox"
            checked={techLeadApproved}
            onChange={(e) => setSignOffs(e.target.checked, devopsApproved)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span><strong>Tech Lead</strong> — the delta verdict and deploy pack were reviewed for correctness and completeness.</span>
        </label>
        <label className={cn("flex items-start gap-2.5 text-sm cursor-pointer", dark ? "text-neutral-300" : "text-slate-600")}>
          <input
            type="checkbox"
            checked={devopsApproved}
            onChange={(e) => setSignOffs(techLeadApproved, e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span><strong>DevOps Alliance</strong> — the security review passed: no vulnerable configuration, policy violation, or scalability risk.</span>
        </label>
      </div>

      {/* Reject path — only meaningful when a pack exists */}
      {!bypass && deployPackMd && (
        <div className={cn("rounded-xl border p-5 space-y-3", dark ? "border-neutral-800" : "border-slate-200")}>
          <button
            onClick={() => setRejecting(!rejecting)}
            className={cn("text-sm font-medium transition", dark ? "text-neutral-400 hover:text-red-400" : "text-slate-500 hover:text-red-500")}
          >
            {rejecting ? "Cancel rejection" : "Reject pack — request AI revision with security feedback"}
          </button>
          {rejecting && (
            <>
              <Textarea
                value={rejectionFeedback}
                onChange={(e) => setRejectionFeedback(e.target.value)}
                placeholder="Security review findings the revised pack must address…"
                rows={4}
                className="text-sm"
              />
              <Button
                variant="secondary"
                onClick={handleReject}
                disabled={!rejectionFeedback.trim() || reviseMut.isPending}
                className="w-full justify-center"
              >
                {reviseMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Revising…</>
                  : "Send feedback & revise pack"}
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={gateMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={() => gateMut.mutate({ storyId, techLeadApproved, devopsApproved })}
          disabled={!canApprove || gateMut.isPending}
          className="flex-1 justify-center"
        >
          {gateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</>
            : "Approve & Deploy"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — Phase5Workflow
// ---------------------------------------------------------------------------

type Stage = "A" | "B" | "C" | "D";

const STAGE_LABELS: Record<Stage, string> = {
  A: "Select Story",
  B: "Pre-Flight",
  C: "Deploy Pack",
  D: "Deployment Gate",
};

export function Phase5Workflow() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const [stage, setStage] = useState<Stage>("A");
  const selectedStoryId = usePhase5Store((s) => s.selectedStoryId);
  const currentStoryMeta = usePhase5Store((s) => s.currentStoryMeta);
  const setSelectedStoryId = usePhase5Store((s) => s.setSelectedStoryId);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  const handleSelect = (id: number) => {
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleNewStory = () => {
    clearPhase5Draft();
    setStage("A");
  };

  const handleStepperGoA = () => {
    clearPhase5Draft();
    setStage("A");
  };

  const stages: Stage[] = ["A", "B", "C", "D"];
  const stageNums: Record<Stage, number> = { A: 1, B: 2, C: 3, D: 4 };
  const currentIdx = stages.indexOf(stage);

  return (
    <section className="px-8 py-8">
      {/* Phase header */}
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Phase 5</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          Deployment
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          Run the AI infra delta check, prepare deploy packs, and pass the human-gated Deployment Gate.
        </p>
      </div>

      {!context && (
        <Callout>Log in and select a project to use Phase 5.</Callout>
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
              <StageD
                storyId={selectedStoryId}
                onBack={() => setStage("C")}
                onRevise={() => setStage("C")}
                onNewStory={handleNewStory}
              />
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
