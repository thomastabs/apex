"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  GripVertical,
  Info,
  Layers3,
  Moon,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Send,
  Sun,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import {
  useAiConfig,
  useBoard,
  useContextFiles,
  useCreateEpic,
  useCreateProject,
  useCreateStory,
  useDeleteEpic,
  useDeleteProject,
  useDeleteStory,
  useInviteUser,
  useLogin,
  useMe,
  useProjects,
  useRebuildStoryIndex,
  useRemoveMember,
  useResetAllContextFiles,
  useResetContextFile,
  useSaveAiConfig,
  useSaveServerConfig,
  useServerConfig,
  useStoryStatuses,
  useUpdateContextFile,
  useUpdateEpic,
  useUpdateMemberRole,
  useUpdateStory,
  useUsers,
} from "@/lib/hooks/use-workspace";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import type { Epic, Story } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";

// ── constants ─────────────────────────────────────────────────────────────────

const FALLBACK_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", role: "Fast" },
  { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6", role: "Smart" },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "TO";
  return clean.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function contextSizeColor(totalChars: number): string {
  if (totalChars < 30_000) return "#4ade80";
  if (totalChars < 80_000) return "#facc15";
  return "#f87171";
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-violet-300">{children}</h2>
  );
}

function PanelHeader({
  icon, title, badge, open, onClick, onDragStart,
}: {
  icon: React.ReactNode; title: string; badge?: string; open: boolean; onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <div className="flex items-center border-b border-neutral-800 transition-colors hover:bg-violet-500/5">
      {onDragStart ? (
        <div
          draggable
          onDragStart={onDragStart}
          onClickCapture={(e) => e.stopPropagation()}
          className="flex h-14 w-8 shrink-0 cursor-grab items-center justify-center pl-2 text-neutral-600 transition-colors hover:text-neutral-400 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="size-3.5" />
        </div>
      ) : null}
      <button
        className="flex h-14 flex-1 items-center gap-2 px-4 text-left"
        onClick={onClick}
      >
        {open ? <ChevronDown className="size-3 text-neutral-500" /> : <ChevronRight className="size-3 text-neutral-500" />}
        <span className="text-violet-400">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-neutral-100">{title}</span>
        {badge ? <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-400">{badge}</span> : null}
      </button>
    </div>
  );
}

function ConfirmDialog({
  open, message, onConfirm, onCancel,
}: {
  open: boolean; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80" onClick={onCancel}>
      <div
        className="w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-5 text-sm text-neutral-200">{message}</p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded bg-red-700 py-2 text-sm font-semibold text-white hover:bg-red-600"
            onClick={onConfirm}
          >
            Confirm
          </button>
          <button
            className="flex-1 rounded bg-neutral-800 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EpicDialog({ epic, onClose }: { epic: Epic; onClose: () => void }) {
  const [subject, setSubject] = useState(epic.subject);
  const [description, setDescription] = useState(epic.description);
  const [tagsInput, setTagsInput] = useState((epic.tags ?? []).join(", "));
  const update = useUpdateEpic();

  function save() {
    if (!epic.version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      { epicId: epic.id, version: epic.version, fields: { subject, description, tags } },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-bold text-white">Epic #{epic.ref}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Title</label>
            <input
              className="h-9 w-full rounded border border-violet-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Epic title"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Description</label>
            <textarea
              className="h-32 w-full resize-none rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-violet-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the epic…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Tags <span className="text-neutral-600">(comma-separated)</span></label>
            <input
              className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 outline-none focus:border-violet-500"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. backend, auth, v2"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={update.isPending || !subject.trim()}
            onClick={save}
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button
            className="flex-1 rounded bg-neutral-800 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
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
  const [subject, setSubject] = useState(story.subject);
  const [description, setDescription] = useState(story.description ?? "");
  const [tagsInput, setTagsInput] = useState((story.tags ?? []).join(", "));
  const update = useUpdateStory();

  function save() {
    if (!story.version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      { storyId: story.id, version: story.version, fields: { subject, description, tags } },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-bold text-white">Story #{story.ref}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Title</label>
            <input
              className="h-9 w-full rounded border border-violet-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Story title"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Description</label>
            <textarea
              className="h-28 w-full resize-none rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-violet-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the story…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Tags <span className="text-neutral-600">(comma-separated)</span></label>
            <input
              className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 outline-none focus:border-violet-500"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. frontend, ui, sprint-1"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={update.isPending || !subject.trim()}
            onClick={save}
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button
            className="flex-1 rounded bg-neutral-800 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
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
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const create = useCreateEpic();

  function submit() {
    if (!subject.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate(
      { subject: subject.trim(), description, tags },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-bold text-white">Create New Epic</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              className="h-9 w-full rounded border border-violet-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Epic title"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Description</label>
            <textarea
              className="h-28 w-full resize-none rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-violet-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this epic…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Tags <span className="text-neutral-600">(comma-separated)</span>
            </label>
            <input
              className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 outline-none focus:border-violet-500"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. backend, auth, v2"
            />
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
            className="flex-1 rounded bg-neutral-800 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
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
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [statusId, setStatusId] = useState<number | undefined>(undefined);
  const create = useCreateStory();
  const statuses = useStoryStatuses();

  function submit() {
    if (!subject.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate(
      { epicId, subject: subject.trim(), description, tags, statusId },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-bold text-white">Create New Story</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              className="h-9 w-full rounded border border-violet-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-violet-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Story title"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Description</label>
            <textarea
              className="h-24 w-full resize-none rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-violet-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this story…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Tags <span className="text-neutral-600">(comma-separated)</span>
            </label>
            <input
              className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-200 outline-none focus:border-violet-500"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. frontend, sprint-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Status</label>
            <select
              className="h-8 w-full rounded border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-200 outline-none focus:border-violet-500"
              value={statusId ?? ""}
              onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Default</option>
              {statuses.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
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
            className="flex-1 rounded bg-neutral-800 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EpicEditRow({ epic, onDone }: { epic: Epic; onDone: () => void }) {
  const [subject, setSubject] = useState(epic.subject);
  const [description, setDescription] = useState(epic.description);
  const [tagsInput, setTagsInput] = useState((epic.tags ?? []).join(", "));
  const update = useUpdateEpic();

  function save() {
    if (!epic.version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      { epicId: epic.id, version: epic.version, fields: { subject, description, tags } },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="mt-2 space-y-2 pl-5">
      <input
        className="h-8 w-full rounded border border-violet-700 bg-neutral-950 px-2 text-sm text-white"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Epic title"
      />
      <textarea
        className="h-20 w-full resize-none rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-xs text-neutral-200"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
      />
      <input
        className="h-7 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-xs text-neutral-200"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Tags (comma-separated)"
      />
      <div className="flex gap-2">
        <button
          className="rounded bg-violet-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          disabled={update.isPending || !subject.trim()}
          onClick={save}
        >
          Save
        </button>
        <button className="rounded bg-neutral-700 px-3 py-1 text-xs text-neutral-300" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StoryEditRow({ story, onDone }: { story: Story; onDone: () => void }) {
  const [subject, setSubject] = useState(story.subject);
  const [tagsInput, setTagsInput] = useState((story.tags ?? []).join(", "));
  const update = useUpdateStory();

  function save() {
    if (!story.version) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    update.mutate(
      { storyId: story.id, version: story.version, fields: { subject, tags } },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex gap-1">
        <input
          className="h-7 flex-1 rounded border border-violet-700 bg-neutral-950 px-2 text-xs text-white"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Story title"
        />
        <button
          className="rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          disabled={update.isPending || !subject.trim()}
          onClick={save}
        >
          ✓
        </button>
        <button className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300" onClick={onDone}>
          ✕
        </button>
      </div>
      <input
        className="h-6 w-full rounded border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-300"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Tags (comma-separated)"
      />
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    async function render() {
      const { marked } = await import("marked");
      const result = await marked.parse(content || "");
      setHtml(result);
    }
    void render();
  }, [content]);

  return (
    <div
      className="prose prose-invert prose-sm max-w-none overflow-auto p-3 text-xs leading-5"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ContextEditor({
  file,
  onConfirm,
}: {
  file: { filename: string; label: string; content: string };
  onConfirm: (msg: string, cb: () => void) => void;
}) {
  const [value, setValue] = useState(file.content);
  const [mdPreview, setMdPreview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useUpdateContextFile();
  const reset = useResetContextFile();

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setValue(file.content);
  }, [file.content]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleChange(newValue: string) {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      update.mutate({ filename: file.filename, content: newValue });
    }, 700);
  }

  const statusLabel = update.isPending ? "Saving…" : update.isError ? "Error" : update.isSuccess ? "Saved" : "";
  const statusColor = update.isError ? "text-red-400" : "text-neutral-500";

  return (
    <div className="border-t border-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1">
        <span className="text-xs text-neutral-500">{value.length} ch</span>
        {statusLabel ? <span className={cn("text-xs", statusColor)}>{statusLabel}</span> : null}
        <div className="flex-1" />
        <button
          className={cn(
            "rounded px-2 py-0.5 text-xs",
            mdPreview ? "bg-violet-800 text-violet-100" : "text-neutral-400 hover:bg-neutral-800",
          )}
          onClick={() => setMdPreview(!mdPreview)}
        >
          {mdPreview ? "Raw" : "Preview"}
        </button>
      </div>
      {mdPreview ? (
        <MarkdownPreview content={value} />
      ) : (
        <textarea
          className="h-56 w-full resize-y bg-neutral-950 p-3 font-mono text-xs leading-5 text-neutral-200 outline-none"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
      <div className="grid grid-cols-2 gap-2 p-2">
        <button
          className="flex h-8 items-center justify-center gap-1 rounded bg-neutral-700 text-xs text-neutral-200 hover:bg-neutral-600"
          onClick={() => downloadFile(file.filename, value)}
        >
          <Download className="size-3" />
          Download
        </button>
        <button
          className="h-8 rounded bg-red-950/70 text-xs font-semibold text-red-300 disabled:opacity-50"
          disabled={reset.isPending}
          onClick={() =>
            onConfirm(`Reset ${file.label} to default?`, () => reset.mutate(file.filename))
          }
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

const CONTEXT_FILE_PHASES: Record<string, string[]> = {
  "/phase1": ["memory-bank.md", "functional-spec.md"],
  "/phase2": ["memory-bank.md", "functional-spec.md", "technical-spec.md", "design-bundle.md"],
};

function useVisibleContextFiles(
  files: Array<{ filename: string; label: string; content: string; chars: number }> | undefined,
) {
  const pathname = usePathname();
  return useMemo(() => {
    if (!files) return [];
    const allowed = CONTEXT_FILE_PHASES[pathname];
    if (!allowed) return files;
    return files.filter((f) => allowed.includes(f.filename));
  }, [files, pathname]);
}

// ── Login section ────────────────────────────────────────────────────────────

function LoginSection({ taigaWebUrl }: { taigaWebUrl: string }) {
  const setAuth = useSessionStore((state) => state.setAuth);
  const clearSession = useSessionStore((state) => state.clearSession);
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const login = useLogin();
  const me = useMe();

  const [mode, setMode] = useState<"password" | "token">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tokenInput, setTokenInput] = useState(taigaToken);
  const [loginError, setLoginError] = useState("");

  const displayName = me.data?.full_name || me.data?.username || (taigaToken ? "Taiga User" : "");
  const email = me.data?.email || "";

  if (taigaToken) {
    return (
      <div className="flex items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded bg-violet-950 text-xs font-bold text-violet-300">
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{displayName || "Taiga User"}</div>
          <div className="truncate text-xs text-neutral-500">{email || "Authenticated"}</div>
        </div>
        <button
          className="shrink-0 rounded border border-violet-500/30 px-2 py-1 text-xs text-violet-400 transition-colors hover:border-violet-500/60 hover:text-violet-300"
          onClick={() => clearSession()}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 rounded-md bg-neutral-800 p-1">
        <button
          className={cn("h-9 rounded text-xs text-neutral-200", mode === "password" && "bg-violet-600 text-white")}
          onClick={() => setMode("password")}
        >
          Username / Password
        </button>
        <button
          className={cn("h-9 rounded text-xs text-neutral-200", mode === "token" && "bg-violet-600 text-white")}
          onClick={() => setMode("token")}
        >
          Auth Token
        </button>
      </div>
      {mode === "password" ? (
        <>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
            placeholder="Username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
            placeholder="Password"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setLoginError("");
                login.mutate(
                  { username, password },
                  {
                    onSuccess: (data) => { setAuth({ taigaToken: data.auth_token }); },
                    onError: () => setLoginError("Login failed — check credentials."),
                  },
                );
              }
            }}
          />
        </>
      ) : (
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          className="h-9 w-full rounded border border-violet-500 bg-neutral-950 px-3 text-sm text-white outline-none"
          placeholder="Taiga auth token"
        />
      )}
      {loginError ? <p className="text-xs text-red-400">{loginError}</p> : null}
      <button
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-violet-700 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
        disabled={login.isPending}
        onClick={() => {
          setLoginError("");
          if (mode === "password") {
            login.mutate(
              { username, password },
              {
                onSuccess: (data) => { setAuth({ taigaToken: data.auth_token }); },
                onError: () => setLoginError("Login failed — check credentials."),
              },
            );
          } else if (tokenInput.trim()) {
            setAuth({ taigaToken: tokenInput.trim() });
          }
        }}
      >
        <Send className="size-4" />
        {login.isPending ? "Signing in..." : "Sign in"}
      </button>
      <a
        href={taigaWebUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-violet-300"
      >
        <UserPlus className="size-3" />
        Create a Taiga account
      </a>
    </div>
  );
}

// ── Token revalidation on mount ───────────────────────────────────────────────

function useRestoreSession() {
  const taigaToken = useSessionStore((s) => s.taigaToken);
  const clearSession = useSessionStore((s) => s.clearSession);
  const me = useMe();

  useEffect(() => {
    if (!taigaToken) return;
    if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
      clearSession();
    }
  }, [taigaToken, me.isError, me.error, clearSession]);
}

// ── Server-side project config restore ───────────────────────────────────────

function useRestoreProjectConfig() {
  const projectId = useSessionStore((s) => s.projectId);
  const setProject = useSessionStore((s) => s.setProject);
  const projects = useProjects();
  const serverConfig = useServerConfig();

  useEffect(() => {
    if (projectId) return; // already have project in localStorage
    const serverId = serverConfig.data?.project_id;
    if (!serverId) return;
    // find project name from list if available
    const match = projects.data?.find((p) => p.id === serverId);
    setProject({ projectId: serverId, projectName: match?.name ?? "" });
  }, [projectId, serverConfig.data?.project_id, projects.data, setProject]);
}

// ── main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const sectionOrder = useUiStore((state) => state.sidebarSectionOrder);
  const setSectionOrder = useUiStore((state) => state.setSidebarSectionOrder);

  const taigaToken = useSessionStore((state) => state.taigaToken);
  const projectId = useSessionStore((state) => state.projectId);
  const projectName = useSessionStore((state) => state.projectName);
  const setProject = useSessionStore((state) => state.setProject);

  useRestoreSession();
  useRestoreProjectConfig();

  const [projectOpen, setProjectOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [localFastModel, setLocalFastModel] = useState("");
  const [localCoderModel, setLocalCoderModel] = useState("");
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const [createStoryEpicId, setCreateStoryEpicId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);
  const [expandedEpic, setExpandedEpic] = useState<number | null>(null);
  const [dialogEpic, setDialogEpic] = useState<import("@/lib/api/types").Epic | null>(null);
  const [dialogStory, setDialogStory] = useState<import("@/lib/api/types").Story | null>(null);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [inviteValue, setInviteValue] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [editingMemberRole, setEditingMemberRole] = useState<number | null>(null);
  const [memberRoleValue, setMemberRoleValue] = useState<number>(0);

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const me = useMe();
  const projects = useProjects();
  const contextFiles = useContextFiles();
  const board = useBoard();
  const users = useUsers();
  const invite = useInviteUser();
  const removeMember = useRemoveMember();
  const updateMemberRole = useUpdateMemberRole();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const createEpic = useCreateEpic();
  const deleteEpic = useDeleteEpic();
  const createStory = useCreateStory();
  const deleteStory = useDeleteStory();
  const rebuildIndex = useRebuildStoryIndex();
  const resetAll = useResetAllContextFiles();
  const saveServerConfig = useSaveServerConfig();
  const aiConfig = useAiConfig();
  const saveAiConfigMutation = useSaveAiConfig();

  const serverConfig = useServerConfig();
  const taigaWebUrl = serverConfig.data?.taiga_web_url ?? "https://tree.taiga.io";
  const availableModels = aiConfig.data?.available_models ?? FALLBACK_MODELS;

  // Migrate stored section order when new section IDs are added
  useEffect(() => {
    const known = ["project", "board", "users", "context", "ai", "resources"];
    const missing = known.filter((id) => !sectionOrder.includes(id));
    if (missing.length) setSectionOrder([...sectionOrder, ...missing]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (aiConfig.data) {
      setLocalFastModel(aiConfig.data.fast_model);
      setLocalCoderModel(aiConfig.data.coder_model);
    }
  }, [aiConfig.data]);

  const projectOptions = useMemo(() => projects.data ?? [], [projects.data]);
  const activeProjectName = projectName || (projectId ? `Project ${projectId}` : "No project selected");
  const totalChars = contextFiles.data?.total_chars ?? 0;
  const memberCount = users.data?.memberships.length ?? 0;
  const epicCount = board.data?.length ?? 0;
  const defaultRoleId = roleId ?? users.data?.roles[0]?.id ?? 0;
  const dark = theme === "dark";
  const sizeColor = contextSizeColor(totalChars);

  const visibleFiles = useVisibleContextFiles(contextFiles.data?.files);

  const memoryBank = contextFiles.data?.files.find((f) => f.filename === "memory-bank.md")?.content ?? "";
  const hasProjectConcept = useMemo(() => {
    if (!memoryBank) return false;
    const match = /^##\s+Project\s+Concept[^\n]*\n([\s\S]*?)(?=^##\s|\Z)/im.exec(memoryBank);
    if (!match) return false;
    const text = match[1].trim();
    return Boolean(text) && !text.startsWith("<!--");
  }, [memoryBank]);

  function confirm(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

  function reorderSections(source: string, target: string) {
    if (source === target) return;
    const next = [...sectionOrder];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, source);
    setSectionOrder(next);
  }

  function makeDragSectionProps(id: string) {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(id); },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragSourceRef.current) reorderSections(dragSourceRef.current, id);
        setDragOver(null);
        dragSourceRef.current = null;
      },
    };
  }

  function makeDragStartHandler(id: string) {
    return (e: React.DragEvent) => {
      dragSourceRef.current = id;
      e.dataTransfer.effectAllowed = "move";
    };
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (e.buttons !== 1) return;
      setSidebarWidth(e.clientX);
    }
    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    function onDown(e: MouseEvent) {
      e.preventDefault();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    const handle = document.getElementById("apex-sidebar-resizer");
    handle?.addEventListener("mousedown", onDown);
    return () => {
      handle?.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setSidebarWidth]);

  if (sidebarCollapsed) {
    return (
      <aside className={cn("sticky top-0 h-screen w-12 shrink-0 border-r", dark ? "border-neutral-700 bg-[#121113]" : "border-slate-300 bg-[#e8edf8]")}>
        <button className="grid size-12 place-items-center text-violet-400" onClick={() => setSidebarCollapsed(false)}>
          <PanelLeftOpen className="size-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "apex-sidebar relative sticky top-0 h-screen shrink-0 overflow-y-auto border-r text-neutral-100",
        dark ? "border-neutral-700 bg-[#121113]" : "apex-sidebar-light border-slate-300 bg-[#e8edf8]",
      )}
      style={{ width: sidebarWidth }}
    >
      <div id="apex-sidebar-resizer" className="absolute right-0 top-0 z-40 h-full w-1 cursor-col-resize" />

      {typeof document !== "undefined" ? createPortal(
        <>
          <ConfirmDialog
            open={Boolean(confirmState)}
            message={confirmState?.message ?? ""}
            onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
            onCancel={() => setConfirmState(null)}
          />
          {dialogEpic ? <EpicDialog epic={dialogEpic} onClose={() => setDialogEpic(null)} /> : null}
          {dialogStory ? <StoryDialog story={dialogStory} onClose={() => setDialogStory(null)} /> : null}
          {createEpicOpen ? <CreateEpicDialog onClose={() => setCreateEpicOpen(false)} /> : null}
          {createStoryEpicId !== null ? (
            <CreateStoryDialog epicId={createStoryEpicId} onClose={() => setCreateStoryEpicId(null)} />
          ) : null}
        </>,
        document.body,
      ) : null}

      <header className="flex h-[58px] items-center border-b border-neutral-800 px-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-1">
          <span className="text-2xl font-bold text-violet-400">Apex</span>
          <span className="truncate text-sm text-neutral-500">· Spec-Anchored</span>
        </div>
        <button onClick={toggleTheme} className="mr-2 grid size-8 place-items-center rounded text-white hover:bg-neutral-800" aria-label="Toggle theme">
          {dark ? <Moon className="size-5" /> : <Sun className="size-5 text-slate-800" />}
        </button>
        <button className="grid size-8 place-items-center rounded text-neutral-300 hover:bg-neutral-800" onClick={() => setSidebarCollapsed(true)}>
          <span className="text-xl leading-none">↤</span>
        </button>
      </header>

      {/* ── Account ── */}
      <section className="border-b border-neutral-800 px-4 py-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-500">
            <Zap className="size-3" />
            Anthropic
          </span>
          <span className="rounded border border-violet-400/40 bg-violet-500/10 px-2 py-1 font-mono text-xs text-violet-400">
            {aiConfig.data?.coder_model ?? "claude-sonnet-4-6"}
          </span>
          {aiConfig.data && aiConfig.data.fast_model !== aiConfig.data.coder_model ? (
            <span className="rounded border border-neutral-700 bg-neutral-800/50 px-2 py-1 font-mono text-xs text-neutral-400">
              {aiConfig.data.fast_model} (fast)
            </span>
          ) : null}
        </div>
        <LoginSection taigaWebUrl={taigaWebUrl} />
      </section>

      {/* ── Draggable sections ── */}
      {sectionOrder.map((id) => {
          const isOver = dragOver === id;
          const dragHandlers = makeDragSectionProps(id);

          // ai / resources are auth-free; everything below requires a session
          if (id !== "ai" && id !== "resources" && !taigaToken) return null;

          if (id === "project") {
            return (
              <div key="project" {...dragHandlers} className={cn("transition-all", isOver && "outline outline-2 outline-violet-500 outline-offset-[-2px]")}>
                <section className="border-b border-neutral-800">
                  <PanelHeader
                    icon={<FolderOpen className="size-4" />}
                    title={activeProjectName}
                    open={projectOpen}
                    onClick={() => setProjectOpen(!projectOpen)}
                    onDragStart={makeDragStartHandler("project")}
                  />
                  {projectOpen ? (
                    <div className="space-y-2 bg-[#181719] p-3">
                      <select
                        className="h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
                        value={projectId ?? ""}
                        onChange={(e) => {
                          const selected = projectOptions.find((p) => p.id === Number(e.target.value));
                          if (selected) {
                            setProject({ projectId: selected.id, projectName: selected.name });
                            saveServerConfig.mutate(selected.id);
                          }
                        }}
                      >
                        <option value="">{projects.isLoading ? "Loading..." : "Select project"}</option>
                        {projectOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className="flex h-8 items-center justify-center gap-1 rounded border border-neutral-600 text-sm text-neutral-300 transition-colors hover:border-violet-500/50 hover:text-violet-300"
                          onClick={() => projects.refetch()}
                        >
                          <RefreshCw className="size-3" /> Refresh
                        </button>
                        <button
                          className="flex h-8 items-center justify-center gap-1 rounded border border-violet-500/40 bg-violet-500/10 text-sm font-semibold text-violet-400 transition-colors hover:bg-violet-500/20"
                          onClick={() => {
                            const name = window.prompt("Project name");
                            if (name?.trim()) createProject.mutate({ name: name.trim(), description: "" });
                          }}
                        >
                          <Plus className="size-3" /> Create New
                        </button>
                      </div>
                      {projectId ? (
                        <button
                          className="flex h-8 w-full items-center justify-center gap-2 rounded border border-red-500/40 bg-red-500/10 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          disabled={deleteProject.isPending}
                          onClick={() =>
                            confirm("Delete this Taiga project and all its data?", () => deleteProject.mutate(projectId))
                          }
                        >
                          <Trash2 className="size-3" />
                          Delete Project
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>
            );
          }

          if (id === "board" && projectId) {
            return (
              <div key="board" {...dragHandlers} className={cn("transition-all", isOver && "outline outline-2 outline-violet-500 outline-offset-[-2px]")}>
                <section className="border-b border-neutral-800">
                  <PanelHeader
                    icon={<Layers3 className="size-4" />}
                    title="Epics & Stories"
                    badge={`${epicCount}`}
                    open={boardOpen}
                    onClick={() => setBoardOpen(!boardOpen)}
                    onDragStart={makeDragStartHandler("board")}
                  />
                  {boardOpen ? (
                    <div className="space-y-3 bg-[#181719] p-3 text-sm">
                      <div className="flex items-center justify-between text-neutral-500">
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
                            onClick={() => board.refetch()}
                          >
                            <RefreshCw className="size-3" />
                          </button>
                        </div>
                      </div>
                      {board.data?.map((epic) => (
                        <div key={epic.id}>
                          <div className="flex w-full items-center gap-1">
                            <button
                              className="flex flex-1 items-center gap-1 text-left font-semibold text-white transition-colors hover:text-violet-300"
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
                              onClick={() =>
                                confirm(`Delete epic "${epic.subject}" and all its stories?`, () => deleteEpic.mutate(epic.id))
                              }
                              title="Delete epic"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                          {expandedEpic === epic.id ? (
                            <div className="mt-2 space-y-2 pl-4 text-neutral-300">
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
                                      onClick={() =>
                                        confirm(`Delete story "${story.subject}"?`, () => deleteStory.mutate(story.id))
                                      }
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
                      {!board.data?.length ? <div className="text-neutral-500">No epics yet.</div> : null}
                    </div>
                  ) : null}
                </section>
              </div>
            );
          }

          if (id === "users" && projectId) {
            return (
              <div key="users" {...dragHandlers} className={cn("transition-all", isOver && "outline outline-2 outline-violet-500 outline-offset-[-2px]")}>
                <section className="border-b border-neutral-800">
                  <PanelHeader
                    icon={<Users className="size-4" />}
                    title="Users & Roles"
                    badge={`${memberCount}`}
                    open={usersOpen}
                    onClick={() => setUsersOpen(!usersOpen)}
                    onDragStart={makeDragStartHandler("users")}
                  />
                  {usersOpen ? (
                    <div className="space-y-3 bg-[#181719] p-3 text-sm">
                      {users.data?.memberships.map((member) => (
                        <div key={member.id} className="border-b border-neutral-700 pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-white">{member.full_name || member.username || member.email}</div>
                              <div className="text-xs text-neutral-500">{member.email}</div>
                            </div>
                            {!member.is_owner ? (
                              <button
                                className="shrink-0 rounded text-red-400 hover:text-red-300"
                                title="Remove member"
                                onClick={() =>
                                  confirm(`Remove ${member.full_name || member.username} from project?`, () =>
                                    removeMember.mutate(member.id),
                                  )
                                }
                              >
                                <Trash2 className="size-3" />
                              </button>
                            ) : null}
                          </div>
                          {editingMemberRole === member.id ? (
                            <div className="mt-2 flex gap-2">
                              <select
                                className="h-7 flex-1 rounded border border-neutral-600 bg-neutral-950 px-2 text-xs text-white"
                                value={memberRoleValue || member.role || 0}
                                onChange={(e) => setMemberRoleValue(Number(e.target.value))}
                              >
                                {users.data?.roles.map((r) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                              <button
                                className="rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white"
                                onClick={() => {
                                  updateMemberRole.mutate(
                                    { membershipId: member.id, roleId: memberRoleValue || member.role || 0 },
                                    { onSuccess: () => setEditingMemberRole(null) },
                                  );
                                }}
                              >
                                Save
                              </button>
                              <button
                                className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300"
                                onClick={() => setEditingMemberRole(null)}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              className="mt-1 inline-block rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400 transition-colors hover:border-violet-500/60 hover:bg-violet-500/20"
                              onClick={() => { setEditingMemberRole(member.id); setMemberRoleValue(member.role ?? 0); }}
                            >
                              {member.role_name || "Member"}
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="space-y-2">
                        <div className="font-semibold text-white">Invite member</div>
                        <input
                          value={inviteValue}
                          onChange={(e) => setInviteValue(e.target.value)}
                          className="h-8 w-full rounded border border-violet-700 bg-neutral-950 px-2 text-sm text-white"
                          placeholder="Username or email"
                        />
                        <select
                          value={defaultRoleId}
                          onChange={(e) => setRoleId(Number(e.target.value))}
                          className="h-8 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
                        >
                          <option value={0}>Role</option>
                          {users.data?.roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <button
                          className="h-8 w-full rounded bg-violet-600 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                          disabled={!inviteValue.trim() || !defaultRoleId || invite.isPending}
                          onClick={() => invite.mutate({ usernameOrEmail: inviteValue, roleId: defaultRoleId })}
                        >
                          Send invite
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            );
          }

          if (id === "context" && projectId) {
            return (
              <div key="context" {...dragHandlers} className={cn("transition-all", isOver && "outline outline-2 outline-violet-500 outline-offset-[-2px]")}>
                <section className="border-b border-neutral-800">
                  <PanelHeader
                    icon={<FileText className="size-4" />}
                    title="Active Context"
                    badge={`${totalChars} ch`}
                    open={contextOpen}
                    onClick={() => setContextOpen(!contextOpen)}
                    onDragStart={makeDragStartHandler("context")}
                  />
                  {contextOpen ? (
                    <div className="px-4 py-4">
                      <div className="mb-3 text-sm text-neutral-500">
                        context:{" "}
                        <span className="font-bold" style={{ color: sizeColor }}>
                          {totalChars} chars
                        </span>
                      </div>
                      {!hasProjectConcept && contextFiles.data ? (
                        <div className="mb-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                          Memory Bank lacks <code>## Project Concept</code>. Add one for best AI results.
                        </div>
                      ) : null}
                      <div className="mb-4 space-y-3">
                        {visibleFiles.map((file) => (
                          <div key={file.filename} className="rounded-md border border-neutral-800 bg-[#181719]">
                            <button
                              className="flex h-10 w-full items-center gap-3 px-4 text-left"
                              onClick={() => setExpandedContext(expandedContext === file.filename ? null : file.filename)}
                            >
                              <ChevronRight className={cn("size-3 text-neutral-500", expandedContext === file.filename && "rotate-90")} />
                              <FileText className="size-4 text-violet-400" />
                              <span className="flex-1 text-sm font-medium text-white">{file.label}</span>
                              <span className="text-xs text-neutral-500">{file.chars} ch</span>
                            </button>
                            {expandedContext === file.filename ? (
                              <ContextEditor file={file} onConfirm={confirm} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <button
                          className="flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 hover:text-violet-200"
                          onClick={() => contextFiles.refetch()}
                        >
                          <span>Reload context</span>
                          <RefreshCw className="size-4 text-violet-400" />
                        </button>
                        <button
                          className="flex h-9 w-full items-center justify-between rounded border border-violet-500/30 px-3 text-sm text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/15 hover:text-violet-200 disabled:opacity-40"
                          disabled={rebuildIndex.isPending}
                          onClick={() => rebuildIndex.mutate()}
                        >
                          <span>Rebuild story index</span>
                          <RefreshCw className="size-4 text-violet-400" />
                        </button>
                        <button
                          className="flex h-9 w-full items-center justify-between rounded border border-red-500/30 px-3 text-sm text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
                          disabled={resetAll.isPending}
                          onClick={() =>
                            confirm("Reset ALL context files to defaults? This cannot be undone.", () => resetAll.mutate())
                          }
                        >
                          <span>Reset all context files</span>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            );
          }

          // ── AI Models ─────────────────────────────────────────────────────
          if (id === "ai") {
            return (
              <div key="ai" {...dragHandlers} className={cn("transition-all", isOver && "outline outline-2 outline-violet-500 outline-offset-[-2px]")}>
                <section className="border-b border-neutral-800">
                  <PanelHeader
                    icon={<Bot className="size-4" />}
                    title="AI Models"
                    open={aiOpen}
                    onClick={() => setAiOpen(!aiOpen)}
                    onDragStart={makeDragStartHandler("ai")}
                  />
                  {aiOpen ? (
                    <div className="space-y-4 bg-[#181719] px-4 py-4 text-sm">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-neutral-400">
                          Discovery & Breakdown
                        </label>
                        <select
                          className="h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
                          value={localFastModel || (aiConfig.data?.fast_model ?? FALLBACK_MODELS[0].id)}
                          onChange={(e) => setLocalFastModel(e.target.value)}
                        >
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-neutral-400">
                          Architecture & Design
                        </label>
                        <select
                          className="h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
                          value={localCoderModel || (aiConfig.data?.coder_model ?? FALLBACK_MODELS[1].id)}
                          onChange={(e) => setLocalCoderModel(e.target.value)}
                        >
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="h-8 w-full rounded bg-violet-700 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                        disabled={saveAiConfigMutation.isPending || !taigaToken}
                        onClick={() =>
                          saveAiConfigMutation.mutate({
                            fast_model: localFastModel || FALLBACK_MODELS[0].id,
                            coder_model: localCoderModel || FALLBACK_MODELS[1].id,
                          })
                        }
                      >
                        {!taigaToken ? "Sign in to save" : saveAiConfigMutation.isPending ? "Saving…" : "Save"}
                      </button>
                      {saveAiConfigMutation.isSuccess ? (
                        <p className="text-center text-xs text-emerald-400">Model config saved.</p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>
            );
          }

          // ── Resources ──────────────────────────────────────────────────────
          if (id === "resources") {
            return (
              <div key="resources" {...dragHandlers} className={cn("transition-all", isOver && "outline outline-2 outline-violet-500 outline-offset-[-2px]")}>
                <section className="border-b border-neutral-800">
                  <PanelHeader
                    icon={<BookOpen className="size-4" />}
                    title="Resources"
                    open={resourcesOpen}
                    onClick={() => setResourcesOpen(!resourcesOpen)}
                    onDragStart={makeDragStartHandler("resources")}
                  />
                  {resourcesOpen ? (
                    <div className="bg-[#181719] px-4 py-3">
                      <p className="mb-2 text-xs font-semibold text-neutral-500">Taiga Documentation</p>
                      <div className="space-y-0.5">
                        {[
                          { href: "https://docs.taiga.io/", label: "User Guide" },
                          { href: "https://docs.taiga.io/api.html", label: "API Reference" },
                          { href: "https://community.taiga.io/", label: "Community Forum" },
                          { href: "https://github.com/taigaio", label: "GitHub" },
                        ].map(({ href, label }) => (
                          <a
                            key={href}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
                          >
                            <ExternalLink className="size-3 shrink-0" />
                            {label}
                          </a>
                        ))}
                      </div>
                      {taigaWebUrl ? (
                        <>
                          <p className="mb-2 mt-4 text-xs font-semibold text-neutral-500">Taiga Instance</p>
                          <a
                            href={taigaWebUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
                          >
                            <ExternalLink className="size-3 shrink-0" />
                            Open Taiga
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>
            );
          }

          return null;
        })}
      {!taigaToken ? (
        <section className="px-4 py-5">
          <p className="text-sm leading-6 text-neutral-500">
            Sign in and select a project to view board, users, and context files.
          </p>
        </section>
      ) : null}
    </aside>
  );
}
