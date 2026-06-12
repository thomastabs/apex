"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, Layers3, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useBoard,
  useCreateEpic,
  useCreateStory,
  useDeleteEpic,
  useDeleteStory,
  useRebuildStoryIndex,
  useStoryIndexStats,
  useStoryStatuses,
  useUpdateEpic,
  useUpdateStory,
} from "@/lib/hooks/use-workspace";
import { getPmAdapter } from "@/lib/api/pm-factory";
import { toPmCtx } from "@/lib/api/workspace";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";
import type { Epic, Story } from "@/lib/api/types";
import { PanelHeader, type DragSectionProps } from "./shared";

// ── dialogs ───────────────────────────────────────────────────────────────────

/** Board lists come from the PM tool's LIST endpoints, which omit
 *  descriptions (Taiga's light serializer). Edit dialogs must hydrate from
 *  the detail endpoint — otherwise the textarea starts empty and saving
 *  silently wipes the real description. */
function useDetailHydration<T extends { description?: string; version?: number | null }>(
  kind: "epic" | "story",
  id: number,
  fetchDetail: () => Promise<T>,
  setDescription: (d: string) => void,
) {
  const context = useApiContext();
  const hydratedRef = useRef(false);
  const detail = useQuery({
    queryKey: ["pm", `${kind}-detail`, context?.projectId, id],
    queryFn: fetchDetail,
    enabled: Boolean(context),
    staleTime: 0,
  });
  useEffect(() => {
    if (detail.data && !hydratedRef.current) {
      hydratedRef.current = true;
      setDescription(detail.data.description ?? "");
    }
  }, [detail.data, setDescription]);
  return detail;
}

