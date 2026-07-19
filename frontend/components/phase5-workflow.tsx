"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
  GitBranch,
  Eye,
  Info,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Button, Callout, SectionHeading, Textarea } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import {
  useEligibleStories,
  useDispatchGithubDeployment,
  useGenerateDeployPack,
  useGenerateInfraDelta,
  useGithubDeploymentStatus,
  useLoadDeployPack,
  useLoadInfraDelta,
  usePassDeploymentGate,
  useReviseDeployPack,
  useSaveGithubDeploymentConfig,
  useSaveDeployPack,
  useSaveInfraDelta,
  useSyncGithubDeployment,
  useSaveVerification,
  useStoryContext,
  useTraceabilityMatrix,
} from "@/lib/hooks/use-phase5";
import { useUpdatePmStoryStatus } from "@/lib/hooks/use-phase4";
import { getDeployPack } from "@/lib/api/phase5";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import { useDiffStore } from "@/lib/stores/diff-store";
import { useLogDecision } from "@/lib/hooks/use-workspace";
import { downloadZip } from "@/lib/utils/zip";
import { SignInRequired } from "@/components/sign-in-required";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, errMsg } from "@/lib/utils";
import type { DeployPackEmphasis, DeployPackOptions, GithubDeploymentConfig, InfraDelta, InfraDeltaCategory, InfraDeltaItem, Phase5StoryPreview } from "@/lib/api/types";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";
import { useGroundingFiles } from "@/lib/hooks/use-grounding-files";

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

const GAP_LABEL_KEYS: Record<string, TranslationKey> = {
  NO_COVERING_TASK: "phase5.gap.noCoveringTask",
  TASK_WITHOUT_PACK: "phase5.gap.taskWithoutPack",
  NOT_TESTED: "phase5.gap.notTested",
  ORPHAN_COVERS: "phase5.gap.orphanCovers",
};

