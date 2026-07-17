"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardCheck, Download, Eye, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadZip } from "@/lib/utils/zip";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { deleteTestPlan, getTestPlan, listTestPlans, saveTestPlan } from "@/lib/api/phase4";
import { useAutoSyncStoryIndex } from "@/lib/hooks/use-workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { PanelHeader, type DragSectionProps } from "./shared";

type TestPlansSectionProps = DragSectionProps & {
  dark: boolean;
  confirm: (message: string, onConfirm: () => void) => void;
};

function planDownload(content: string, storyId: number) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `test_plan_story_${storyId}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TestPlansSection({ dark, confirm, shellClass, dragHandlers, onDragStart }: TestPlansSectionProps) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<{ storyId: number; content: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();

  const PLANS_KEY = ["phase4", "test-plans", context?.projectId];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => listTestPlans(context!),
    enabled: Boolean(context) && open,
    staleTime: 30_000,
  });
  const plans = useMemo(() => data?.test_plans ?? [], [data]);

  const fetchPlanContent = async (storyId: number): Promise<string> => {
    const res = await getTestPlan(context!, storyId);
    return res.test_plan_md ?? "";
  };

  const viewMut = useMutation({
    mutationFn: fetchPlanContent,
    onSuccess: (content, storyId) => {
      setViewing({ storyId, content });
      setEditing(false);
      setDraft(content);
    },
    onError: (err: Error) => toast.error(`Load test plan failed: ${err.message}`),
  });

  const downloadMut = useMutation({
    mutationFn: fetchPlanContent,
    onSuccess: (content, storyId) => planDownload(content, storyId),
    onError: (err: Error) => toast.error(`Download failed: ${err.message}`),
  });

  const downloadAllMut = useMutation({
    mutationFn: async () => {
      const contents = await Promise.all(plans.map((p) => fetchPlanContent(p.story_id)));
      return contents.map((content, i) => ({ filename: `test_plan_story_${plans[i].story_id}.md`, content }));
    },
    onSuccess: (files) => downloadZip(files, "apex-test-plans.zip"),
    onError: (err: Error) => toast.error(`Download failed: ${err.message}`),
  });

  const saveMut = useMutation({
    mutationFn: ({ storyId, md }: { storyId: number; md: string }) => saveTestPlan(context!, storyId, md),
    onSuccess: (_, { storyId, md }) => {
      void queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase4", "test-plan", storyId] });
      autoSync();
      setViewing({ storyId, content: md });
      setEditing(false);
      toast.success("Test plan saved.");
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (storyId: number) => deleteTestPlan(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase4"] });
      autoSync();
      toast.success("Test plan deleted.");
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const deleteAllMut = useMutation({
    mutationFn: async () => {
      for (const p of plans) {
        await deleteTestPlan(context!, p.story_id);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["phase4"] });
      autoSync();
      toast.success("All test plans deleted.");
    },
    onError: (err: Error) => toast.error(`Delete all failed: ${err.message}`),
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
          icon={<ClipboardCheck className="size-4" />}
          title="Test Plans"
          badge={open && plans.length > 0 ? String(plans.length) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open ? (
          <div className={cn("px-4 py-3 text-sm", dark ? "bg-[#20232b]" : "bg-white")}>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading test plans…
              </div>
            ) : isError ? (
              <div className={cn("flex items-center justify-between gap-2 rounded border px-2.5 py-2 text-xs", dark ? "border-red-900/50 text-red-400" : "border-red-200 text-red-600")}>
                <span>Failed to load test plans.</span>
                <button onClick={() => refetch()} className="shrink-0 font-semibold underline">Retry</button>
              </div>
            ) : plans.length === 0 ? (
              <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-400")}>
                No test plans saved. Phase 4 writes one per story.
              </p>
            ) : (
              <>
              <div className="mb-2 flex gap-1.5">
                <button
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center gap-1.5 rounded border text-xs font-medium transition-colors disabled:opacity-50",
                    dark ? "border-neutral-700 text-neutral-300 hover:border-violet-500/60 hover:text-violet-300" : "border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-700",
                  )}
                  disabled={downloadAllMut.isPending}
                  onClick={() => downloadAllMut.mutate()}
                >
                  {downloadAllMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  Download all
                </button>
                <button
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center gap-1.5 rounded border text-xs font-medium transition-colors disabled:opacity-50",
                    dark ? "border-neutral-700 text-red-400 hover:border-red-500/60 hover:text-red-300" : "border-slate-300 text-red-600 hover:border-red-400 hover:text-red-700",
                  )}
                  disabled={deleteAllMut.isPending}
                  onClick={() =>
                    confirm(
                      `Delete all ${plans.length} test plan(s)? This rolls each story's status back from qa to implementation. This cannot be undone.`,
                      () => deleteAllMut.mutate(),
                    )
                  }
                >
                  {deleteAllMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete all
                </button>
              </div>
              <ul className={cn("divide-y rounded border", dark ? "divide-neutral-800 border-neutral-800" : "divide-slate-100 border-slate-200")}>
                {plans.map((p) => (
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
                      title="View / edit test plan"
                      disabled={viewMut.isPending}
                      onClick={() => viewMut.mutate(p.story_id)}
                    >
                      <Eye className="size-3.5" />
                    </button>
                    <button
                      className={rowBtn}
                      title="Download test plan"
                      disabled={downloadMut.isPending}
                      onClick={() => downloadMut.mutate(p.story_id)}
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      className={cn(rowBtn, "hover:!text-red-400")}
                      title="Delete test plan"
                      disabled={deleteMut.isPending}
                      onClick={() =>
                        confirm(
                          `Delete the test plan for US#${p.story_id}? This rolls the story's status back from qa to implementation.`,
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
              className={cn(
                "flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl",
                dark ? "border-neutral-700 bg-[#1b1b1c]" : "border-slate-200 bg-white",
              )}
              role="dialog"
              aria-modal="true"
              aria-label={`Test plan for US#${viewing.storyId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("flex items-center gap-3 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
                <ClipboardCheck className="size-4 text-violet-400" />
                <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-800")}>
                  Test Plan — US#{viewing.storyId}
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
                  onClick={() => planDownload(editing ? draft : viewing.content, viewing.storyId)}
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
                  {viewing.content || "(empty test plan)"}
                </pre>
              )}
              {editing ? (
                <div className={cn("border-t px-5 py-2 text-xs", dark ? "border-neutral-800 text-neutral-500" : "border-slate-200 text-slate-400")}>
                  Saving keeps the story at <span className="font-mono">qa</span> status.
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