function EpicDialog({ epic, onClose }: { epic: Epic; onClose: () => void }) {
  const dark = useUiStore((state) => state.theme === "dark");
  const context = useApiContext();
  const [subject, setSubject] = useState(epic.subject);
  const [description, setDescription] = useState(epic.description ?? "");
  const [tagsInput, setTagsInput] = useState((epic.tags ?? []).join(", "));
  const update = useUpdateEpic();

  const detail = useDetailHydration(
    "epic", epic.id,
    () => getPmAdapter(context!.pmTool).getEpic(toPmCtx(context!), String(epic.id)),
    setDescription,
  );

  function save() {
    const version = detail.data?.version ?? epic.version;
    if (!version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      { epicId: epic.id, version, fields: { subject, description, tags } },
      { onSuccess: onClose },
    );
  }

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>Epic #{epic.ref}</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Title</label>
            <input className={cn("h-9 border-violet-700", inputClass)} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Epic title" autoFocus />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Description</label>
            <textarea className={cn("h-52 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the epic…" />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Tags <span className={dark ? "text-neutral-600" : "text-slate-400"}>(comma-separated)</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. backend, auth, v2" />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={update.isPending || detail.isLoading || !subject.trim()}
            onClick={save}
          >
            {update.isPending ? "Saving…" : detail.isLoading ? "Loading…" : "Save"}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryDialog({ story, onClose }: { story: Story; onClose: () => void }) {
  const dark = useUiStore((state) => state.theme === "dark");
  const context = useApiContext();
  const [subject, setSubject] = useState(story.subject);
  const [description, setDescription] = useState(story.description ?? "");
  const [tagsInput, setTagsInput] = useState((story.tags ?? []).join(", "));
  const [statusId, setStatusId] = useState<string>(story.status != null ? String(story.status) : "");
  const update = useUpdateStory();
  const { data: statuses = [] } = useStoryStatuses();

  const detail = useDetailHydration(
    "story", story.id,
    () => getPmAdapter(context!.pmTool).getStory(toPmCtx(context!), String(story.id)),
    setDescription,
  );

  const statusHydratedRef = useRef(false);
  useEffect(() => {
    if (detail.data && !statusHydratedRef.current) {
      statusHydratedRef.current = true;
      const s = (detail.data as Story).status;
      if (s != null) setStatusId(String(s));
    }
  }, [detail.data]);

  function save() {
    const version = detail.data?.version ?? story.version;
    if (!version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      {
        storyId: story.id,
        version,
        fields: { subject, description, tags, ...(statusId ? { status: statusId } : {}) },
      },
      { onSuccess: onClose },
    );
  }

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>Story #{story.ref}</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Title</label>
            <input className={cn("h-9 border-violet-700", inputClass)} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Story title" autoFocus />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Description</label>
            <textarea
              className={cn("h-52 resize-none py-2", inputClass)}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={detail.isLoading ? "Loading description…" : "Describe the story…"}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Status</label>
            <select
              className={cn("h-9 cursor-pointer", inputClass)}
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              {statusId === "" && <option value="">(unchanged)</option>}
              {statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Tags <span className={dark ? "text-neutral-600" : "text-slate-400"}>(comma-separated)</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. frontend, ui, sprint-1" />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={update.isPending || detail.isLoading || !subject.trim()}
            onClick={save}
          >
            {update.isPending ? "Saving…" : detail.isLoading ? "Loading…" : "Save"}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEpicDialog({ onClose }: { onClose: () => void }) {
  const dark = useUiStore((state) => state.theme === "dark");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const create = useCreateEpic();

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  function submit() {
    if (!subject.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate({ subject: subject.trim(), description, tags }, { onSuccess: onClose });
  }

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>Create New Epic</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Title <span className="text-red-400">*</span>
            </label>
            <input
              className={cn("h-9 border-violet-700", inputClass)}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Epic title"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Description</label>
            <textarea className={cn("h-48 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this epic…" />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Tags <span className={dark ? "text-neutral-600" : "text-slate-400"}>(comma-separated)</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. backend, auth, v2" />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={create.isPending || !subject.trim()}
            onClick={submit}
          >
            {create.isPending ? "Creating…" : "Create Epic"}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateStoryDialog({ epicId, onClose }: { epicId: number; onClose: () => void }) {
  const dark = useUiStore((state) => state.theme === "dark");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [statusId, setStatusId] = useState<number | undefined>(undefined);
  const create = useCreateStory();
  const statuses = useStoryStatuses();

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  function submit() {
    if (!subject.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate({ epicId, subject: subject.trim(), description, tags, statusId }, { onSuccess: onClose });
  }

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-2xl rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>Create New Story</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Title <span className="text-red-400">*</span>
            </label>
            <input
              className={cn("h-9 border-violet-700", inputClass)}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Story title"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Description</label>
            <textarea className={cn("h-40 resize-none py-2", inputClass)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this story…" />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Tags <span className={dark ? "text-neutral-600" : "text-slate-400"}>(comma-separated)</span>
            </label>
            <input className={cn("h-8 text-xs", inputClass)} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. frontend, sprint-1" />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>Status</label>
            <select
              className={cn("h-8 w-full rounded border px-2 text-xs outline-none focus:border-violet-500", dark ? "border-neutral-700 bg-neutral-950 text-neutral-200" : "border-slate-300 bg-white text-slate-950")}
              value={statusId ?? ""}
              onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Default</option>
              {statuses.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={create.isPending || !subject.trim()}
            onClick={submit}
          >
            {create.isPending ? "Creating…" : "Create Story"}
          </button>
          <button
            className={cn("flex-1 rounded py-2 text-sm transition-colors", dark ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BoardSection ──────────────────────────────────────────────────────────────

type BoardSectionProps = DragSectionProps & {
  dark: boolean;
  projectId: number;
  confirm: (msg: string, cb: () => void) => void;
};

export function BoardSection({ dark, projectId, confirm, shellClass, dragHandlers, onDragStart }: BoardSectionProps) {
  const [boardOpen, setBoardOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedEpic, setExpandedEpic] = useState<number | null>(null);
  const [dialogEpic, setDialogEpic] = useState<Epic | null>(null);
  const [dialogStory, setDialogStory] = useState<Story | null>(null);
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const [createStoryEpicId, setCreateStoryEpicId] = useState<number | null>(null);
  const [storyIndexSyncedAt, setStoryIndexSyncedAt] = useState<Date | null>(null);

  const board = useBoard();
  const deleteEpic = useDeleteEpic();
  const deleteStory = useDeleteStory();
  const rebuildIndex = useRebuildStoryIndex();
  const storyStats = useStoryIndexStats();

  const epicCount = board.data?.length ?? 0;

  const q = filter.toLowerCase().trim();
  const filteredBoard = q
    ? (board.data ?? [])
        .map((epic) => {
          const epicMatch = epic.subject.toLowerCase().includes(q) || `#${epic.ref}`.includes(q);
          const filteredStories = epicMatch ? epic.stories : epic.stories.filter((s) => s.subject.toLowerCase().includes(q) || `#${s.ref}`.includes(q));
          return filteredStories.length > 0 ? { ...epic, stories: filteredStories } : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
    : (board.data ?? []);
  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";
  const strongTextClass = dark ? "text-white" : "text-slate-950";
  const bodyTextClass = dark ? "text-neutral-300" : "text-slate-700";

  return (
    <div {...dragHandlers} className={shellClass}>
      {typeof document !== "undefined" ? createPortal(
        <>
          {dialogEpic ? <EpicDialog epic={dialogEpic} onClose={() => setDialogEpic(null)} /> : null}
          {dialogStory ? <StoryDialog story={dialogStory} onClose={() => setDialogStory(null)} /> : null}
          {createEpicOpen ? <CreateEpicDialog onClose={() => setCreateEpicOpen(false)} /> : null}
          {createStoryEpicId !== null ? (
            <CreateStoryDialog epicId={createStoryEpicId} onClose={() => setCreateStoryEpicId(null)} />
          ) : null}
        </>,
        document.body,
      ) : null}
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Layers3 className="size-4" />}
          title="Epics & Stories"
          badge={`${epicCount}`}
          open={boardOpen}
          onClick={() => setBoardOpen(!boardOpen)}
          onDragStart={onDragStart}
          actions={
            <button
              onClick={(e) => { e.stopPropagation(); setFilterOpen((v) => !v); if (filterOpen) setFilter(""); }}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                filterOpen || filter
                  ? "bg-violet-500/20 text-violet-400"
                  : dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-400 hover:text-slate-600",
              )}
            >
              Filter
            </button>
          }
        />
        {boardOpen ? (
          <div className={cn("space-y-3 p-3 text-sm", expandedPanelClass)}>
            {filterOpen && (
              <div className="relative">
                <input
                  autoFocus
                  className={cn(
                    "w-full rounded border py-1 pl-2 pr-7 text-xs outline-none focus:border-violet-500",
                    dark ? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
                  )}
                  placeholder="Filter epics & stories…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {filter && (
                  <button onClick={() => setFilter("")} className={cn("absolute right-2 top-1/2 -translate-y-1/2", subduedTextClass)}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className={cn("flex items-center justify-between", subduedTextClass)}>
              <span>{epicCount} epic(s)</span>
              <div className="flex gap-2">
                <button
                  className="flex items-center gap-1 rounded border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-400 transition-colors hover:bg-violet-500/20"
                  onClick={() => setCreateEpicOpen(true)}
                >
                  <Plus className="size-3" /> Create New Epic
                </button>
                <button
                  className="flex items-center gap-1 rounded border border-neutral-600 px-2 py-1.5 text-neutral-300 transition-colors hover:border-violet-500/50 hover:text-violet-300"
                  onClick={() => toast.promise(board.refetch(), { loading: "Refreshing…", success: "Board refreshed", error: "Failed to refresh board" })}
                >
                  <RefreshCw className="size-3" />
                </button>
              </div>
            </div>
            {storyStats.data && storyStats.data.total > 0 ? (
              <div className={cn("rounded border p-2", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className={cn("text-xs font-semibold uppercase tracking-wide", dark ? "text-neutral-500" : "text-slate-500")}>Story Progress</div>
                  {storyIndexSyncedAt ? (
                    <div className={cn("text-[10px]", dark ? "text-neutral-600" : "text-slate-400")}>
                      synced {storyIndexSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {(
                    [
                      { label: "Phase 2 Designed", count: storyStats.data.phase2_designed },
                      { label: "Phase 3 Proposed", count: storyStats.data.phase3_proposed },
                      { label: "Phase 4 Tested",   count: storyStats.data.phase4_tested },
                      { label: "Phase 5 Deployed", count: storyStats.data.phase5_deployed },
                    ] as const
                  ).map(({ label, count }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className={cn("w-24 shrink-0 text-xs", dark ? "text-neutral-400" : "text-slate-600")}>{label}</div>
                      <div className={cn("relative h-1.5 flex-1 rounded-full", dark ? "bg-neutral-700" : "bg-slate-200")}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-violet-500"
                          style={{ width: `${Math.round((count / storyStats.data!.total) * 100)}%` }}
                        />
                      </div>
                      <div className={cn("w-8 text-right text-xs", dark ? "text-neutral-400" : "text-slate-500")}>{count}/{storyStats.data.total}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {(() => {
              if (!board.data || !storyStats.data) return null;
              const boardTotal = board.data.reduce((sum, epic) => sum + epic.stories.length, 0);
              const indexTotal = storyStats.data.total;
              if (boardTotal === indexTotal) return null;
              return (
                <div className={cn("flex items-center justify-between rounded border px-2 py-1.5 text-xs", dark ? "border-amber-700/50 bg-amber-950/30 text-amber-300" : "border-amber-400/50 bg-amber-50 text-amber-700")}>
                  <span>Story index out of sync — {boardTotal} on board, {indexTotal} indexed</span>
                  <button
                    className="ml-2 shrink-0 rounded px-1.5 py-0.5 font-semibold underline hover:no-underline disabled:opacity-50"
                    disabled={rebuildIndex.isPending}
                    onClick={() => rebuildIndex.mutate(undefined, {
                      onSuccess: () => { setStoryIndexSyncedAt(new Date()); toast.success("Story index rebuilt"); },
                      onError: () => toast.error("Failed to rebuild story index"),
                    })}
                  >
                    {rebuildIndex.isPending ? "Rebuilding…" : "Rebuild"}
                  </button>
                </div>
              );
            })()}
            {board.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-6 w-4/5" />
              </div>
            ) : null}
            {!board.isLoading && q && filteredBoard.length === 0 && (
              <div className={subduedTextClass}>No matches.</div>
            )}
            {!board.isLoading && filteredBoard.map((epic) => (
              <div key={epic.id}>
                <div className="flex w-full items-center gap-1">
                  <button
                    className={cn("flex flex-1 items-center gap-1 text-left font-semibold transition-colors hover:text-violet-300", strongTextClass)}
                    onClick={() => setExpandedEpic(expandedEpic === epic.id ? null : epic.id)}
                  >
                    {expandedEpic === epic.id ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    #{epic.ref} {epic.subject}
                  </button>
                  <button
                    className="grid size-6 place-items-center rounded text-neutral-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
                    onClick={() => setDialogEpic(epic)}
                    title="Edit epic"
                  >
                    <Info className="size-3" />
                  </button>
                  <button
                    className="grid size-6 place-items-center rounded text-red-400 transition-colors hover:bg-red-500/20"
                    onClick={() => confirm(`Delete epic "${epic.subject}" and all its stories?`, () => deleteEpic.mutate(epic.id))}
                    title="Delete epic"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                {expandedEpic === epic.id ? (
                  <div className={cn("mt-2 space-y-2 pl-4", bodyTextClass)}>
                    <button
                      className="flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-400 transition-colors hover:bg-violet-500/20"
                      onClick={() => setCreateStoryEpicId(epic.id)}
                    >
                      <Plus className="size-3" /> Story
                    </button>
                    {epic.stories.map((story) => (
                      <div key={story.id}>
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-xs">#{story.ref} {story.subject}</span>
                          <button
                            className="grid size-5 place-items-center rounded text-neutral-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
                            onClick={() => setDialogStory(story)}
                            title="Edit story"
                          >
                            <Info className="size-3" />
                          </button>
                          <button
                            className="grid size-5 place-items-center rounded text-red-400 transition-colors hover:bg-red-500/20"
                            onClick={() => confirm(`Delete story "${story.subject}"?`, () => deleteStory.mutate(story.id))}
                            title="Delete story"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!board.isLoading && !board.data?.length ? <div className={subduedTextClass}>No epics yet.</div> : null}

          </div>
        ) : null}
      </section>
    </div>
  );
}
