"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, Loader2, Pencil, Rocket, Save, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadZip } from "@/lib/utils/zip";
import { deleteDeployPack, getDeployPack, listDeployPacks, saveDeployPack } from "@/lib/api/phase5";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { useAutoSyncStoryIndex } from "@/lib/hooks/use-workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { PanelHeader, type DragSectionProps } from "./shared";
import { useT } from "@/lib/i18n/use-translation";

type DeployPacksSectionProps = DragSectionProps & {
  dark: boolean;
  confirm: (message: string, onConfirm: () => void) => void;
};

function packDownload(content: string, storyId: number) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deploy_pack_story_${storyId}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeployPacksSection({ dark, confirm, shellClass, dragHandlers, onDragStart }: DeployPacksSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<{ storyId: number; content: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();

  const PACKS_KEY = ["phase5", "deploy-packs", context?.projectId];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: PACKS_KEY,
    queryFn: () => listDeployPacks(context!),
    enabled: Boolean(context) && open,
    staleTime: 30_000,
  });
  const packs = useMemo(() => data?.deploy_packs ?? [], [data]);

  const fetchPackContent = async (storyId: number): Promise<string> => {
    const res = await getDeployPack(context!, storyId);
    return res.deploy_pack_md ?? "";
  };

  const viewMut = useMutation({
    mutationFn: fetchPackContent,
    onSuccess: (content, storyId) => {
      setViewing({ storyId, content });
      setEditing(false);
      setDraft(content);
    },
    onError: (err: Error) => toast.error(t("deploypacks.toast.loadFailed", { err: err.message })),
  });

  const downloadMut = useMutation({
    mutationFn: fetchPackContent,
    onSuccess: (content, storyId) => packDownload(content, storyId),
    onError: (err: Error) => toast.error(t("deploypacks.toast.downloadFailed", { err: err.message })),
  });

  const downloadAllMut = useMutation({
    mutationFn: async () => {
      const contents = await Promise.all(packs.map((p) => fetchPackContent(p.story_id)));
      return contents.map((content, i) => ({ filename: `deploy_pack_story_${packs[i].story_id}.md`, content }));
    },
    onSuccess: (files) => downloadZip(files, "apex-deploy-packs.zip"),
    onError: (err: Error) => toast.error(t("deploypacks.toast.downloadFailed", { err: err.message })),
  });

  const saveMut = useMutation({
    mutationFn: ({ storyId, md }: { storyId: number; md: string }) => saveDeployPack(context!, storyId, md),
    onSuccess: (_, { storyId, md }) => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase5", "deploy-pack", storyId] });
      autoSync();
      setViewing({ storyId, content: md });
      setEditing(false);
      toast.success(t("deploypacks.toast.deployPackSaved"));
    },
    onError: (err: Error) => toast.error(t("deploypacks.toast.saveFailed", { err: err.message })),
  });

  const deleteMut = useMutation({
    mutationFn: (storyId: number) => deleteDeployPack(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase5"] });
      autoSync();
      toast.success(t("deploypacks.toast.deployPackDeleted"));
    },
    onError: (err: Error) => toast.error(t("deploypacks.toast.deleteFailed", { err: err.message })),
  });

  const closeModal = () => {
    setViewing(null);
    setEditing(false);
  };

  useEscapeKey(viewing !== null, closeModal);

  const rowBtn = cn(
    "rounded p-1 transition-colors",
    dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
  );

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", dark ? "border-neutral-800" : "border-slate-300")}>
        <PanelHeader
          icon={<Rocket className="size-4" />}
          title={t("deploypacks.panelTitle")}
          badge={open && packs.length > 0 ? String(packs.length) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("px-4 py-3 text-sm", dark ? "bg-[#20232b]" : "bg-white")}>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("deploypacks.loading")}
              </div>
            ) : isError ? (
              <div className={cn("flex items-center justify-between gap-2 rounded border px-2.5 py-2 text-xs", dark ? "border-red-900/50 text-red-400" : "border-red-200 text-red-600")}>
                <span>{t("deploypacks.failedLoad")}</span>
                <button onClick={() => refetch()} className="shrink-0 font-semibold underline">{t("common.retry")}</button>
              </div>
            ) : packs.length === 0 ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                {t("deploypacks.none")}
              </p>
            ) : (
              <>
              <button
                className={cn(
                  "mb-2 flex h-8 w-full items-center justify-center gap-1.5 rounded border text-xs font-medium transition-colors disabled:opacity-50",
                  dark ? "border-neutral-700 text-neutral-300 hover:border-violet-500/60 hover:text-violet-300" : "border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-700",
                )}
                disabled={downloadAllMut.isPending}
                onClick={() => downloadAllMut.mutate()}
              >
                {downloadAllMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                {t("common.downloadAll")}
              </button>
              <ul className={cn("divide-y rounded border", dark ? "divide-neutral-800 border-neutral-800" : "divide-slate-100 border-slate-200")}>
                {packs.map((p) => (
                  <li key={p.story_id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-mono font-bold",
                      dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
                    )}>
                      US#{p.story_id}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-xs", dark ? "text-neutral-300" : "text-slate-600")}>
                      {p.title || t("deploypacks.storyNotInIndex")}
                      <span className={cn("ml-2", dark ? "text-neutral-600" : "text-slate-400")}>
                        {t("deploypacks.charsK", { k: Math.round(p.chars / 100) / 10 })}
                      </span>
                    </span>
                    <button
                      className={rowBtn}
                      title={t("deploypacks.viewEditDeployPack")}
                      disabled={viewMut.isPending}
                      onClick={() => viewMut.mutate(p.story_id)}
                    >
                      <Eye className="size-3.5" />
                    </button>
                    <button
                      className={rowBtn}
                      title={t("deploypacks.downloadDeployPack")}
                      disabled={downloadMut.isPending}
                      onClick={() => downloadMut.mutate(p.story_id)}
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      className={cn(rowBtn, "hover:!text-red-400")}
                      title={t("deploypacks.deleteDeployPack")}
                      disabled={deleteMut.isPending}
                      onClick={() =>
                        confirm(
                          t("deploypacks.deleteConfirm", { storyId: p.story_id }),
                          () => deleteMut.mutate(p.story_id),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
        ) : null}
      </section>

      {viewing &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={closeModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("deploypacks.dialogAria", { storyId: viewing.storyId })}
              className={cn(
                "flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl",
                dark ? "border-neutral-700 bg-[#1b1b1c]" : "border-slate-200 bg-white",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
                <Rocket className="size-4 text-violet-400" />
                <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                  {t("deploypacks.dialogTitle", { storyId: viewing.storyId })}
                </span>
                {editing ? (
                  <button
                    className={rowBtn}
                    title={t("deploypacks.saveChanges")}
                    disabled={saveMut.isPending || !draft.trim()}
                    onClick={() => saveMut.mutate({ storyId: viewing.storyId, md: draft })}
                  >
                    {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  </button>
                ) : (
                  <button className={rowBtn} title={t("common.edit")} onClick={() => { setEditing(true); setDraft(viewing.content); }}>
                    <Pencil className="size-4" />
                  </button>
                )}
                <button
                  className={rowBtn}
                  title={t("common.download")}
                  onClick={() => packDownload(editing ? draft : viewing.content, viewing.storyId)}
                >
                  <Download className="size-4" />
                </button>
                <button className={rowBtn} title={t("common.close")} onClick={closeModal}>
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
                  {viewing.content || t("deploypacks.emptyDeployPack")}
                </pre>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
