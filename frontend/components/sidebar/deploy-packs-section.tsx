"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, Loader2, Pencil, Rocket, Save, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteDeployPack, getDeployPack, listDeployPacks, saveDeployPack } from "@/lib/api/phase5";
import { useAutoSyncStoryIndex } from "@/lib/hooks/use-workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { PanelHeader, type DragSectionProps } from "./shared";

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
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<{ storyId: number; content: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();

  const PACKS_KEY = ["phase5", "deploy-packs", context?.projectId];

  const { data, isLoading } = useQuery({
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
    onError: (err: Error) => toast.error(`Load deploy pack failed: ${err.message}`),
  });

  const downloadMut = useMutation({
    mutationFn: fetchPackContent,
    onSuccess: (content, storyId) => packDownload(content, storyId),
    onError: (err: Error) => toast.error(`Download failed: ${err.message}`),
  });

  const saveMut = useMutation({
    mutationFn: ({ storyId, md }: { storyId: number; md: string }) => saveDeployPack(context!, storyId, md),
    onSuccess: (_, { storyId, md }) => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase5", "deploy-pack", storyId] });
      autoSync();
      setViewing({ storyId, content: md });
      setEditing(false);
      toast.success("Deploy pack saved.");
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (storyId: number) => deleteDeployPack(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase5"] });
      autoSync();
      toast.success("Deploy pack deleted.");
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const closeModal = () => {
    setViewing(null);
    setEditing(false);
  };

  const rowBtn = cn(
    "rounded p-1 transition-colors",
    dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
  );

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", dark ? "border-neutral-800" : "border-slate-300")}>
        <PanelHeader
          icon={<Rocket className="size-4" />}
          title="Deploy Packs"
          badge={open && packs.length > 0 ? String(packs.length) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("px-4 py-3 text-sm", dark ? "bg-[#20232b]" : "bg-white")}>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading deploy packs…
              </div>
            ) : packs.length === 0 ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                No deploy packs saved. Phase 5 writes one per story with an infra delta.
              </p>
            ) : (
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
                      {p.title || "(story not in index)"}
                      <span className={cn("ml-2", dark ? "text-neutral-600" : "text-slate-400")}>
                        {Math.round(p.chars / 100) / 10}k chars
                      </span>
                    </span>
                    <button
                      className={rowBtn}
                      title="View / edit deploy pack"
                      disabled={viewMut.isPending}
                      onClick={() => viewMut.mutate(p.story_id)}
                    >
                      <Eye className="size-3.5" />
                    </button>
                    <button
                      className={rowBtn}
                      title="Download deploy pack"
                      disabled={downloadMut.isPending}
                      onClick={() => downloadMut.mutate(p.story_id)}
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      className={cn(rowBtn, "hover:!text-red-400")}
                      title="Delete deploy pack"
                      disabled={deleteMut.isPending}
                      onClick={() =>
                        confirm(
                          `Delete the deploy pack for US#${p.story_id}?`,
                          () => deleteMut.mutate(p.story_id),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {viewing &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={closeModal}>
            <div
              className={cn(
                "flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl",
                dark ? "border-neutral-700 bg-[#1b1b1c]" : "border-slate-200 bg-white",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
                <Rocket className="size-4 text-violet-400" />
                <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                  Deploy Pack — US#{viewing.storyId}
                </span>
                {editing ? (
                  <button
                    className={rowBtn}
                    title="Save changes"
                    disabled={saveMut.isPending || !draft.trim()}
                    onClick={() => saveMut.mutate({ storyId: viewing.storyId, md: draft })}
                  >
                    {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  </button>
                ) : (
                  <button className={rowBtn} title="Edit" onClick={() => { setEditing(true); setDraft(viewing.content); }}>
                    <Pencil className="size-4" />
                  </button>
                )}
                <button
                  className={rowBtn}
                  title="Download"
                  onClick={() => packDownload(editing ? draft : viewing.content, viewing.storyId)}
                >
                  <Download className="size-4" />
                </button>
                <button className={rowBtn} title="Close" onClick={closeModal}>
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
                  {viewing.content || "(empty deploy pack)"}
                </pre>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
