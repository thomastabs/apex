"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Callout, SectionHeading } from "@/components/ui/primitives";
import { getAnalyticsSummary, type AnalyticsSummary } from "@/lib/api/analytics";
import { useApiContext } from "@/lib/stores/session-store";
import { SignInRequired } from "@/components/sign-in-required";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  gherkin_locked: "Gherkin locked",
  design_locked: "Design locked",
  implementation: "Implementation",
  qa: "QA",
  qa_passed: "QA passed",
  deployed: "Deployed",
};

function useAnalyticsSummary() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["analytics", "summary", context?.projectId],
    queryFn: () => getAnalyticsSummary(context!),
    enabled: Boolean(context),
  });
}

function blobDownload(content: string, filename: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(data: AnalyticsSummary): string {
  const lines = ["story_id,title,epic,phase_status,fix_bolt_count,total_cycle_hours,artifact_complete,risk_level,risk_score"];
  for (const s of data.stories) {
    const title = `"${s.title.replaceAll('"', '""')}"`;
    const epic = `"${s.epic_title.replaceAll('"', '""')}"`;
    lines.push(
      `${s.story_id},${title},${epic},${s.phase_status},${s.fix_bolt_count},${s.total_cycle_hours ?? ""},${s.artifact_complete},${s.risk.level},${s.risk.score}`,
    );
  }
  return lines.join("\n");
}

function toMarkdown(data: AnalyticsSummary): string {
  const lines = [
    "# Apex Governance Analytics",
    "",
    "## Funnel",
    "",
    ...Object.entries(data.funnel).map(([k, v]) => `- ${STATUS_LABELS[k] ?? k}: ${v}`),
    "",
    "## Cycle Times",
    "",
    "| Transition | Median (h) | p90 (h) | Samples |",
    "|---|---|---|---|",
    ...data.cycle_times.map((c) => `| ${c.transition} | ${c.median_hours} | ${c.p90_hours} | ${c.samples} |`),
    "",
    "## Context Traceability Rate",
    "",
    `${data.traceability.complete}/${data.traceability.deployed} deployed stories with a complete artifact chain (${Math.round(data.traceability.rate * 100)}%).`,
    "",
    "## Spec Conformance Rate",
    "",
    `${data.conformance.checked}/${data.conformance.eligible} implemented stories checked against spec; average conformance score ${Math.round(data.conformance.avg_score)}%.`,
    "",
    "## Defect Proxy (Fix-Bolts)",
    "",
    `Total Fix-Bolts: ${data.defects.total_fix_bolts} · stories affected: ${data.defects.stories_affected} · avg/story: ${data.defects.avg_per_story}`,
    "",
    "## Stories",
    "",
    "| Story | Risk | Status | Fix-Bolts | Cycle (h) | Artifacts complete |",
    "|---|---|---|---|---|---|",
    ...[...data.stories]
      .sort((a, b) => b.risk.score - a.risk.score || a.story_id - b.story_id)
      .map((s) =>
        `| US#${s.story_id} ${s.title} | ${s.risk.level}${s.risk.reasons.length ? ` (${s.risk.reasons.join("; ")})` : ""} | ${s.phase_status} | ${s.fix_bolt_count} | ${s.total_cycle_hours ?? "—"} | ${s.artifact_complete ? "yes" : "no"} |`,
      ),
    "",
  ];
  return lines.join("\n");
}

function MetricCard({ label, value, hint, dark }: { label: string; value: string; hint?: string; dark: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-white shadow-sm")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", dark ? "text-white" : "text-slate-900")}>{value}</p>
      {hint && <p className={cn("mt-1 text-xs", dark ? "text-neutral-500" : "text-slate-400")}>{hint}</p>}
    </div>
  );
}

