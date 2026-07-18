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
import { useT } from "@/lib/i18n/use-translation";

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
  const t = useT();
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
    onError: (err: Error) => toast.error(t("fixbolt.toast.loadFailed", { err: err.message })),
  });

  const downloadMut = useMutation({
    mutationFn: fetchContent,
    onSuccess: (content, storyId) => bugReportDownload(content, storyId),
    onError: (err: Error) => toast.error(t("packs.toast.downloadFailed", { err: err.message })),
  });

  const saveMut = useMutation({
    mutationFn: ({ storyId, md }: { storyId: number; md: string }) => saveBugReport(context!, storyId, md),
    onSuccess: (_, { storyId, md }) => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      setViewing({ storyId, content: md });
      setEditing(false);
      toast.success(t("fixbolt.toast.bugReportSaved"));
    },
    onError: (err: Error) => toast.error(t("packs.toast.saveFailed", { err: err.message })),
  });

  const deleteMut = useMutation({
    mutationFn: (storyId: number) => deleteBugReport(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      setDeleteConfirm(null);
      toast.success(t("fixbolt.toast.bugReportDeleted"));
    },
    onError: (err: Error) => toast.error(t("packs.toast.deleteFailed", { err: err.message })),
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
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">{t("fixbolt.governanceEyebrow")}</p>
        <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {t("fixbolt.heading")}
        </h1>
        <p className={cn("mt-2", mutedClass)}>
          {t("fixbolt.subtitle")}
        </p>
      </div>

      {!context && <SignInRequired unlocks={t("fixbolt.unlocksFixBolt")} />}

      {context && (
        <div className="space-y-10">
          {/* Bug reports */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="size-4 text-violet-400" />
              <h2 className={cn("text-lg font-bold", dark ? "text-neutral-100" : "text-slate-800")}>
                {t("fixbolt.bugReports")}
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
                <Loader2 className="h-4 w-4 animate-spin" /> {t("fixbolt.loadingBugReports")}
              </div>
            ) : reportsError != null ? (
              <Callout>{t("fixbolt.failedLoadBugReports", { err: errMsg(reportsError) })}</Callout>
            ) : reports.length === 0 ? (
              <p className={cn("text-sm", mutedClass)}>
                {t("fixbolt.noBugReports")}
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
                      {r.title || t("packs.storyNotInIndex")}
                      <span className={cn("ml-2 text-xs", mutedClass)}>
                        {t("packs.charsK", { k: Math.round(r.chars / 100) / 10 })}
                      </span>
                    </span>
                    <button className={rowBtn} title={t("fixbolt.viewEditBugReport")} aria-label={t("fixbolt.viewEditBugReportAria", { storyId: r.story_id })} disabled={viewMut.isPending} onClick={() => viewMut.mutate(r.story_id)}>
                      <Eye className="size-4" />
                    </button>
                    <button className={rowBtn} title={t("fixbolt.downloadBugReport")} aria-label={t("fixbolt.downloadBugReportAria", { storyId: r.story_id })} disabled={downloadMut.isPending} onClick={() => downloadMut.mutate(r.story_id)}>
                      <Download className="size-4" />
                    </button>
                    <button
                      className={cn(rowBtn, "hover:!text-red-400")}
                      title={t("fixbolt.deleteBugReport")}
                      aria-label={t("fixbolt.deleteBugReportAria", { storyId: r.story_id })}
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
                {t("fixbolt.fixLog")}
              </h2>
              <span className={cn("text-xs", mutedClass)}>{t("fixbolt.readOnlyPermanent")}</span>
            </div>
            {fixLogLoading ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("fixbolt.loadingFixLog")}
              </div>
            ) : !fixLog ? (
              <p className={cn("text-sm", mutedClass)}>
                {t("fixbolt.noFixLogEntries")}
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
          message={deleteConfirm === null ? "" : t("fixbolt.deleteConfirm", { storyId: deleteConfirm })}
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
              aria-label={t("fixbolt.dialogAria", { storyId: viewing.storyId })}
              className={cn(
                "flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl",
                dark ? "border-neutral-700 bg-[#1b1b1c]" : "border-slate-200 bg-white",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
                <Zap className="size-4 text-violet-400" />
                <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                  {t("fixbolt.dialogTitle", { storyId: viewing.storyId })}
                </span>
                {editing ? (
                  <button
                    className={rowBtn}
                    title={t("packs.saveChanges")}
                    aria-label={t("packs.saveChanges")}
                    disabled={saveMut.isPending || !draft.trim()}
                    onClick={() => saveMut.mutate({ storyId: viewing.storyId, md: draft })}
                  >
                    {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  </button>
                ) : (
                  <button className={rowBtn} title={t("common.edit")} aria-label={t("fixbolt.editBugReportAria")} onClick={() => { setEditing(true); setDraft(viewing.content); }}>
                    <Pencil className="size-4" />
                  </button>
                )}
                <button
                  className={rowBtn}
                  title={t("common.download")}
                  aria-label={t("fixbolt.downloadBugReport")}
                  onClick={() => bugReportDownload(editing ? draft : viewing.content, viewing.storyId)}
                >
                  <Download className="size-4" />
                </button>
                <button className={rowBtn} title={t("common.close")} aria-label={t("fixbolt.closeDialogAria")} onClick={closeModal}>
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
                  {viewing.content || t("fixbolt.emptyBugReport")}
                </pre>
              )}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