function TraceabilityPanel({ storyId }: { storyId: number }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const { matrix, isLoading } = useTraceabilityMatrix(storyId);

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border px-4 py-3 text-sm flex items-center gap-2", dark ? "border-neutral-700 text-neutral-400" : "border-slate-200 text-slate-500")}>
        <Loader2 className="h-4 w-4 animate-spin" /> {t("phase5.assemblingMatrix")}
      </div>
    );
  }
  if (!matrix) {
    return (
      <div className={cn("rounded-lg border px-4 py-3 text-sm", dark ? "border-neutral-700 text-neutral-500" : "border-slate-200 text-slate-400")}>
        {t("phase5.noScenariosToTrace")}
      </div>
    );
  }

  const { summary } = matrix;
  return (
    <div className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
      <div className={cn("flex items-center justify-between px-4 py-2.5 border-b", dark ? "border-neutral-700" : "border-slate-200")}>
        <span className={cn("font-medium", dark ? "text-neutral-300" : "text-slate-700")}>
          {t("phase5.traceabilityMatrix")}
        </span>
        <span className={cn(
          "rounded px-2 py-0.5 text-xs font-semibold",
          matrix.complete
            ? dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700"
            : dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
        )}>
          {matrix.complete ? t("phase5.matrixComplete") : t(summary.gap_count === 1 ? "phase5.matrixGapsOne" : "phase5.matrixGapsOther", { n: summary.gap_count })}
        </span>
      </div>
      <p className={cn("px-4 py-2 text-xs border-b", dark ? "text-neutral-500 border-neutral-800" : "text-slate-400 border-slate-100")}>
        {t("phase5.matrixSummary", { covered: summary.covered, total: summary.total, withPack: summary.with_pack, tested: summary.tested })}
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
                {row.tasks.length > 0 ? t("phase5.tasksList", { list: row.tasks.join(", ") }) : t("phase5.noCoveringTask")}
                {row.tasks.length > 0 && t("phase5.packsOf", { have: row.tasks_with_pack.length, total: row.tasks.length })}
                {row.gaps.length > 0 && (
                  <span className={dark ? "text-amber-400" : "text-amber-600"}>
                    {" "}— {row.gaps.map((g) => (GAP_LABEL_KEYS[g] ? t(GAP_LABEL_KEYS[g]) : g)).join(", ")}
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

const CATEGORY_LABEL_KEYS: Record<InfraDeltaCategory, TranslationKey> = {
  env_var: "phase5.category.envVar",
  migration: "phase5.category.migration",
  iac: "phase5.category.iac",
  ci_config: "phase5.category.ciConfig",
  secret: "phase5.category.secret",
};

const EMPTY_ITEM: InfraDeltaItem = { category: "iac", title: "", detail: "", risk: "low" };

function parseInputLines(value: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    inputs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return inputs;
}

function inputLines(inputs: Record<string, string> | undefined): string {
  return Object.entries(inputs ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");
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

  const PAGE_SIZE = 4;

  const readyStories = (data?.stories ?? []).filter((s) => s.has_deploy_pack);
  const downloadAllMut = useMutation({
    mutationFn: async () => {
      const contents = await Promise.all(
        readyStories.map((s) => getDeployPack(ctx!, s.story_id).then((r) => r.deploy_pack_md ?? "")),
      );
      return contents.map((content, i) => ({ filename: `deploy_pack_story_${readyStories[i].story_id}.md`, content }));
    },
    onSuccess: (files) => downloadZip(files, "apex-deploy-packs.zip"),
    onError: (err: Error) => toast.error(t("phase4.toast.downloadFailed", { err: err.message })),
  });

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
        {t("phase5.noEligibleStories")}
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionHeading>{t("phase5.selectStoryTitle")}</SectionHeading>
          <p className={cn("mt-1 text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
            {t("phase5.selectStoryDesc")}
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

      {epics.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 shrink-0">
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
                ? "border-neutral-700 bg-neutral-900 hover:border-violet-500 hover:bg-neutral-800"
                : "border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50",
            )}
          >
            {story.deploy_bypass && (
              <span className={cn(
                "absolute top-2 right-2 rounded text-xs font-semibold px-1.5 py-0.5",
                dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500",
              )}>
                {t("phase5.routineBadge")}
              </span>
            )}
            <div className="flex items-start gap-2 mb-2">
              <span className={cn(
                "rounded text-xs font-mono font-bold px-1.5 py-0.5 shrink-0",
                dark ? "bg-neutral-800 text-violet-400" : "bg-violet-50 text-violet-700",
              )}>
                US#{story.story_id}
              </span>
              {story.has_infra_delta && (
                <span className={cn(
                  "rounded text-xs px-1.5 py-0.5",
                  dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
                )}>
                  {t("phase5.deltaReadyBadge")}
                </span>
              )}
              {story.has_deploy_pack && (
                <span className={cn(
                  "rounded text-xs px-1.5 py-0.5",
                  dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500",
                )}>
                  {t("phase5.packReadyBadge")}
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
// Stage B — Pre-Flight (Infra Delta Check)
// ---------------------------------------------------------------------------

function StageB({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data: ctx } = useStoryContext(storyId);

  const infraDelta = usePhase5Store((s) => s.infraDelta);
  const aiRecommendation = usePhase5Store((s) => s.aiRecommendation);
  const setInfraDelta = usePhase5Store((s) => s.setInfraDelta);
  const clearInfraDelta = usePhase5Store((s) => s.clearInfraDelta);
  const setCurrentStoryMeta = usePhase5Store((s) => s.setCurrentStoryMeta);

  // Refresh-resume: pull a previously saved delta when the draft store is empty.
  useLoadInfraDelta(storyId, infraDelta === null);

  const generateMut = useGenerateInfraDelta();
  const saveMut = useSaveInfraDelta();
  const [infraExtraContext, setInfraExtraContext] = useState<string[]>([]);
  const availableGroundingFiles = useGroundingFiles();

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
      <SectionHeading>{t("phase5.preFlightHeading")}</SectionHeading>
      <p className={cn("text-sm -mt-3", dark ? "text-neutral-400" : "text-slate-500")}>
        {t("phase5.preFlightDesc")}
      </p>

      {ctx && (
        <details className={cn("rounded-lg border text-sm", dark ? "border-neutral-700" : "border-slate-200")}>
          <summary className={cn("cursor-pointer px-4 py-2.5 font-medium", dark ? "text-neutral-300" : "text-slate-700")}>
            {t("phase4.acceptanceCriteriaGherkin")}
          </summary>
          <pre className={cn("p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono", dark ? "text-neutral-400" : "text-slate-600")}>
            {ctx.gherkin}
          </pre>
        </details>
      )}

      {ctx && !ctx.github_context_synced && (
        <Callout>
          {t("phase5.noGithubSynced")}
        </Callout>
      )}

      <TraceabilityPanel storyId={storyId} />


      {generateMut.isPending && (
        <AIProgressIndicator
          steps={[t("phase5.step.readingSpec"), t("phase5.step.checkingInfra"), t("phase5.step.writingVerdict")]}
          isPending={generateMut.isPending}
          dark={dark}
        />
      )}

      {infraDelta && (
        <div className={cn("rounded-xl border p-5 space-y-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          {/* AI recommendation — advisory; the human sets the final verdict below. */}
          <div className={cn("rounded-lg border p-3 text-xs", dark ? "border-neutral-700 bg-neutral-950" : "border-slate-300 bg-white")}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={cn("font-semibold uppercase tracking-wider", dark ? "text-neutral-400" : "text-slate-600")}>{t("phase5.aiRecommendation")}</span>
              <span className={cn(
                "rounded px-1.5 py-0.5 text-xs font-semibold capitalize",
                infraDelta.confidence === "high" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : infraDelta.confidence === "low" ? "bg-red-500/20 text-red-700 dark:text-red-400"
                  : "bg-amber-500/20 text-amber-700 dark:text-amber-400",
              )}>
                {t("phase5.confidenceLabel", { level: infraDelta.confidence })}
              </span>
              <span className={cn(
                "ml-auto font-semibold",
                infraDelta.needs_infra_change
                  ? "text-amber-700 dark:text-amber-400"
                  : dark ? "text-neutral-400" : "text-slate-600",
              )}>
                {infraDelta.needs_infra_change ? t("phase5.infraChangesRequired") : t("phase5.routineDeployment")}
              </span>
              <button
                onClick={clearInfraDelta}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition",
                  dark ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                )}
                title={t("phase5.clearRecommendationTitle")}
              >
                <XCircle className="size-3.5" /> {t("phase3.clear")}
              </button>
            </div>
            {infraDelta.evidence && (
              <p className={cn(dark ? "text-neutral-300" : "text-slate-700")}>
                <span className="font-semibold">{t("phase5.evidenceLabel")}</span>{infraDelta.evidence}
              </p>
            )}
            {infraDelta.confidence === "low" && (
              <p className="mt-1.5 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {t("phase5.lowConfidenceWarning")}
              </p>
            )}
            <p className={cn("mt-1.5", dark ? "text-neutral-500" : "text-slate-500")}>
              {t("phase5.advisoryVerdictNote")}
            </p>
          </div>

          <div>
            <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-wider", dark ? "text-neutral-400" : "text-slate-600")}>{t("phase5.verdictLabel")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => patchDelta({ needs_infra_change: false, deltas: [] })}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition",
                  !infraDelta.needs_infra_change
                    ? "border-violet-500 bg-violet-600 text-white"
                    : dark ? "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-violet-600" : "border-slate-300 bg-white text-slate-500 hover:border-violet-400",
                )}
              >
                {t("phase5.routineDeploymentButton")}
              </button>
              <button
                onClick={() => patchDelta({
                  needs_infra_change: true,
                  // Restore the AI's draft items after a Routine round-trip rather
                  // than starting blank; fall back to one empty item only if the AI
                  // never produced any.
                  deltas: infraDelta.deltas.length > 0
                    ? infraDelta.deltas
                    : (aiRecommendation?.deltas.length ? aiRecommendation.deltas : [{ ...EMPTY_ITEM }]),
                })}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition",
                  infraDelta.needs_infra_change
                    ? "border-amber-500 bg-amber-600 text-white"
                    : dark ? "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-amber-600" : "border-slate-300 bg-white text-slate-500 hover:border-amber-400",
                )}
              >
                {t("phase5.infraChangesRequiredButton")}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t("phase5.rationaleLabel")}</p>
            <Textarea
              value={infraDelta.rationale}
              onChange={(e) => patchDelta({ rationale: e.target.value })}
              rows={3}
              className="text-sm"
            />
          </div>

          {infraDelta.needs_infra_change && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t("phase5.deltaItemsLabel")}</p>
              {infraDelta.deltas.map((item, idx) => (
                <div key={idx} className={cn("rounded-lg border p-3 space-y-2", dark ? "border-neutral-700 bg-neutral-950" : "border-slate-200 bg-white")}>
                  <div className="flex gap-2">
                    <select
                      value={item.category}
                      onChange={(e) => patchItem(idx, { category: e.target.value as InfraDeltaCategory })}
                      className={cn(inputClass, "w-36 shrink-0")}
                    >
                      {(Object.keys(CATEGORY_LABEL_KEYS) as InfraDeltaCategory[]).map((c) => (
                        <option key={c} value={c}>{t(CATEGORY_LABEL_KEYS[c])}</option>
                      ))}
                    </select>
                    <input
                      value={item.title}
                      onChange={(e) => patchItem(idx, { title: e.target.value })}
                      placeholder={t("phase5.itemTitlePlaceholder")}
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
                      aria-label={t("phase5.removeItemAria")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea
                    value={item.detail}
                    onChange={(e) => patchItem(idx, { detail: e.target.value })}
                    placeholder={t("phase5.itemDetailPlaceholder")}
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
                <Plus className="h-4 w-4" /> {t("phase5.addItem")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={generateMut.isPending || saveMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button
          onClick={() => generateMut.mutate({ storyId, extraContextFiles: infraExtraContext })}
          disabled={generateMut.isPending}
          className="flex-1 justify-center"
        >
          {generateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase5.checking")}</>
            : (infraDelta ? t("phase5.rerunDeltaCheck") : t("phase5.runDeltaCheck"))}
        </Button>
        {generateMut.isPending && <CancelButton onCancel={() => generateMut.cancel()} />}
        {infraDelta && (
          <Button onClick={handleSave} disabled={!canSave || saveMut.isPending} className="flex-1 justify-center">
            {saveMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.saving")}</>
              : t("phase4.saveAndContinue")}
          </Button>
        )}
      </div>
      <AiGroundingNote
        files={AI_GROUNDING.phase5InfraDelta}
        dark={dark}
        availableFiles={availableGroundingFiles}
        selectedExtraFiles={infraExtraContext}
        onSelectedExtraFilesChange={setInfraExtraContext}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage C — Deploy Pack (or routine bypass)
// ---------------------------------------------------------------------------

const DEPLOY_ENV_OPTIONS: { value: DeployPackOptions["target_env"]; labelKey: TranslationKey }[] = [
  { value: "", labelKey: "phase5.env.auto" },
  { value: "production", labelKey: "phase5.env.production" },
  { value: "staging", labelKey: "phase5.env.staging" },
  { value: "both", labelKey: "phase5.env.both" },
];

const DEPLOY_IAC_OPTIONS: { value: DeployPackOptions["iac_format"]; labelKey: TranslationKey }[] = [
  { value: "", labelKey: "phase5.iac.auto" },
  { value: "terraform", labelKey: "phase5.iac.terraform" },
  { value: "compose", labelKey: "phase5.iac.compose" },
  { value: "kubernetes", labelKey: "phase5.iac.kubernetes" },
  { value: "bicep", labelKey: "phase5.iac.bicep" },
  { value: "shell", labelKey: "phase5.iac.shell" },
];

const DEPLOY_EMPHASIS_OPTIONS: { value: DeployPackEmphasis; labelKey: TranslationKey }[] = [
  { value: "zero_downtime", labelKey: "phase5.emphasis.zeroDowntime" },
  { value: "rollback_depth", labelKey: "phase5.emphasis.rollbackDepth" },
  { value: "secrets", labelKey: "phase5.emphasis.secrets" },
  { value: "db_safety", labelKey: "phase5.emphasis.dbSafety" },
  { value: "observability", labelKey: "phase5.emphasis.observability" },
];

function StageC({ storyId, onBack, onContinue }: { storyId: number; onBack: () => void; onContinue: () => void }) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";

  const infraDelta = usePhase5Store((s) => s.infraDelta);
  const deployPackMd = usePhase5Store((s) => s.deployPackMd);
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);
  const requestDiff = useDiffStore((s) => s.requestDiff);
  const logDecision = useLogDecision();

  const [options, setOptions] = useState<DeployPackOptions>({
    target_env: "",
    iac_format: "",
    emphasis: [],
    instructions: "",
  });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deployExtraContext, setDeployExtraContext] = useState<string[]>([]);
  const availableGroundingFiles = useGroundingFiles();

  const toggleEmphasis = (value: DeployPackEmphasis) =>
    setOptions((o) => ({
      ...o,
      emphasis: o.emphasis.includes(value)
        ? o.emphasis.filter((e) => e !== value)
        : [...o.emphasis, value],
    }));

  const inputClass = cn(
    "rounded-lg border px-3 py-2 text-sm",
    dark
      ? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-emerald-500 focus:outline-none"
      : "border-slate-300 bg-white text-slate-800 focus:border-emerald-500 focus:outline-none",
  );

  const bypass = infraDelta !== null && !infraDelta.needs_infra_change;

  useLoadDeployPack(storyId, !bypass && deployPackMd === null);

  const generateMut = useGenerateDeployPack();
  const saveMut = useSaveDeployPack();

  if (bypass) {
    return (
      <div className="space-y-5">
        <SectionHeading>{t("phase5.deployPackHeading")}</SectionHeading>
        <div className={cn(
          "rounded-xl border px-6 py-8 text-center space-y-3",
          dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50",
        )}>
          <Rocket className={cn("h-10 w-10 mx-auto", dark ? "text-neutral-400" : "text-slate-500")} />
          <h3 className={cn("text-lg font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>
            {t("phase5.routineDeploymentHeading")}
          </h3>
          <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-600")}>
            {t("phase5.routineDeploymentBody")}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="gap-1.5" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" /> {t("common.back")}
          </Button>
          <Button onClick={onContinue} className="flex-1 justify-center">
            {t("phase5.continueToDeploymentGate")}
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
      <SectionHeading>{t("phase5.deployPackHeading")}</SectionHeading>
      <p className={cn("text-sm -mt-3", dark ? "text-neutral-400" : "text-slate-500")}>
        {t("phase5.deployPackDesc")}
      </p>

      <div className={cn("rounded-xl border", dark ? "border-neutral-700 bg-neutral-950/50" : "border-slate-200 bg-slate-50")}>
        <button
          type="button"
          onClick={() => setOptionsOpen((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium",
            dark ? "text-neutral-200" : "text-slate-700",
          )}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-500" />
            {t("phase4.guideTheAi")} <span className={cn("font-normal", dark ? "text-neutral-500" : "text-slate-400")}>{t("phase4.optionalParen")}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", optionsOpen && "rotate-180")} />
        </button>

        {optionsOpen && (
          <div className="space-y-4 border-t px-4 py-4 dark:border-neutral-700">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  {t("phase5.targetEnvLabel")}
                </span>
                <select
                  value={options.target_env}
                  onChange={(e) => setOptions((o) => ({ ...o, target_env: e.target.value as DeployPackOptions["target_env"] }))}
                  className={cn(inputClass, "w-full")}
                >
                  {DEPLOY_ENV_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  {t("phase5.iacToolingLabel")}
                </span>
                <select
                  value={options.iac_format}
                  onChange={(e) => setOptions((o) => ({ ...o, iac_format: e.target.value as DeployPackOptions["iac_format"] }))}
                  className={cn(inputClass, "w-full")}
                >
                  {DEPLOY_IAC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                {t("phase4.emphasisLabel")}
              </span>
              <div className="flex flex-wrap gap-2">
                {DEPLOY_EMPHASIS_OPTIONS.map((opt) => {
                  const active = options.emphasis.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleEmphasis(opt.value)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition",
                        active
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                          : dark
                            ? "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                            : "border-slate-300 text-slate-500 hover:border-slate-400",
                      )}
                    >
                      {t(opt.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                {t("phase5.extraInstructionsLabel")}
              </span>
              <Textarea
                value={options.instructions}
                onChange={(e) => setOptions((o) => ({ ...o, instructions: e.target.value.slice(0, 2000) }))}
                rows={3}
                placeholder={t("phase5.extraInstructionsPlaceholder")}
                className="text-sm"
              />
            </label>
          </div>
        )}
      </div>

      {generateMut.isPending && (
        <AIProgressIndicator
          steps={[t("phase5.step.readingDeltaItems"), t("phase5.step.writingScripts"), t("phase5.step.addingRollback")]}
          isPending={generateMut.isPending}
          dark={dark}
        />
      )}

      {deployPackMd && (
        <div className="space-y-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t("phase3.editLabel")}</p>
              <Textarea
                value={deployPackMd}
                onChange={(e) => setDeployPackMd(e.target.value, false)}
                className="font-mono text-xs h-[34rem] resize-y"
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t("common.preview")}</p>
              <MarkdownPreview content={deployPackMd} dark={dark} className="h-[34rem] resize-y" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="gap-1.5" onClick={() => blobDownload(deployPackMd, `deploy-pack-us${storyId}.md`)}>
              <Download className="h-4 w-4" /> {t("phase4.downloadMd")}
            </Button>
            <Button variant="secondary" className="gap-1.5" onClick={() => { void navigator.clipboard.writeText(deployPackMd); toast.success(t("common.copied")); }}>
              <Copy className="h-4 w-4" /> {t("common.copy")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={generateMut.isPending || saveMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button
          onClick={() => {
            const prev = deployPackMd ?? "";
            generateMut.mutate(
              { storyId, options, extraContextFiles: deployExtraContext },
              {
                onSuccess: (data) => {
                  if (prev.trim() && prev !== data.deploy_pack_md) {
                    requestDiff({
                      title: t("phase5.diffTitle", { storyId }),
                      oldText: prev,
                      newText: data.deploy_pack_md,
                      onAccept: () => setDeployPackMd(data.deploy_pack_md, false),
                      onDiscard: () => logDecision.mutate({
                        scope: t("phase5.logDecisionScope", { storyId }),
                        summary: t("phase5.logDecisionDiscardSummary"),
                        reason: t("phase5.logDecisionDiscardReason"),
                      }),
                    });
                  } else {
                    setDeployPackMd(data.deploy_pack_md, false);
                  }
                },
              },
            );
          }}
          disabled={generateMut.isPending}
          className="flex-1 justify-center"
        >
          {generateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.generating")}</>
            : (deployPackMd ? t("phase5.regeneratePack") : t("phase5.generateDeployPack"))}
        </Button>
        {generateMut.isPending && <CancelButton onCancel={() => generateMut.cancel()} />}
        {deployPackMd && (
          <Button onClick={handleSave} disabled={saveMut.isPending} className="flex-1 justify-center">
            {saveMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase3.saving")}</>
              : t("phase4.saveAndContinue")}
          </Button>
        )}
      </div>
      <AiGroundingNote
        files={AI_GROUNDING.phase5DeployPack}
        dark={dark}
        availableFiles={availableGroundingFiles}
        selectedExtraFiles={deployExtraContext}
        onSelectedExtraFilesChange={setDeployExtraContext}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage D — Deployment Gate
// ---------------------------------------------------------------------------

function GithubActionsDeploymentPanel({
  storyId,
  canApprove,
}: {
  storyId: number;
  canApprove: boolean;
}) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const { data, isLoading } = useGithubDeploymentStatus(storyId);
  const saveConfigMut = useSaveGithubDeploymentConfig();
  const dispatchMut = useDispatchGithubDeployment();
  const syncMut = useSyncGithubDeployment();
  const [workflowId, setWorkflowId] = useState("");
  const [ref, setRef] = useState("main");
  const [environment, setEnvironment] = useState("production");
  const [includeApexInputs, setIncludeApexInputs] = useState(false);
  const [inputsText, setInputsText] = useState("environment=production");

  useEffect(() => {
    if (!data?.config) return;
    setWorkflowId(String(data.config.workflow_id ?? ""));
    setRef(String(data.config.ref ?? "main") || "main");
    setEnvironment(String(data.config.environment ?? ""));
    setIncludeApexInputs(Boolean(data.config.include_apex_inputs));
    setInputsText(inputLines(data.config.inputs));
  }, [data?.config]);

  const latest = data?.latest_run;
  const status = latest?.status ?? "";
  const conclusion = latest?.conclusion ?? "";
  const running = status && status !== "completed";
  const workflowReady = Boolean(data?.github_connected && data.workflow_configured && data.workflow_exists);
  const canDispatch = canApprove && workflowReady && !dispatchMut.isPending;
  const statusTone =
    conclusion === "success"
      ? "text-emerald-500"
      : conclusion
        ? "text-red-500"
        : running
          ? "text-amber-500"
          : dark ? "text-neutral-400" : "text-slate-500";

  const saveConfig = () => {
    const config: GithubDeploymentConfig = {
      workflow_id: workflowId.trim(),
      ref: ref.trim() || "main",
      environment: environment.trim(),
      inputs: parseInputLines(inputsText),
      include_apex_inputs: includeApexInputs,
    };
    saveConfigMut.mutate(config);
  };

  const workflowOptions = data?.workflows ?? [];

  return (
    <div className={cn("rounded-xl border p-5 space-y-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("flex items-center gap-2 text-sm font-semibold", dark ? "text-neutral-200" : "text-slate-700")}>
            <Rocket className="h-4 w-4 text-violet-500" /> {t("phase5.githubDeployment.heading")}
          </p>
          <p className={cn("mt-1 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
            {t("phase5.githubDeployment.sub")}
          </p>
        </div>
        <span className={cn("shrink-0 rounded px-2 py-0.5 text-xs font-semibold", statusTone)}>
          {isLoading
            ? t("common.loading")
            : !data?.github_connected
              ? t("phase5.githubDeployment.disconnected")
              : workflowReady
                ? t("phase5.githubDeployment.ready")
                : t("phase5.githubDeployment.needsConfig")}
        </span>
      </div>

      {data?.error && <Callout variant="danger">{data.error}</Callout>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            {t("phase5.githubDeployment.workflow")}
          </span>
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-sm",
              dark ? "border-neutral-700 bg-neutral-950 text-neutral-100" : "border-slate-300 bg-white text-slate-800",
            )}
          >
            <option value="">{t("phase5.githubDeployment.chooseWorkflow")}</option>
            {workflowOptions.map((wf) => {
              const value = String(wf.path || wf.id || "");
              return <option key={value} value={value}>{wf.name || value} · {wf.path || wf.id}</option>;
            })}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            {t("phase5.githubDeployment.ref")}
          </span>
          <div className="relative">
            <GitBranch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className={cn(
                "w-full rounded-lg border py-2 pl-9 pr-3 text-sm",
                dark ? "border-neutral-700 bg-neutral-950 text-neutral-100" : "border-slate-300 bg-white text-slate-800",
              )}
            />
          </div>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            {t("phase5.githubDeployment.environment")}
          </span>
          <input
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-sm",
              dark ? "border-neutral-700 bg-neutral-950 text-neutral-100" : "border-slate-300 bg-white text-slate-800",
            )}
          />
        </label>
        <label className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", dark ? "border-neutral-700 bg-neutral-950 text-neutral-300" : "border-slate-300 bg-white text-slate-600")}>
          <input
            type="checkbox"
            checked={includeApexInputs}
            onChange={(e) => setIncludeApexInputs(e.target.checked)}
            className="h-4 w-4 accent-violet-600"
          />
          <span>{t("phase5.githubDeployment.includeApexInputs")}</span>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          {t("phase5.githubDeployment.inputs")}
        </span>
        <Textarea
          value={inputsText}
          onChange={(e) => setInputsText(e.target.value)}
          rows={3}
          className="font-mono text-xs"
          placeholder="environment=production"
        />
      </label>

      {latest && (
        <div className={cn("rounded-lg border px-3 py-2 text-xs", dark ? "border-neutral-700 bg-neutral-950 text-neutral-400" : "border-slate-200 bg-white text-slate-500")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-semibold", statusTone)}>
              {status || "unknown"}{conclusion ? ` / ${conclusion}` : ""}
            </span>
            {latest.run_url && (
              <a href={latest.run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-500 hover:text-violet-400">
                {t("phase5.githubDeployment.openRun")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {latest.deploy_pack_hash && <p className="mt-1 font-mono">{latest.deploy_pack_hash}</p>}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" onClick={saveConfig} disabled={saveConfigMut.isPending} className="justify-center gap-1.5">
          {saveConfigMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {t("phase5.githubDeployment.saveConfig")}
        </Button>
        <Button
          onClick={() => {
            if (!window.confirm(t("phase5.githubDeployment.confirm", { storyId }))) return;
            dispatchMut.mutate({ storyId });
          }}
          disabled={!canDispatch}
          className="justify-center gap-1.5"
        >
          {dispatchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t("phase5.githubDeployment.dispatch")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => syncMut.mutate({ storyId, runId: latest?.run_id ?? undefined })}
          disabled={!latest?.run_id || syncMut.isPending}
          className="justify-center gap-1.5"
        >
          {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("phase5.githubDeployment.sync")}
        </Button>
      </div>
    </div>
  );
}

function StageD({ storyId, onBack, onRevise, onNewStory }: {
  storyId: number;
  onBack: () => void;
  onRevise: () => void;
  onNewStory: () => void;
}) {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const router = useRouter();
  const { data: ctx } = useStoryContext(storyId);

  const infraDelta = usePhase5Store((s) => s.infraDelta);
  const deployPackMd = usePhase5Store((s) => s.deployPackMd);
  const packSaved = usePhase5Store((s) => s.packSaved);
  const techLeadApproved = usePhase5Store((s) => s.techLeadApproved);
  const devopsApproved = usePhase5Store((s) => s.devopsApproved);
  const rejectionFeedback = usePhase5Store((s) => s.rejectionFeedback);
  const setSignOffs = usePhase5Store((s) => s.setSignOffs);
  const setRejectionFeedback = usePhase5Store((s) => s.setRejectionFeedback);
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);
  const logDecision = useLogDecision();

  const [rejecting, setRejecting] = useState(false);
  const [viewingPack, setViewingPack] = useState(false);

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
    // A revise is an explicit, human-requested change (the feedback IS the
    // decision) — record it and commit the revision directly. The diff gate is
    // reserved for blind regenerations, not deliberate revisions.
    logDecision.mutate({
      scope: t("phase5.logDecisionScope", { storyId }),
      summary: t("phase5.logDecisionRejectSummary"),
      reason: rejectionFeedback,
    });
    reviseMut.mutate(
      { storyId, deployPackMd, feedback: rejectionFeedback },
      {
        onSuccess: (data) => {
          setRejectionFeedback("");
          setRejecting(false);
          setDeployPackMd(data.deploy_pack_md, false);
          // The revised pack is materially different from what was reviewed —
          // both sign-offs must be re-verified against the new content.
          setSignOffs(false, false);
          toast.success(t("phase5.toast.packRevised"));
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
            {t("phase5.deploymentGatePassed")}
          </h3>
          <p className={cn("text-sm", dark ? "text-emerald-400" : "text-emerald-700")}>
            {t("phase5.deployedNote", { storyId })}
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
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase4.updatingPm")}</>
                : t("phase4.updatePmStatus")}
            </Button>
          )}
          <Button className="w-full justify-center gap-1.5" onClick={() => router.push("/phase6")}>
            <Rocket className="h-4 w-4" /> {t("phase5.continueToPhase6")}
          </Button>
          <Button variant="secondary" className="w-full justify-center" onClick={() => { clearPhase5Draft(); onNewStory(); }}>
            {t("phase5.deployAnotherStory")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading>{t("phase5.deploymentGateHeading")}</SectionHeading>

      {/* Evidence summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn("rounded-lg border p-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-1">{t("phase5.infraDeltaVerdictLabel")}</p>
          {infraDelta ? (
            <p className={cn("text-sm font-semibold", bypass ? (dark ? "text-neutral-300" : "text-slate-600") : "text-amber-500")}>
              {bypass ? t("phase5.routineDeploymentBypass") : t(infraDelta.deltas.length === 1 ? "phase5.changesRequiredOne" : "phase5.changesRequiredOther", { n: infraDelta.deltas.length })}
            </p>
          ) : (
            <p className="text-sm text-red-500">{t("phase5.missingPreFlight")}</p>
          )}
          {infraDelta?.rationale && (
            <p className={cn("mt-1 text-xs line-clamp-3", dark ? "text-neutral-500" : "text-slate-400")}>
              {infraDelta.rationale}
            </p>
          )}
        </div>
        <div className={cn("rounded-lg border p-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-1">{t("phase5.deployPackLabel")}</p>
          {bypass ? (
            <p className={cn("text-sm font-semibold", dark ? "text-neutral-300" : "text-slate-600")}>{t("phase5.notRequiredRoutine")}</p>
          ) : packOk ? (
            <>
              <p className={cn("text-sm font-semibold leading-snug", dark ? "text-neutral-100" : "text-slate-800")}>
                {t("phase5.deployPackTitle", { storyId, titleSuffix: ctx?.title ? `: ${ctx.title}` : "" })}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("phase5.savedReadyForReview")}
              </p>
              <p className={cn("mt-1 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                {infraDelta ? t(infraDelta.deltas.length === 1 ? "phase5.deltaSectionsOne" : "phase5.deltaSectionsOther", { n: infraDelta.deltas.length }) : "—"}
                {deployPackMd ? t("phase5.kCharsSuffix", { k: Math.round((deployPackMd.length / 100)) / 10 }) : ""}
              </p>
              {deployPackMd && (
                <button
                  onClick={() => setViewingPack(true)}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition",
                    dark
                      ? "border-neutral-700 text-neutral-300 hover:border-emerald-600 hover:text-emerald-400"
                      : "border-slate-300 text-slate-600 hover:border-emerald-500 hover:text-emerald-600",
                  )}
                >
                  <Eye className="h-3.5 w-3.5" /> {t("phase5.viewPack")}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-red-500">{t("phase5.missingGeneratePack")}</p>
          )}
        </div>
      </div>

      {/* Traceability evidence */}
      <TraceabilityPanel storyId={storyId} />

      {/* Sign-offs */}
      <div className={cn("rounded-xl border p-5 space-y-3", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
        <p className={cn("flex items-center gap-2 text-sm font-semibold", dark ? "text-neutral-200" : "text-slate-700")}>
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("phase5.gatekeeperSignOffs")}
        </p>
        <label className={cn("flex items-start gap-2.5 text-sm cursor-pointer", dark ? "text-neutral-300" : "text-slate-600")}>
          <input
            type="checkbox"
            checked={techLeadApproved}
            onChange={(e) => setSignOffs(e.target.checked, devopsApproved)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>{t("phase5.signOff.techLead")}</span>
        </label>
        <label className={cn("flex items-start gap-2.5 text-sm cursor-pointer", dark ? "text-neutral-300" : "text-slate-600")}>
          <input
            type="checkbox"
            checked={devopsApproved}
            onChange={(e) => setSignOffs(techLeadApproved, e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>{t("phase5.signOff.devops")}</span>
        </label>
      </div>

      <GithubActionsDeploymentPanel storyId={storyId} canApprove={canApprove} />

      {/* Reject path — only meaningful when a pack exists */}
      {!bypass && deployPackMd && (
        <div className={cn("rounded-xl border p-5 space-y-3", dark ? "border-neutral-800" : "border-slate-200")}>
          <button
            onClick={() => setRejecting(!rejecting)}
            className={cn("text-sm font-medium transition", dark ? "text-neutral-400 hover:text-red-400" : "text-slate-500 hover:text-red-500")}
          >
            {rejecting ? t("phase5.cancelRejection") : t("phase5.rejectPack")}
          </button>
          {rejecting && (
            <>
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
                {t("phase5.rejectExplainer")}
              </p>
              <Textarea
                value={rejectionFeedback}
                onChange={(e) => setRejectionFeedback(e.target.value)}
                placeholder={t("phase5.feedbackPlaceholder")}
                rows={4}
                className="text-sm"
                disabled={reviseMut.isPending}
              />
              {reviseMut.isPending && (
                <AIProgressIndicator
                  steps={[
                    t("phase5.step.readingFeedback"),
                    t("phase5.step.rewritingSections"),
                    t("phase5.step.recheckingRollback"),
                    t("phase5.step.finalisingPack"),
                  ]}
                  isPending={reviseMut.isPending}
                  dark={dark}
                />
              )}
              {reviseMut.isPending ? (
                <CancelButton onCancel={() => reviseMut.cancel()} label={t("phase5.cancelRevision")} className="w-full" />
              ) : (
                <Button
                  variant="secondary"
                  onClick={handleReject}
                  disabled={!rejectionFeedback.trim()}
                  className="w-full justify-center gap-1.5"
                >
                  {t("phase5.sendFeedbackRevise")}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={onBack} disabled={gateMut.isPending}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button
          onClick={() => {
            if (!window.confirm(t("phase5.confirmRecordManualDeploy", { storyId }))) return;
            gateMut.mutate({ storyId, techLeadApproved, devopsApproved });
          }}
          disabled={!canApprove || gateMut.isPending}
          variant="secondary"
          className="flex-1 justify-center gap-1.5"
        >
          {gateMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("phase5.recording")}</>
            : <><Rocket className="h-4 w-4" /> {t("phase5.recordManualDeployment")}</>}
        </Button>
      </div>

      {viewingPack && deployPackMd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setViewingPack(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("phase5.deployPackTitle", { storyId, titleSuffix: "" })}
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onKeyDown={(e) => { if (e.key === "Escape") setViewingPack(false); }}
            className={cn(
              "flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl outline-none",
              dark ? "border-neutral-700 bg-[#1b1b1c]" : "border-slate-200 bg-white",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
              <Rocket className="size-4 text-emerald-400" />
              <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                {t("phase5.deployPackTitle", { storyId, titleSuffix: ctx?.title ? `: ${ctx.title}` : "" })}
              </span>
              <button
                className={cn("rounded p-1 transition-colors", dark ? "text-neutral-500 hover:text-emerald-400" : "text-slate-400 hover:text-emerald-600")}
                title={t("phase5.download")}
                onClick={() => blobDownload(deployPackMd, `deploy-pack-us${storyId}.md`)}
              >
                <Download className="size-4" />
              </button>
              <button
                className={cn("rounded p-1 transition-colors", dark ? "text-neutral-500 hover:text-emerald-400" : "text-slate-400 hover:text-emerald-600")}
                title={t("common.copy")}
                onClick={() => { void navigator.clipboard.writeText(deployPackMd); toast.success(t("common.copied")); }}
              >
                <Copy className="size-4" />
              </button>
              <button
                className={cn("rounded p-1 transition-colors", dark ? "text-neutral-500 hover:text-red-400" : "text-slate-400 hover:text-red-500")}
                title={t("phase5.close")}
                onClick={() => setViewingPack(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <MarkdownPreview content={deployPackMd} dark={dark} className="border-0 !bg-transparent !p-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — Phase5Workflow
// ---------------------------------------------------------------------------

type Stage = "A" | "B" | "C" | "D";

const STAGE_LABEL_KEYS: Record<Stage, TranslationKey> = {
  A: "phase5.stage.selectStory",
  B: "phase5.stage.preFlight",
  C: "phase5.stage.deployPack",
  D: "phase5.stage.deploymentGate",
};

export function Phase5Workflow() {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const [stage, setStage] = useState<Stage>("A");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const selectedStoryId = usePhase5Store((s) => s.selectedStoryId);
  const currentStoryMeta = usePhase5Store((s) => s.currentStoryMeta);
  const setSelectedStoryId = usePhase5Store((s) => s.setSelectedStoryId);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);

  const mutedClass = dark ? "text-neutral-400" : "text-slate-600";

  const handleSelect = (id: number) => {
    setSelectedStoryId(id);
    setStage("B");
  };

  const handleNewStory = () => {
    clearPhase5Draft();
    setStage("A");
  };

  const handleStepperGoA = () => {
    if (stage !== "A" && !window.confirm(t("phase5.confirmGoStories"))) return;
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
        <p className={cn("mb-1 text-xs font-bold uppercase tracking-widest", dark ? "text-violet-400" : "text-violet-600")}>{t("common.phaseEyebrow", { n: 5 })}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("phase5.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          {t("phase5.subtitle")}
        </p>
      </div>

      {!context ? <SignInRequired unlocks={t("phase5.signInUnlocks")} /> : null}

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
            <img
              src="/images/deployment.svg"
              alt={t("phase5.diagramAlt")}
              className="mx-auto max-w-full"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
        )}
      </div>

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
            {stage === "A" && context && <StageA onSelect={handleSelect} />}
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
