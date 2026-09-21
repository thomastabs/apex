"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ChevronRight, Download, GitBranch, Info, Loader2, RefreshCw, Scale, TrendingDown, Zap } from "lucide-react";
import { CancelButton } from "@/components/ui/cancel-button";
import { Button, Callout, Input, SectionHeading } from "@/components/ui/primitives";
import { MaintenanceTriage } from "@/components/maintenance-triage";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import {
  useConformanceEligibleStories,
  useConformanceReport,
  useScanRegressions,
  useVerifyConformance,
} from "@/lib/hooks/use-phase6";
import { useApiContext, useGithubContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, errMsg } from "@/lib/utils";
import type {
  ConformanceEligibleStory,
  ConformanceReport,
  ScanReport,
} from "@/lib/api/types";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";
import { useGroundingFiles } from "@/lib/hooks/use-grounding-files";
import { getAllConformanceReports } from "@/lib/api/phase6";

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

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  present: "phase6.status.present",
  tested: "phase6.status.tested",
  addressed: "phase6.status.addressed",
  mismatch: "phase6.status.mismatch",
  partial: "phase6.status.partial",
  missing: "phase6.status.missing",
  untested: "phase6.status.untested",
  not_found: "phase6.status.notFound",
  unknown: "phase6.status.unknown",
};