export function AnalyticsDashboard() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const { data, isLoading, error } = useAnalyticsSummary();

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Governance</p>
        <h1 className={cn("text-2xl font-bold tracking-tight", dark ? "text-white" : "text-slate-900")}>
          Analytics
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          Core governance metrics: cycle time per gate, context traceability rate, and the Fix-Bolt defect proxy.
        </p>
      </div>

      {!context && <SignInRequired unlocks="the governance analytics" />}

      {isLoading && (
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing metrics…
        </div>
      )}
      {error != null && <Callout>Failed to load analytics: {errMsg(error)}</Callout>}

      {data && (
        <div className="space-y-8">
          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              dark={dark}
              label="Context Traceability Rate"
              value={data.traceability.deployed > 0 ? `${Math.round(data.traceability.rate * 100)}%` : "—"}
              hint={`${data.traceability.complete}/${data.traceability.deployed} deployed stories with a complete artifact chain`}
            />
            <MetricCard
              dark={dark}
              label="Spec Conformance Rate"
              value={data.conformance.checked > 0 ? `${Math.round(data.conformance.avg_score)}%` : "—"}
              hint={`${data.conformance.checked}/${data.conformance.eligible} implemented stories checked against spec`}
            />
            <MetricCard
              dark={dark}
              label="Fix-Bolts (defect proxy)"
              value={String(data.defects.total_fix_bolts)}
              hint={`${data.defects.stories_affected} stories affected · ${data.defects.avg_per_story} avg/story`}
            />
            <MetricCard
              dark={dark}
              label="Stories tracked"
              value={String(data.stories.length)}
              hint={`${data.funnel.deployed ?? 0} deployed`}
            />
          </div>

          {/* Funnel */}
          <div>
            <SectionHeading>Phase funnel</SectionHeading>
            <div className="mt-3 space-y-2">
              {Object.entries(data.funnel).map(([status, count]) => {
                const max = Math.max(1, ...Object.values(data.funnel));
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className={cn("w-36 shrink-0 text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500")}>
                      {STATUS_LABELS[status] ?? status}
                    </span>
                    <div className={cn("h-5 flex-1 rounded", dark ? "bg-neutral-900" : "bg-slate-100")}>
                      <div
                        className="h-5 rounded bg-violet-600 transition-all"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className={cn("w-8 text-right text-sm font-semibold", dark ? "text-neutral-200" : "text-slate-700")}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cycle times */}
          <div>
            <SectionHeading>Cycle time per gate transition</SectionHeading>
            {data.cycle_times.length === 0 ? (
              <p className={cn("mt-2 text-sm", mutedClass)}>
                No transitions recorded yet — timestamps accrue as stories move through the gates.
              </p>
            ) : (
              <div className={cn("mt-3 overflow-x-auto rounded-lg border", dark ? "border-neutral-700" : "border-slate-200")}>
                <table className="min-w-[40rem] w-full text-sm">
                  <thead>
                    <tr className={cn("text-left text-xs uppercase tracking-wider", dark ? "bg-neutral-900 text-neutral-500" : "bg-slate-50 text-slate-400")}>
                      <th className="px-4 py-2.5 font-semibold">Transition</th>
                      <th className="px-4 py-2.5 font-semibold">Median (h)</th>
                      <th className="px-4 py-2.5 font-semibold">p90 (h)</th>
                      <th className="px-4 py-2.5 font-semibold">Samples</th>
                    </tr>
                  </thead>
                  <tbody className={cn("divide-y", dark ? "divide-neutral-800" : "divide-slate-100")}>
                    {data.cycle_times.map((c) => (
                      <tr key={c.transition}>
                        <td className={cn("px-4 py-2.5 font-mono text-xs", dark ? "text-neutral-300" : "text-slate-600")}>{c.transition}</td>
                        <td className={cn("px-4 py-2.5", dark ? "text-neutral-200" : "text-slate-700")}>{c.median_hours}</td>
                        <td className={cn("px-4 py-2.5", dark ? "text-neutral-200" : "text-slate-700")}>{c.p90_hours}</td>
                        <td className={cn("px-4 py-2.5", mutedClass)}>{c.samples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Story drill-down */}
          <div>
            <SectionHeading>Per-story drill-down</SectionHeading>
            <div className={cn("mt-3 overflow-x-auto rounded-lg border", dark ? "border-neutral-700" : "border-slate-200")}>
              <table className="min-w-[58rem] w-full text-sm">
                <thead>
                  <tr className={cn("text-left text-xs uppercase tracking-wider", dark ? "bg-neutral-900 text-neutral-500" : "bg-slate-50 text-slate-400")}>
                    <th className="px-4 py-2.5 font-semibold">Story</th>
                    <th className="px-4 py-2.5 font-semibold">Risk</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Fix-Bolts</th>
                    <th className="px-4 py-2.5 font-semibold">Cycle (h)</th>
                    <th className="px-4 py-2.5 font-semibold">Artifacts</th>
                  </tr>
                </thead>
                <tbody className={cn("divide-y", dark ? "divide-neutral-800" : "divide-slate-100")}>
                  {[...data.stories]
                    .sort((a, b) => b.risk.score - a.risk.score || a.story_id - b.story_id)
                    .map((s) => (
                    <tr key={s.story_id}>
                      <td className="px-4 py-2.5">
                        <span className={cn("mr-2 rounded px-1.5 py-0.5 text-xs font-mono font-bold", dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700")}>
                          US#{s.story_id}
                        </span>
                        <span className={dark ? "text-neutral-200" : "text-slate-700"}>{s.title}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {s.risk.level === "none" ? (
                          <span className={mutedClass}>—</span>
                        ) : (
                          <span
                            title={s.risk.reasons.join(" · ")}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-semibold capitalize",
                              s.risk.level === "high"
                                ? dark ? "bg-red-900/40 text-red-400" : "bg-red-100 text-red-700"
                                : s.risk.level === "medium"
                                  ? dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700"
                                  : dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500",
                            )}
                          >
                            {s.risk.level}
                          </span>
                        )}
                      </td>
                      <td className={cn("px-4 py-2.5 text-xs", dark ? "text-neutral-400" : "text-slate-500")}>
                        {STATUS_LABELS[s.phase_status] ?? s.phase_status}
                      </td>
                      <td className={cn("px-4 py-2.5", s.fix_bolt_count > 0 ? "text-amber-500 font-semibold" : mutedClass)}>
                        {s.fix_bolt_count}
                      </td>
                      <td className={cn("px-4 py-2.5", dark ? "text-neutral-300" : "text-slate-600")}>
                        {s.total_cycle_hours ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.phase_status === "deployed" ? (
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-xs font-semibold",
                            s.artifact_complete
                              ? dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700"
                              : dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
                          )}>
                            {s.artifact_complete ? "complete" : "incomplete"}
                          </span>
                        ) : (
                          <span className={mutedClass}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="gap-1.5"
              onClick={() => { blobDownload(toCsv(data), "apex-analytics.csv", "text/csv"); toast.success("CSV exported."); }}
            >
              <BarChart3 className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => { blobDownload(toMarkdown(data), "apex-analytics.md", "text/markdown"); toast.success("Markdown exported."); }}
            >
              Export Markdown
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
