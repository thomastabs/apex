"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Download, Loader2, Wand2 } from "lucide-react";
import { useImportBootstrap, useImportReconstructEpic } from "@/lib/hooks/use-import";
import type { ImportBootstrapResult, ImportEpicSummary, ImportReconstructResult } from "@/lib/api/import";
import { useQueryClient } from "@tanstack/react-query";

const APEX_STATUS_LABEL: Record<string, string> = {
  gherkin_locked: "Needs Phase 1",
  design_locked: "Phase 2 done",
  implementation: "In Development",
  qa: "In Testing",
  qa_passed: "QA Passed",
  deployed: "Deployed",
};

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "deployed" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
    : status === "qa" || status === "qa_passed" ? "text-blue-400 border-blue-500/40 bg-blue-500/10"
    : status === "implementation" ? "text-violet-400 border-violet-500/40 bg-violet-500/10"
    : "text-neutral-400 border-neutral-500/40 bg-neutral-500/10";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {APEX_STATUS_LABEL[status] ?? status}
    </span>
  );
}

type EpicRowProps = {
  epic: ImportEpicSummary;
  result: ImportReconstructResult | undefined;
  isReconstructing: boolean;
  onReconstruct: (epicId: number) => void;
};

function EpicRow({ epic, result, isReconstructing, onReconstruct }: EpicRowProps) {
  const [expanded, setExpanded] = useState(false);
  const done = result != null;
  const okCount = result?.results.filter((r) => r.status === "ok").length ?? 0;

  return (
    <div className="rounded-md border border-neutral-700/50 bg-neutral-800/30">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
          disabled={!done}
        >
          {done ? (
            expanded ? <ChevronDown className="size-3.5 shrink-0 text-neutral-500" /> : <ChevronRight className="size-3.5 shrink-0 text-neutral-500" />
          ) : null}
          <span className="text-sm font-medium text-neutral-200">{epic.title}</span>
          <span className="text-xs text-neutral-500">{epic.story_count} {epic.story_count === 1 ? "story" : "stories"}</span>
          {done && (
            <span className="text-xs text-emerald-400">
              ✓ {okCount}/{result!.results.length} reconstructed
            </span>
          )}
        </button>
        {!done && (
          <button
            onClick={() => onReconstruct(epic.id)}
            disabled={isReconstructing}
            className="flex items-center gap-1.5 rounded bg-violet-600/20 px-2.5 py-1 text-xs font-medium text-violet-300 hover:bg-violet-600/30 disabled:opacity-50"
          >
            {isReconstructing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            {isReconstructing ? "Generating…" : "Reconstruct Gherkin"}
          </button>
        )}
      </div>
      {done && expanded && (
        <div className="border-t border-neutral-700/40 px-3 py-2 space-y-1">
          {result!.results.map((r) => (
            <div key={r.story_id} className="flex items-center gap-2 text-xs">
              {r.status === "ok"
                ? <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                : <AlertCircle className="size-3 shrink-0 text-amber-400" />}
              <span className="text-neutral-400">Story {r.story_id}</span>
              {r.status !== "ok" && <span className="text-neutral-500">{r.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportPanel({ onStart }: { onStart?: () => void } = {}) {
  const bootstrap = useImportBootstrap();
  const reconstruct = useImportReconstructEpic();
  const qc = useQueryClient();
  const [report, setReport] = useState<ImportBootstrapResult | null>(null);
  const [epicResults, setEpicResults] = useState<Record<number, ImportReconstructResult>>({});
  const [reconstructingEpic, setReconstructingEpic] = useState<number | null>(null);
  const [showMapping, setShowMapping] = useState(false);

  async function handleBootstrap() {
    onStart?.();
    const result = await bootstrap.mutateAsync();
    setReport(result);
    qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
  }

  async function handleReconstruct(epicId: number) {
    setReconstructingEpic(epicId);
    try {
      const result = await reconstruct.mutateAsync(epicId);
      setEpicResults((prev) => ({ ...prev, [epicId]: result }));
      qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    } finally {
      setReconstructingEpic(null);
    }
  }

  if (!report) {
    return (
      <div className="rounded-md border border-blue-600/40 bg-blue-500/8 px-4 py-4">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 size-4 shrink-0 text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-300">Import ongoing project from Taiga</p>
            <p className="mt-0.5 text-xs text-blue-400/80">
              Pull existing epics and stories into Apex. Optionally reconstruct Gherkin specs per epic using AI.
            </p>
            <button
              onClick={handleBootstrap}
              disabled={bootstrap.isPending}
              className="mt-3 flex items-center gap-1.5 rounded bg-blue-600/25 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/40 disabled:opacity-50"
            >
              {bootstrap.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {bootstrap.isPending ? "Fetching from Taiga…" : "Import from Taiga"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-neutral-700/50 bg-neutral-800/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-200">Import complete</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {report.imported} stories imported · {report.skipped} skipped (already in Apex)
          </p>
        </div>
        <button
          onClick={() => setShowMapping((v) => !v)}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          {showMapping ? "Hide" : "Show"} status mapping
        </button>
      </div>

      {showMapping && report.status_mapping.length > 0 && (
        <div className="rounded border border-neutral-700/40 bg-neutral-900/40 p-2 space-y-1">
          <p className="text-xs font-medium text-neutral-400 mb-1">Taiga status → Apex phase</p>
          {report.status_mapping.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400 min-w-[120px]">{m.taiga_name}</span>
              <span className="text-neutral-600">→</span>
              <StatusBadge status={m.apex_status} />
            </div>
          ))}
        </div>
      )}

      {report.epics.length === 0 ? (
        <p className="text-xs text-neutral-500">No new epics or stories to reconstruct.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Epics — reconstruct Gherkin specs (optional, uses AI)
          </p>
          {report.epics.map((epic) => (
            <EpicRow
              key={epic.id}
              epic={epic}
              result={epicResults[epic.id]}
              isReconstructing={reconstructingEpic === epic.id}
              onReconstruct={handleReconstruct}
            />
          ))}
        </div>
      )}
    </div>
  );
}
