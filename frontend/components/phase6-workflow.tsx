"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GitCompareArrows, Loader2, RefreshCw, Zap } from "lucide-react";
import { Button, Callout, SectionHeading } from "@/components/ui/primitives";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  useConformanceEligibleStories,
  useConformanceReport,
  useVerifyConformance,
} from "@/lib/hooks/use-phase6";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import type {
  ConformanceEligibleStory,
  ConformanceReport,
} from "@/lib/api/types";

const STATUS_STYLE: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  tested: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  addressed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  mismatch: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  partial: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  missing: "bg-red-500/15 text-red-600 dark:text-red-400",
  untested: "bg-red-500/15 text-red-600 dark:text-red-400",
  not_found: "bg-red-500/15 text-red-600 dark:text-red-400",
  unknown: "bg-slate-500/15 text-slate-500 dark:text-slate-400",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLE[status] ?? STATUS_STYLE.unknown,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ScoreBadge({ score, dark }: { score: number; dark: boolean }) {
  const tone =
    score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-baseline gap-1">
      <span className={cn("text-3xl font-bold tabular-nums", tone)}>{score}</span>
      <span className={cn("text-sm", dark ? "text-neutral-500" : "text-slate-400")}>/100</span>
    </div>
  );
}

function ReportTables({ report, dark }: { report: ConformanceReport; dark: boolean }) {
  const cellBorder = dark ? "border-neutral-800" : "border-slate-200";
  const muted = dark ? "text-neutral-500" : "text-slate-400";

  const section = (title: string, rows: React.ReactNode, count: number) => (
    <div className="space-y-2">
      <h4 className={cn("text-sm font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>
        {title} <span className={muted}>({count})</span>
      </h4>
      {count === 0 ? (
        <p className={cn("text-xs italic", muted)}>None in spec.</p>
      ) : (
        <div className={cn("overflow-hidden rounded-lg border", cellBorder)}>
          <table className="w-full text-left text-xs">
            <tbody>{rows}</tbody>
          </table>
        </div>
      )}
    </div>
  );

  const row = (key: string, label: string, status: string, detail: string, loc: string) => (
    <tr key={key} className={cn("border-b last:border-0", cellBorder)}>
      <td className="w-24 px-3 py-2 align-top">
        <StatusPill status={status} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className={dark ? "text-neutral-200" : "text-slate-800"}>{label}</div>
        {loc ? (
          <div className={cn("mt-0.5 font-mono text-[11px]", muted)}>{loc}</div>
        ) : null}
        {detail ? (
          <div className={cn("mt-0.5 text-[11px]", muted)}>{detail}</div>
        ) : null}
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      {section(
        "Endpoint contracts",
        report.endpoints.map((e, i) =>
          row(`e${i}`, e.contract, e.status, e.notes, e.location),
        ),
        report.endpoints.length,
      )}
      {section(
        "Behavioural scenarios",
        report.scenarios.map((s, i) =>
          row(`s${i}`, s.scenario, s.status, s.notes, s.test_location),
        ),
        report.scenarios.length,
      )}
      {section(
        "Non-functional constraints (advisory)",
        report.constraints.map((c, i) =>
          row(`c${i}`, c.constraint_id, c.status, c.evidence, ""),
        ),
        report.constraints.length,
      )}
    </div>
  );
}

export function Phase6Workflow() {
  const context = useApiContext();
  const dark = useUiStore((s) => s.theme) === "dark";
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const eligible = useConformanceEligibleStories();
  const reportQuery = useConformanceReport(selectedId);
  const verify = useVerifyConformance();

  const stories = useMemo(() => eligible.data?.stories ?? [], [eligible.data]);

  // Auto-select the first eligible story once loaded.
  useEffect(() => {
    if (selectedId === null && stories.length > 0) {
      setSelectedId(stories[0].story_id);
    }
  }, [stories, selectedId]);

  if (!context) {
    return (
      <div className="p-8">
        <Callout>Sign in and select a project to run a conformance check.</Callout>
      </div>
    );
  }

  const report = reportQuery.data ?? null;

  function runVerify(ai: boolean) {
    if (selectedId === null) return;
    verify.mutate(
      { storyId: selectedId, ai },
      {
        onError: (err) => toast.error(errMsg(err)),
        onSuccess: () => toast.success(ai ? "Conformance verified" : "Layer-A baseline computed"),
      },
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="h-5 w-5 text-violet-500" />
        <SectionHeading>Traceability Explorer — Spec↔Code Conformance</SectionHeading>
      </div>
      <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-600")}>
        Verify shipped code against the locked spec. A deterministic Layer-A pass locates
        endpoints and tests; the AI layer confirms each contract is honoured and flags drift.
        The score is computed from the findings — never by the AI.
      </p>

      {eligible.isLoading ? (
        <Callout>Loading stories…</Callout>
      ) : stories.length === 0 ? (
        <Callout>
          No stories are at <code>implementation</code> or later yet. Implement a story to run a
          conformance check.
        </Callout>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
          {/* Story list */}
          <div className="space-y-1">
            {stories.map((s: ConformanceEligibleStory) => (
              <button
                key={s.story_id}
                onClick={() => setSelectedId(s.story_id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                  selectedId === s.story_id
                    ? "border-violet-500 bg-violet-500/10"
                    : dark
                      ? "border-neutral-800 hover:bg-neutral-900"
                      : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate", dark ? "text-neutral-200" : "text-slate-800")}>
                    #{s.story_id} {s.title}
                  </span>
                  <span className={cn("block truncate text-[11px]", dark ? "text-neutral-500" : "text-slate-400")}>
                    {s.epic_title} · {s.phase_status}
                  </span>
                </span>
                {s.has_conformance && s.score !== null ? (
                  <span
                    className={cn(
                      "ml-2 shrink-0 text-xs font-bold tabular-nums",
                      s.score >= 80 ? "text-emerald-500" : s.score >= 50 ? "text-amber-500" : "text-red-500",
                    )}
                  >
                    {s.score}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Report panel */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {report ? (
                  <ScoreBadge score={report.score} dark={dark} />
                ) : (
                  <span className={cn("text-sm", dark ? "text-neutral-500" : "text-slate-400")}>
                    No report yet.
                  </span>
                )}
                {report?.generated_at ? (
                  <div className={cn("text-[11px]", dark ? "text-neutral-600" : "text-slate-400")}>
                    {report.layer === "ai" ? "AI-verified" : "Layer-A only"} ·{" "}
                    {report.generated_at.slice(0, 16).replace("T", " ")}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => runVerify(false)}
                  disabled={verify.isPending || selectedId === null}
                  title="Deterministic baseline — no AI"
                >
                  <Zap className="h-4 w-4" /> Layer A
                </Button>
                <Button
                  onClick={() => runVerify(true)}
                  disabled={verify.isPending || selectedId === null}
                >
                  {verify.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {report ? "Re-verify" : "Verify"}
                </Button>
              </div>
            </div>

            {verify.isPending ? (
              <AIProgressIndicator
                steps={["Parsing spec", "Probing code", "Semantic verification", "Scoring"]}
                isPending={verify.isPending}
                dark={dark}
              />
            ) : null}

            {report?.summary ? (
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  dark ? "border-neutral-800 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700",
                )}
              >
                {report.summary}
              </div>
            ) : null}

            {reportQuery.isLoading ? (
              <Callout>Loading report…</Callout>
            ) : report ? (
              <ReportTables report={report} dark={dark} />
            ) : (
              <Callout>
                Run a check to compare story #{selectedId} against its spec. Tip: sync GitHub first
                so there is code to check against.
              </Callout>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
