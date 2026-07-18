"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, Loader2, Pencil, Save, ScrollText, Trash2, X, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Callout } from "@/components/ui/primitives";
import { deleteBugReport, getBugReport, getFixLog, listBugReports, saveBugReport } from "@/lib/api/phase4";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { useApiContext } from "@/lib/stores/session-store";
import { SignInRequired } from "@/components/sign-in-required";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, errMsg } from "@/lib/utils";
import { ConfirmDialog } from "@/components/sidebar/shared";

function bugReportDownload(content: string, storyId: number) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bug_report_${storyId}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function FixBoltDashboard() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const queryClient = useQueryClient();

  const [viewing, setViewing] = useState<{ storyId: number; content: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const REPORTS_KEY = ["phase4", "bug-reports", context?.projectId];
  const FIXLOG_KEY = ["phase4", "fix-log", context?.projectId];

  const { data: reportsData, isLoading: reportsLoading, error: reportsError } = useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => listBugReports(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
  const reports = useMemo(() => reportsData?.bug_reports ?? [], [reportsData]);

  const { data: fixLogData, isLoading: fixLogLoading } = useQuery({
    queryKey: FIXLOG_KEY,
    queryFn: () => getFixLog(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
  const fixLog = (fixLogData?.fix_log_md ?? "").trim();

  const fetchContent = async (storyId: number): Promise<string> => {
    const res = await getBugReport(context!, storyId);
    return res.bug_report_md ?? "";
  };

  const viewMut = useMutation({
    mutationFn: fetchContent,
    onSuccess: (content, storyId) => {
      setViewing({ storyId, content });
      setEditing(false);
      setDraft(content);
    },
    onError: (err: Error) => toast.error(`Load bug report failed: ${err.message}`),
  });

  const downloadMut = useMutation({
    mutationFn: fetchContent,
    onSuccess: (content, storyId) => bugReportDownload(content, storyId),
    onError: (err: Error) => toast.error(`Download failed: ${err.message}`),
  });

  const saveMut = useMutation({
    mutationFn: ({ storyId, md }: { storyId: number; md: string }) => saveBugReport(context!, storyId, md),
    onSuccess: (_, { storyId, md }) => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      setViewing({ storyId, content: md });
      setEditing(false);
      toast.success("Bug report saved.");
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (storyId: number) => deleteBugReport(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      setDeleteConfirm(null);
      toast.success("Bug report deleted (story stays flagged for Regression Bypass).");
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const closeModal = () => {
    setViewing(null);
    setEditing(false);
  };

  useEscapeKey(viewing !== null, closeModal);

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";
  const rowBtn = cn(
    "rounded p-1 transition-colors",
    dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
  );

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Governance</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          Fix Bolt
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          Manage Fix-Bolt artifacts: per-story bug reports (Phase 4 QA fails &amp; Phase 6 maintenance) and the
          permanent Fix Log of resolved defects.
        </p>
      </div>

      {!context && <SignInRequired unlocks="the Fix-Bolt dashboard" />}

      {context && (
        <div className="space-y-10">
          {/* Bug reports */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="size-4 text-violet-400" />
              <h2 className={cn("text-lg font-bold", dark ? "text-neutral-100" : "text-slate-800")}>
                Bug Reports
              </h2>
              {reports.length > 0 && (
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-mono",
                  dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
                )}>
                  {reports.length}
                </span>
              )}
            </div>

            {reportsLoading ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading bug reports…
              </div>
            ) : reportsError != null ? (
              <Callout>Failed to load bug reports: {errMsg(reportsError)}</Callout>
            ) : reports.length === 0 ? (
              <p className={cn("text-sm", mutedClass)}>
                No bug reports saved. A Fix-Bolt artifact is written per story when a Phase 4 QA gate fails or a
                Phase 6 maintenance bug is resolved.
              </p>
            ) : (
              <ul className={cn(
                "divide-y rounded-lg border",
                dark ? "divide-neutral-800 border-neutral-800" : "divide-slate-100 border-slate-200",
              )}>
                {reports.map((r) => (
                  <li key={r.story_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:flex-nowrap">
                    <span className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-mono font-bold",
                      dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
                    )}>
                      US#{r.story_id}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-sm", dark ? "text-neutral-300" : "text-slate-600")}>
                      {r.title || "(story not in index)"}
                      <span className={cn("ml-2 text-xs", mutedClass)}>
                        {Math.round(r.chars / 100) / 10}k chars
                      </span>
                    </span>
                    <button className={rowBtn} title="View / edit bug report" aria-label={`View or edit bug report for US#${r.story_id}`} disabled={viewMut.isPending} onClick={() => viewMut.mutate(r.story_id)}>
                      <Eye className="size-4" />
                    </button>
                    <button className={rowBtn} title="Download bug report" aria-label={`Download bug report for US#${r.story_id}`} disabled={downloadMut.isPending} onClick={() => downloadMut.mutate(r.story_id)}>
                      <Download className="size-4" />
                    </button>
                    <button
                      className={cn(rowBtn, "hover:!text-red-400")}
                      title="Delete bug report"
                      aria-label={`Delete bug report for US#${r.story_id}`}
                      disabled={deleteMut.isPending}
                      onClick={() => setDeleteConfirm(r.story_id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fix Log */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <ScrollText className="size-4 text-violet-400" />
              <h2 className={cn("text-lg font-bold", dark ? "text-neutral-100" : "text-slate-800")}>
                Fix Log
              </h2>
              <span className={cn("text-xs", mutedClass)}>read-only · permanent record</span>
            </div>
            {fixLogLoading ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading fix log…
              </div>
            ) : !fixLog ? (
              <p className={cn("text-sm", mutedClass)}>
                No fix-log entries yet. A record is appended each time a defect is resolved.
              </p>
            ) : (
              <pre className={cn(
                "max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border p-5 font-mono text-xs leading-relaxed",
                dark ? "border-neutral-800 bg-[#1b1b1c] text-neutral-300" : "border-slate-200 bg-white text-slate-700",
              )}>
                {fixLog}
              </pre>
            )}
          </div>
        </div>
      )}

      {typeof document !== "undefined" ? createPortal(
        <ConfirmDialog
          open={deleteConfirm !== null}
          message={deleteConfirm === null ? "" : `Delete the bug report for US#${deleteConfirm}? The story stays flagged so its Regression Bypass is preserved.`}
          onConfirm={() => { if (deleteConfirm !== null) deleteMut.mutate(deleteConfirm); }}
          onCancel={() => setDeleteConfirm(null)}
        />,
        document.body,
      ) : null}

      {viewing &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={closeModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Bug report for US#${viewing.storyId}`}
              className={cn(
                "flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl",
                dark ? "border-neutral-700 bg-[#1b1b1c]" : "border-slate-200 bg-white",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
                <Zap className="size-4 text-violet-400" />
                <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                  Bug Report — US#{viewing.storyId}
                </span>
                {editing ? (
                  <button
                    className={rowBtn}
                    title="Save changes"
                    aria-label="Save changes"
                    disabled={saveMut.isPending || !draft.trim()}
                    onClick={() => saveMut.mutate({ storyId: viewing.storyId, md: draft })}
                  >
                    {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  </button>
                ) : (
                  <button className={rowBtn} title="Edit" aria-label="Edit bug report" onClick={() => { setEditing(true); setDraft(viewing.content); }}>
                    <Pencil className="size-4" />
                  </button>
                )}
                <button
                  className={rowBtn}
                  title="Download"
                  aria-label="Download bug report"
                  onClick={() => bugReportDownload(editing ? draft : viewing.content, viewing.storyId)}
                >
                  <Download className="size-4" />
                </button>
                <button className={rowBtn} title="Close" aria-label="Close dialog" onClick={closeModal}>
                  <X className="size-4" />
                </button>
              </div>
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={cn(
                    "min-h-0 flex-1 resize-none overflow-auto p-5 font-mono text-xs leading-relaxed outline-none",
                    dark ? "bg-[#1b1b1c] text-neutral-300" : "bg-white text-slate-700",
                  )}
                />
              ) : (
                <pre className={cn(
                  "min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-relaxed",
                  dark ? "text-neutral-300" : "text-slate-700",
                )}>
                  {viewing.content || "(empty bug report)"}
                </pre>
              )}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