function blobDownload(content: string, filename: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// English-only, same as Analytics' own export - data artifacts stay
// locale-independent regardless of the UI language.

const csvEsc = (s: string) => `"${s.replaceAll('"', '""')}"`;

// Flat kind/ref/status/location/notes rows for one report - shared by both
// the single-story CSV and the all-stories one.
function reportFindingRows(report: ConformanceReport) {
  return [
    ...report.endpoints.map((e) => ({ kind: "endpoint", ref: e.contract, status: e.status, loc: e.location, notes: e.notes })),
    ...report.scenarios.map((sc) => ({ kind: "scenario", ref: sc.scenario, status: sc.status, loc: sc.test_location, notes: sc.notes })),
    ...report.constraints.map((c) => ({ kind: "constraint", ref: c.constraint_id, status: c.status, loc: "", notes: c.evidence })),
  ];
}

function toSingleReportCsv(report: ConformanceReport): string {
  const lines = ["kind,ref,status,location,notes"];
  for (const r of reportFindingRows(report)) {
    lines.push(`${r.kind},${csvEsc(r.ref)},${r.status},${csvEsc(r.loc)},${csvEsc(r.notes)}`);
  }
  return lines.join("\n");
}

// Every eligible story's full report, not just the one currently selected -
// one row per finding across all stories checked so far, joined against the
// eligible-stories list so a never-verified story still shows up with its
// status and an empty score, rather than being silently dropped.
function toConformanceCsv(stories: ConformanceEligibleStory[], allReports: ConformanceReport[]): string {
  const byId = new Map(allReports.map((r) => [r.story_id, r]));
  const lines = ["story_id,title,epic,phase_status,score,kind,ref,status,location,notes"];
  for (const s of stories) {
    const report = byId.get(s.story_id);
    const base = `${s.story_id},${csvEsc(s.title)},${csvEsc(s.epic_title)},${s.phase_status},${report?.score ?? ""}`;
    const rows = report ? reportFindingRows(report) : [];
    if (rows.length === 0) {
      lines.push(`${base},,,,`);
      continue;
    }
    for (const r of rows) {
      lines.push(`${base},${r.kind},${csvEsc(r.ref)},${r.status},${csvEsc(r.loc)},${csvEsc(r.notes)}`);
    }
  }
  return lines.join("\n");
}

// Header + summary + the three finding tables for one report - shared by
// both the single-story Markdown export and the all-stories one.
function reportMarkdownSection(report: ConformanceReport, headingLevel: "##" | "#"): string[] {
  const lines = [
    `${headingLevel} US#${report.story_id} ${report.title}`,
    "",
    `Epic: ${report.epic_title} - Score: ${report.score}/100 - Layer: ${report.layer} - Generated: ${report.generated_at.slice(0, 16).replace("T", " ")}`,
    "",
  ];
  if (report.summary) lines.push(report.summary, "");

  const section = (heading: string, rows: { label: string; status: string; loc: string; detail: string }[]) => {
    lines.push(`${headingLevel}### ${heading} (${rows.length})`, "");
    if (rows.length === 0) {
      lines.push("None in spec.", "");
      return;
    }
    lines.push("| Status | Item | Notes |", "|---|---|---|");
    for (const r of rows) {
      lines.push(`| ${r.status} | ${r.label}${r.loc ? ` (${r.loc})` : ""} | ${r.detail.replaceAll("\n", " ")} |`);
    }
    lines.push("");
  };

  section("Endpoint Contracts", report.endpoints.map((e) => ({ label: e.contract, status: e.status, loc: e.location, detail: e.notes })));
  section("Behavioural Scenarios", report.scenarios.map((sc) => ({ label: sc.scenario, status: sc.status, loc: sc.test_location, detail: sc.notes })));
  section("Constraints (Advisory)", report.constraints.map((c) => ({ label: c.constraint_id, status: c.status, loc: "", detail: c.evidence })));
  return lines;
}

function toSingleReportMarkdown(report: ConformanceReport): string {
  return [
    "# Apex Spec Drift - Code Conformance",
    "",
    ...reportMarkdownSection(report, "#"),
  ].join("\n");
}

function toConformanceMarkdown(
  stories: ConformanceEligibleStory[],
  allReports: ConformanceReport[],
  scanReport: ScanReport | null,
): string {
  const byId = new Map(allReports.map((r) => [r.story_id, r]));
  const lines = [
    "# Apex Spec Drift - Code Conformance",
    "",
    "## Stories",
    "",
    "| Story | Epic | Status | Checked | Score |",
    "|---|---|---|---|---|",
    ...stories.map((s) =>
      `| US#${s.story_id} ${s.title} | ${s.epic_title} | ${s.phase_status} | ${s.has_conformance ? "yes" : "no"} | ${s.score ?? "-"} |`,
    ),
    "",
  ];

  for (const s of stories) {
    const report = byId.get(s.story_id);
    if (!report) continue;
    lines.push(...reportMarkdownSection(report, "##"));
  }

  const unverified = stories.filter((s) => !byId.has(s.story_id));
  if (unverified.length > 0) {
    lines.push(
      "## Not Yet Verified",
      "",
      ...unverified.map((s) => `- US#${s.story_id} ${s.title} (${s.phase_status})`),
      "",
    );
  }

  if (scanReport) {
    lines.push(
      "## Regression Scan",
      "",
      `${scanReport.regressed_ids.length}/${scanReport.results.length} stories regressed.`,
      "",
      "| Story | Old Score | New Score | Regressed | Worsened |",
      "|---|---|---|---|---|",
      ...scanReport.results.map((r) =>
        `| US#${r.story_id} ${r.title} | ${r.old_score ?? "-"} | ${r.new_score} | ${r.regressed ? "yes" : "no"} | ${r.worsened_rows.map((w) => `${w.kind} ${w.ref}: ${w.old_status}->${w.new_status}`).join("; ")} |`,
      ),
      "",
    );
  }

  return lines.join("\n");
}

const LOOP_CARDS: {
  icon: typeof TrendingDown;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  metaKey: TranslationKey;
}[] = [
  {
    icon: TrendingDown,
    titleKey: "phase6.loop.detect.title",
    descKey: "phase6.loop.detect.desc",
    metaKey: "phase6.loop.detect.meta",
  },
  {
    icon: Scale,
    titleKey: "phase6.loop.classify.title",
    descKey: "phase6.loop.classify.desc",
    metaKey: "phase6.loop.classify.meta",
  },
  {
    icon: GitBranch,
    titleKey: "phase6.loop.route.title",
    descKey: "phase6.loop.route.desc",
    metaKey: "phase6.loop.route.meta",
  },
];

function StatusPill({ status }: { status: string }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLE[status] ?? STATUS_STYLE.unknown,
      )}
    >
      {STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status.replace(/_/g, " ")}
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
  const t = useT();
  const cellBorder = dark ? "border-neutral-800" : "border-slate-200";
  const muted = dark ? "text-neutral-500" : "text-slate-400";

  const section = (title: string, rows: React.ReactNode, count: number) => (
    <div className="space-y-2">
      <h4 className={cn("text-sm font-semibold", dark ? "text-neutral-300" : "text-slate-700")}>
        {title} <span className={muted}>({count})</span>
      </h4>
      {count === 0 ? (
        <p className={cn("text-xs italic", muted)}>{t("phase6.noneInSpec")}</p>
      ) : (
        <div className={cn("overflow-x-auto rounded-lg border", cellBorder)}>
          <table className="w-full text-left text-xs">
            <tbody>{rows}</tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Index the panel verdicts (when present) by kind+ref so a row can show whether
  // the Prosecutor/Defender/Judge panel reached it and agreed.
  const verdicts = new Map(
    (report.panel_meta?.rows ?? []).map((v) => [`${v.kind}:${v.ref}`, v]),
  );

  const row = (
    key: string, kind: string, label: string, status: string,
    detail: string, loc: string,
  ) => {
    const v = verdicts.get(`${kind}:${label}`);
    return (
      <tr key={key} className={cn("border-b last:border-0", cellBorder)}>
        <td className="w-24 px-3 py-2 align-top">
          <StatusPill status={status} />
          {v ? (
            <span
              title={v.rationale || t("phase6.reconciledByPanel")}
              className={cn(
                "mt-1 block w-fit rounded px-1 text-xs font-semibold",
                v.agreement === "unanimous"
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-amber-500/15 text-amber-500",
              )}
            >
              {v.agreement === "unanimous" ? t("phase6.unanimous") : t("phase6.split")}
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2 align-top">
          <div className={cn("break-words", dark ? "text-neutral-200" : "text-slate-800")}>{label}</div>
          {loc ? (
            <div className={cn("mt-0.5 break-words font-mono text-xs", muted)}>{loc}</div>
          ) : null}
          {detail ? (
            <div className={cn("mt-0.5 break-words text-xs", muted)}>{detail}</div>
          ) : null}
          {v?.rationale ? (
            <div className={cn("mt-0.5 text-xs italic", muted)}>{t("phase6.judgePrefix")}{v.rationale}</div>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      {section(
        t("phase6.endpointContracts"),
        report.endpoints.map((e, i) =>
          row(`e${i}`, "endpoint", e.contract, e.status, e.notes, e.location),
        ),
        report.endpoints.length,
      )}
      {section(
        t("phase6.behaviouralScenarios"),
        report.scenarios.map((s, i) =>
          row(`s${i}`, "scenario", s.scenario, s.status, s.notes, s.test_location),
        ),
        report.scenarios.length,
      )}
      {section(
        t("phase6.constraintsAdvisory"),
        report.constraints.map((c, i) =>
          row(`c${i}`, "constraint", c.constraint_id, c.status, c.evidence, ""),
        ),
        report.constraints.length,
      )}
    </div>
  );
}

function ScanResults({ report, dark }: { report: ScanReport; dark: boolean }) {
  const t = useT();
  const border = dark ? "border-neutral-800" : "border-slate-200";
  const muted = dark ? "text-neutral-500" : "text-slate-400";
  return (
    <div className={cn("space-y-2 rounded-lg border p-3", border)}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <TrendingDown className={cn("h-4 w-4", report.regressed_ids.length ? "text-red-500" : muted)} />
        {t("phase6.regressionScan", { regressed: report.regressed_ids.length, checked: report.results.length })}
      </div>
      <div className={cn("overflow-hidden rounded-lg border", border)}>
        <table className="w-full text-left text-xs">
          <tbody>
            {report.results.map((r) => (
              <tr key={r.story_id} className={cn("border-b last:border-0", border)}>
                <td className="w-16 px-3 py-2 align-top">
                  {r.regressed ? (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-500">{t("phase6.regressed")}</span>
                  ) : (
                    <span className={cn("rounded px-1.5 py-0.5 font-semibold", muted)}>{t("phase6.ok")}</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className={dark ? "text-neutral-200" : "text-slate-800"}>
                    #{r.story_id} {r.title}
                    <span className={cn("ml-2 font-mono", muted)}>
                      {r.old_score ?? "—"}→{r.new_score}
                    </span>
                  </div>
                  {r.worsened_rows.length > 0 ? (
                    <ul className={cn("mt-0.5 text-xs", muted)}>
                      {r.worsened_rows.map((w, i) => (
                        <li key={i}>
                          {w.kind} <span className="font-mono">{w.ref}</span>: {w.old_status}→{w.new_status}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Phase6LoopSummary({ dark }: { dark: boolean }) {
  const t = useT();
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {LOOP_CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.titleKey}
            className={cn(
              "rounded-md border p-4",
              dark ? "border-neutral-800 bg-neutral-950/60" : "border-slate-200 bg-white",
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("rounded-md p-1.5", dark ? "bg-violet-500/15 text-violet-300" : "bg-violet-50 text-violet-600")}>
                <Icon className="h-4 w-4" />
              </span>
              <p className={cn("text-sm font-bold", dark ? "text-neutral-100" : "text-slate-900")}>
                {t(card.titleKey)}
              </p>
            </div>
            <p className={cn("mt-2 text-xs leading-relaxed", dark ? "text-neutral-400" : "text-slate-600")}>
              {t(card.descKey)}
            </p>
            <p className={cn("mt-3 flex items-center gap-1 text-xs font-semibold", dark ? "text-violet-300" : "text-violet-600")}>
              {t(card.metaKey)} <ArrowRight className="h-3 w-3" />
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TraceabilityPanel() {
  const t = useT();
  const context = useApiContext();
  const github = useGithubContext();
  const dark = useUiStore((s) => s.theme) === "dark";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [supPath, setSupPath] = useState("");
  const [fetching, setFetching] = useState(false);

  const eligible = useConformanceEligibleStories();
  const reportQuery = useConformanceReport(selectedId);
  const verify = useVerifyConformance();
  const scan = useScanRegressions();
  const [scanReport, setScanReport] = useState<ScanReport | null>(null);
  const [exportingReports, setExportingReports] = useState<"csv" | "markdown" | null>(null);
  const [conformanceExtraContext, setConformanceExtraContext] = useState<string[]>([]);
  const availableGroundingFiles = useGroundingFiles();

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
        <Callout variant="warning">{t("phase6.signInForConformance")}</Callout>
      </div>
    );
  }

  const report = reportQuery.data ?? null;

  function runVerify(ai: boolean, panel = false) {
    if (selectedId === null) return;
    verify.mutate({ storyId: selectedId, ai, panel, extraContextFiles: conformanceExtraContext });
  }

  function runScan() {
    scan.mutate(
      { panel: false, extraContextFiles: conformanceExtraContext },
      { onSuccess: (report: ScanReport) => setScanReport(report) },
    );
  }

  // Fetches every eligible story's full saved report on demand (not kept warm
  // like the score-only summary), so the export always reflects everything
  // checked so far - not just whichever story happens to be selected.
  async function exportAllReports(kind: "csv" | "markdown") {
    if (!context) return;
    setExportingReports(kind);
    try {
      const { reports: allReports } = await getAllConformanceReports(context);
      if (kind === "csv") {
        blobDownload(toConformanceCsv(stories, allReports), "apex-spec-drift.csv", "text/csv");
        toast.success(t("phase6.toast.csvExported"));
      } else {
        blobDownload(toConformanceMarkdown(stories, allReports, scanReport), "apex-spec-drift.md", "text/markdown");
        toast.success(t("phase6.toast.markdownExported"));
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExportingReports(null);
    }
  }

  // The selected story's own already-loaded report - no fetch needed.
  function exportSingleReport(kind: "csv" | "markdown") {
    if (!report) return;
    if (kind === "csv") {
      blobDownload(toSingleReportCsv(report), `apex-spec-drift-us${report.story_id}.csv`, "text/csv");
    } else {
      blobDownload(toSingleReportMarkdown(report), `apex-spec-drift-us${report.story_id}.md`, "text/markdown");
    }
    toast.success(t(kind === "csv" ? "phase6.toast.csvExported" : "phase6.toast.markdownExported"));
  }

  // #1 v2: fetch a single file and re-verify with it in context — resolves `unknown` rows.
  async function fetchAndReverify() {
    if (selectedId === null || !supPath.trim() || !github) return;
    setFetching(true);
    try {
      const { fetchGithubFile } = await import("@/lib/api/github-browser");
      const content = await fetchGithubFile(github, supPath.trim());
      if (!content) { toast.error(t("phase6.toast.fileEmpty")); return; }
      verify.mutate(
        {
          storyId: selectedId,
          ai: true,
          extraFiles: [{ path: supPath.trim(), content }],
          extraContextFiles: conformanceExtraContext,
        },
        { onSuccess: () => setSupPath("") },
      );
    } catch (e) { toast.error(errMsg(e)); } finally { setFetching(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading>{t("phase6.explorerHeading")}</SectionHeading>
          <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-600")}>
            {t("phase6.explorerDesc")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            className="gap-1.5"
            onClick={() => void exportAllReports("csv")}
            disabled={stories.length === 0 || exportingReports !== null}
            title={t("phase6.exportAllCsvTitle")}
          >
            {exportingReports === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("phase6.exportAllCsv")}
          </Button>
          <Button
            variant="secondary"
            className="gap-1.5"
            onClick={() => void exportAllReports("markdown")}
            disabled={stories.length === 0 || exportingReports !== null}
            title={t("phase6.exportAllMarkdownTitle")}
          >
            {exportingReports === "markdown" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("phase6.exportAllMarkdown")}
          </Button>
        </div>
      </div>

      {eligible.isLoading ? (
        <Callout>{t("common.loadingStories")}</Callout>
      ) : stories.length === 0 ? (
        <Callout>{t("phase6.noConformanceStories")}</Callout>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
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
                  <span className={cn("block truncate text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
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
                    {t("phase6.noReportYet")}
                  </span>
                )}
                {report?.generated_at ? (
                  <div className={cn("text-xs", dark ? "text-neutral-600" : "text-slate-400")}>
                    {report.layer === "panel"
                      ? `${t("phase6.panelVerified")}${report.panel_meta ? t(report.panel_meta.escalated === 1 ? "phase6.rowsEscalatedOne" : "phase6.rowsEscalatedOther", { n: report.panel_meta.escalated }) : ""}`
                      : report.layer === "ai"
                        ? t("phase6.aiVerified")
                        : t("phase6.quickCheckOnly")}{" "}
                    · {report.generated_at.slice(0, 16).replace("T", " ")}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => runVerify(false)}
                  disabled={verify.isPending || selectedId === null}
                  title={t("phase6.quickCheckTitle")}
                >
                  <Zap className="h-4 w-4" /> {t("phase6.quickCheckButton")}
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
                  {report ? t("phase6.reverify") : t("phase6.verify")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => runVerify(true, true)}
                  disabled={verify.isPending || selectedId === null}
                  title={t("phase6.deepVerifyTitle")}
                >
                  <Scale className="h-4 w-4" /> {t("phase6.deepVerifyButton")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={runScan}
                  disabled={scan.isPending || verify.isPending}
                  title={t("phase6.scanTitle")}
                >
                  {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
                  {t("phase6.scanButton")}
                </Button>
                {verify.isPending && <CancelButton onCancel={() => verify.cancel()} />}
                {scan.isPending && <CancelButton onCancel={() => scan.cancel()} />}
                <Button
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => exportSingleReport("csv")}
                  disabled={!report}
                  title={t("phase6.exportStoryCsvTitle")}
                >
                  <Download className="h-4 w-4" /> {t("phase6.exportCsv")}
                </Button>
                <Button
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => exportSingleReport("markdown")}
                  disabled={!report}
                  title={t("phase6.exportStoryMarkdownTitle")}
                >
                  <Download className="h-4 w-4" /> {t("phase6.exportMarkdown")}
                </Button>
              </div>
            </div>
            <AiGroundingNote
              files={AI_GROUNDING.phase6Conformance}
              dark={dark}
              availableFiles={availableGroundingFiles}
              selectedExtraFiles={conformanceExtraContext}
              onSelectedExtraFilesChange={setConformanceExtraContext}
            />

            {scan.isPending ? (
              <AIProgressIndicator
                steps={[
                  t("phase6.step.reverifyingStories"),
                  t("phase6.step.comparingToLast"),
                  t("phase6.step.flaggingRegressions"),
                ]}
                isPending={scan.isPending}
                dark={dark}
              />
            ) : null}

            {scanReport ? <ScanResults report={scanReport} dark={dark} /> : null}

            {verify.isPending ? (
              <AIProgressIndicator
                steps={[
                  t("phase6.step.parsingSpec"),
                  t("phase6.step.probingCode"),
                  t("phase6.step.semanticVerification"),
                  t("phase6.step.scoring"),
                ]}
                isPending={verify.isPending}
                dark={dark}
              />
            ) : null}

            {report?.summary ? (
              <div
                className={cn(
                  "break-words rounded-lg border p-3 text-sm",
                  dark ? "border-neutral-800 bg-neutral-950 text-neutral-300" : "border-slate-200 bg-slate-50 text-slate-700",
                )}
              >
                {report.summary}
              </div>
            ) : null}

            {reportQuery.isLoading ? (
              <Callout>{t("phase6.loadingReport")}</Callout>
            ) : report ? (
              <>
                <ReportTables report={report} dark={dark} />
                {github && [...report.endpoints, ...report.scenarios].some((r) => r.status === "unknown") ? (
                  <div className={cn("space-y-2 rounded-lg border p-3", dark ? "border-neutral-800" : "border-slate-200")}>
                    <p className="text-xs font-semibold">{t("phase6.resolveUnknownRows")}</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("phase6.filePathPlaceholder")}
                        value={supPath}
                        onChange={(e) => setSupPath(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={fetchAndReverify} disabled={fetching || verify.isPending || !supPath.trim()}>
                        {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("phase6.fetchAndReverify")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <Callout>
                {t("phase6.runCheckTip", { storyId: selectedId ?? "" })}
              </Callout>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Phase6Workflow() {
  const t = useT();
  const dark = useUiStore((s) => s.theme) === "dark";
  const [tab, setTab] = useState<"maintenance" | "traceability">("traceability");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const mutedClass = dark ? "text-neutral-400" : "text-slate-500";

  const steps: { key: "maintenance" | "traceability"; labelKey: TranslationKey }[] = [
    { key: "maintenance", labelKey: "phase6.tab.maintenance" },
    { key: "traceability", labelKey: "phase6.tab.traceability" },
  ];

  return (
    <section className="px-8 py-8">
      {/* Phase header */}
      <div className="mb-7">
        <p className={cn("mb-1 text-xs font-bold uppercase tracking-widest", dark ? "text-violet-400" : "text-violet-600")}>{t("common.phaseEyebrow", { n: 6 })}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("phase6.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          {t("phase6.subtitle")}
        </p>
      </div>

      <Phase6LoopSummary dark={dark} />

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
              src="/images/maintenance.svg"
              alt={t("phase6.diagramAlt")}
              className="mx-auto max-w-full"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
        )}
      </div>

      {/* Section tabs — Phase 6 is two parallel workspaces, not a step-by-step flow */}
      <div
        role="tablist"
        aria-label={t("phase6.tabsAria")}
        className={cn(
          "inline-flex gap-1 rounded-xl border p-1",
          dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-100",
        )}
      >
        {steps.map((s) => {
          const isActive = tab === s.key;
          return (
            <button
              key={s.key}
              id={`phase6-tab-${s.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={isActive ? `phase6-panel-${tab}` : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(s.key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                const idx = steps.findIndex((step) => step.key === s.key);
                const next = e.key === "ArrowRight" ? (idx + 1) % steps.length : (idx - 1 + steps.length) % steps.length;
                setTab(steps[next].key);
                document.getElementById(`phase6-tab-${steps[next].key}`)?.focus();
              }}
              className={cn(
                "rounded-lg px-5 py-2 text-sm font-semibold transition",
                isActive
                  ? "bg-violet-600 text-white"
                  : dark
                    ? "text-neutral-400 hover:text-neutral-200"
                    : "text-slate-500 hover:text-slate-800",
              )}
            >
              {t(s.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div
        id={`phase6-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`phase6-tab-${tab}`}
        className="mt-6"
      >
        {tab === "maintenance" ? <MaintenanceTriage /> : <TraceabilityPanel />}
      </div>
    </section>
  );
}
