"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, FileCode2, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { deleteProposal, getProposals, listPacks, saveProposal } from "@/lib/api/phase3";
import { useAutoSyncStoryIndex } from "@/lib/hooks/use-workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { PanelHeader, type DragSectionProps } from "./shared";

type PacksSectionProps = DragSectionProps & {
  dark: boolean;
  confirm: (message: string, onConfirm: () => void) => void;
};

type PackRef = { storyId: number; taskId: number };

function packDownload(content: string, storyId: number, taskId: number) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proposal_story_${storyId}_task_${taskId}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PacksSection({ dark, confirm, shellClass, dragHandlers, onDragStart }: PacksSectionProps) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<(PackRef & { content: string }) | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();

  const PACKS_KEY = ["phase3", "packs", context?.projectId];

  const { data, isLoading } = useQuery({
    queryKey: PACKS_KEY,
    queryFn: () => listPacks(context!),
    enabled: Boolean(context) && open,
    staleTime: 30_000,
  });
  const packs = useMemo(() => data?.packs ?? [], [data]);

  const groups = useMemo(() => {
    const map = new Map<number, { title: string; items: typeof packs }>();
    for (const p of packs) {
      if (!map.has(p.story_id)) map.set(p.story_id, { title: p.story_title, items: [] });
      map.get(p.story_id)!.items.push(p);
    }
    return [...map.entries()];
  }, [packs]);

  const fetchPackContent = async ({ storyId, taskId }: PackRef): Promise<string> => {
    const res = await getProposals(context!, storyId);
    return res.proposals.find((p) => p.task_id === taskId)?.proposal_md ?? "";
  };

  const viewMut = useMutation({
    mutationFn: fetchPackContent,
    onSuccess: (content, ref) => {
      setViewing({ ...ref, content });
      setEditing(false);
      setDraft(content);
    },
    onError: (err: Error) => toast.error(`Load pack failed: ${err.message}`),
  });

  const saveMut = useMutation({
    mutationFn: ({ storyId, taskId, md }: PackRef & { md: string }) =>
      saveProposal(context!, { story_id: storyId, task_id: taskId, proposal_md: md }),
    onSuccess: (_, { storyId, taskId, md }) => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase3", "proposals"] });
      setViewing({ storyId, taskId, content: md });
      setEditing(false);
      toast.success("Pack saved.");
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const closeModal = () => {
    setViewing(null);
    setEditing(false);
  };

  useEscapeKey(viewing !== null, closeModal);

  const downloadMut = useMutation({
    mutationFn: fetchPackContent,
    onSuccess: (content, ref) => packDownload(content, ref.storyId, ref.taskId),
    onError: (err: Error) => toast.error(`Download failed: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: ({ storyId, taskId }: PackRef) => deleteProposal(context!, storyId, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase3", "proposals"] });
      autoSync();
      toast.success("Pack deleted.");
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const deleteStoryPacksMut = useMutation({
    mutationFn: async (storyId: number) => {
      for (const p of packs.filter((x) => x.story_id === storyId)) {
        await deleteProposal(context!, p.story_id, p.task_id);
      }
    },
    onSuccess: (_, storyId) => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase3", "proposals"] });
      autoSync();
      toast.success(`All packs for US#${storyId} deleted.`);
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const rowBtn = cn(
    "rounded p-1 transition-colors",
    dark ? "text-neutral-500 hover:text-violet-400" : "text-slate-400 hover:text-violet-600",
  );

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", dark ? "border-neutral-800" : "border-slate-300")}>
        <PanelHeader
          icon={<FileCode2 className="size-4" />}
          title="Developer Packs"
          badge={open && packs.length > 0 ? String(packs.length) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("px-4 py-3 text-sm", dark ? "bg-[#20232b]" : "bg-white")}>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading packs…
              </div>
            ) : packs.length === 0 ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                No developer packs saved. Phase 3 writes one per task.
              </p>
            ) : (
              <div className="space-y-3">
                {groups.map(([storyId, group]) => (
                  <div key={storyId}>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-mono font-bold",
                        dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
                      )}>
                        US#{storyId}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-xs font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
                        {group.title || "(story not in index)"}
                      </span>
                      <button
                        className={cn(rowBtn, "hover:!text-red-400")}
                        title="Delete all packs for this story"
                        disabled={deleteStoryPacksMut.isPending}
                        onClick={() =>
                          confirm(
                            `Delete all ${group.items.length} pack(s) for US#${storyId}? The story will no longer count as proposed.`,
                            () => deleteStoryPacksMut.mutate(storyId),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <ul className={cn("mt-1 divide-y rounded border", dark ? "divide-neutral-800 border-neutral-800" : "divide-slate-100 border-slate-200")}>
                      {group.items.map((p) => (
                        <li key={p.task_id} className="flex items-center gap-2 px-2.5 py-1.5">
                          <span className={cn("flex-1 text-xs", dark ? "text-neutral-300" : "text-slate-600")}>
                            Task {p.task_id}
                            <span className={cn("ml-2", dark ? "text-neutral-600" : "text-slate-400")}>
                              {Math.round(p.chars / 100) / 10}k chars
                            </span>
                          </span>
                          <button
                            className={rowBtn}
                            title="View pack"
                            disabled={viewMut.isPending}
                            onClick={() => viewMut.mutate({ storyId: p.story_id, taskId: p.task_id })}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            className={rowBtn}
                            title="Download pack"
                            disabled={downloadMut.isPending}
                            onClick={() => downloadMut.mutate({ storyId: p.story_id, taskId: p.task_id })}
                          >
                            <Download className="size-3.5" />
                          </button>
                          <button
                            className={cn(rowBtn, "hover:!text-red-400")}
                            title="Delete pack"
                            disabled={deleteMut.isPending}
                            onClick={() =>
                              confirm(
                                `Delete the pack for US#${storyId} task ${p.task_id}?`,
                                () => deleteMut.mutate({ storyId: p.story_id, taskId: p.task_id }),
                              )
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
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
              role="dialog"
              aria-modal="true"
              aria-label={`Developer pack for US#${viewing.storyId}, task ${viewing.taskId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
                <FileCode2 className="size-4 text-violet-400" />
                <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                  Developer Pack — US#{viewing.storyId} · Task {viewing.taskId}
                </span>
                {editing ? (
                  <button
                    className={rowBtn}
                    title="Save changes"
                    disabled={saveMut.isPending || !draft.trim()}
                    onClick={() => saveMut.mutate({ storyId: viewing.storyId, taskId: viewing.taskId, md: draft })}
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
                  onClick={() => packDownload(editing ? draft : viewing.content, viewing.storyId, viewing.taskId)}
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
                  {viewing.content || "(empty pack)"}
                </pre>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
