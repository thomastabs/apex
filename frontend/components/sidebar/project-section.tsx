"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useProjectTemplates,
  useSaveServerConfig,
  useUpdateProject,
} from "@/lib/hooks/use-workspace";
import type { ProjectTemplate } from "@/lib/api/pm-types";
import { useSessionStore, useAuthContext } from "@/lib/stores/session-store";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { usePhase4Store } from "@/lib/stores/phase4-store";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import { cn, errMsg } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type ProjectSectionProps = DragSectionProps & {
  dark: boolean;
  confirm: (msg: string, cb: () => void) => void;
};

export function ProjectSection({ dark, confirm, shellClass, dragHandlers, onDragStart }: ProjectSectionProps) {
  const [projectOpen, setProjectOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const projectId = useSessionStore((s) => s.projectId);
  const projectName = useSessionStore((s) => s.projectName);
  const setProject = useSessionStore((s) => s.setProject);
  const clearPhase2Draft = usePhase2Store((s) => s.clearPhase2Draft);
  const clearPhase3Draft = usePhase3Store((s) => s.clearPhase3Draft);
  const clearPhase4Draft = usePhase4Store((s) => s.clearPhase4Draft);
  const clearPhase5Draft = usePhase5Store((s) => s.clearPhase5Draft);
  const auth = useAuthContext();
  const isJira = auth?.pmTool === "jira";

  const projects = useProjects();
  const projectTemplates = useProjectTemplates();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const saveServerConfig = useSaveServerConfig();

  const projectOptions = projects.data ?? [];
  const selectedProject = projectOptions.find((p) => p.id === projectId) ?? null;
  const activeProjectName =
    projectOptions.find((p) => p.id === projectId)?.name ??
    projectName ??
    (projectId ? `Project ${projectId}` : "No project selected");

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<FolderOpen className="size-4" />}
          title={activeProjectName}
          open={projectOpen}
          onClick={() => setProjectOpen(!projectOpen)}
          onDragStart={onDragStart}
        />
        {projectOpen ? (
          <div className={cn("space-y-2 p-3", expandedPanelClass)}>
            <select
              className="h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white disabled:opacity-50"
              disabled={saveServerConfig.isPending}
              value={projectId ?? ""}
              onChange={(e) => {
                const selected = projectOptions.find((p) => p.id === Number(e.target.value));
                if (selected && selected.id !== projectId) {
                  setProject({ projectId: selected.id, projectName: selected.name, pmProjectSlug: selected.slug ?? undefined });
                  saveServerConfig.mutate(selected.id, {
                    onError: () => toast.error("Switched locally, but saving the active project failed."),
                  });
                  // All phase drafts are project-scoped — stale story IDs from
                  // the previous project would collide with the new one.
                  clearPhase2Draft();
                  clearPhase3Draft();
                  clearPhase4Draft();
                  clearPhase5Draft();
                  toast.info(`Switched to ${selected.name} — phase drafts cleared`);
                }
              }}
            >
              <option value="">{projects.isLoading ? "Loading..." : "Select project"}</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProject ? (
              <div className={cn("space-y-1.5 rounded border p-2.5 text-xs", dark ? "border-neutral-700 bg-neutral-950" : "border-slate-200 bg-slate-50")}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>{selectedProject.name}</span>
                  {!isJira ? (
                    <button
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-violet-400 transition-colors hover:bg-violet-500/15"
                      onClick={() => setShowEdit(true)}
                      title="Edit project name & description"
                    >
                      <Pencil className="size-3" /> Edit
                    </button>
                  ) : null}
                </div>
                <div className={cn(dark ? "text-neutral-500" : "text-slate-500")}>
                  ID {selectedProject.id}{selectedProject.slug ? ` · ${selectedProject.slug}` : ""}
                </div>
                <p className={cn("whitespace-pre-wrap leading-5", dark ? "text-neutral-400" : "text-slate-600")}>
                  {selectedProject.description?.trim() || "No description."}
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="flex h-8 items-center justify-center gap-1 rounded border border-neutral-600 text-sm text-neutral-300 transition-colors hover:border-violet-500/50 hover:text-violet-300"
                onClick={() => projects.refetch()}
              >
                <RefreshCw className="size-3" /> Refresh
              </button>
              {!isJira ? (
                <button
                  className="flex h-8 items-center justify-center gap-1 rounded border border-violet-500/40 bg-violet-500/10 text-sm font-semibold text-violet-400 transition-colors hover:bg-violet-500/20"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="size-3" /> Create New
                </button>
              ) : (
                <div className="flex h-8 items-center justify-center rounded border border-neutral-700 px-2 text-xs text-neutral-500">
                  Create in Jira UI
                </div>
              )}
            </div>
            {projectId ? (
              <button
                className="flex h-8 w-full items-center justify-center gap-2 rounded border border-red-500/40 bg-red-500/10 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                disabled={deleteProject.isPending}
                onClick={() => confirm("Delete this project and all its data?", () => deleteProject.mutate(projectId, {
                  onSuccess: () => toast.success("Project deleted"),
                  onError: () => toast.error("Failed to delete project"),
                }))}
              >
                <Trash2 className="size-3" />
                Delete Project
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      {typeof document !== "undefined" ? createPortal(
        <>
      {showCreate ? (
        <ProjectDialog
          dark={dark}
          pending={createProject.isPending}
          title="Create New Project"
          submitLabel="Create Project"
          pendingLabel="Creating…"
          templates={projectTemplates.data ?? []}
          onClose={() => setShowCreate(false)}
          onSubmit={(name, description, opts) =>
            createProject.mutate({ name, description, isPrivate: opts.isPrivate, templateId: opts.templateId }, {
              onSuccess: (p) => {
                setShowCreate(false);
                setProject({ projectId: p.id, projectName: p.name, pmProjectSlug: p.slug ?? undefined });
                clearPhase2Draft();
                clearPhase3Draft();
                clearPhase4Draft();
                clearPhase5Draft();
                toast.success(`Project "${name}" created`);
              },
              onError: (e) => toast.error(errMsg(e)),
            })
          }
        />
      ) : null}
      {showEdit && selectedProject ? (
        <ProjectDialog
          dark={dark}
          pending={updateProject.isPending}
          title="Edit Project"
          submitLabel="Save Changes"
          pendingLabel="Saving…"
          initialName={selectedProject.name}
          initialDescription={selectedProject.description ?? ""}
          onClose={() => setShowEdit(false)}
          onSubmit={(name, description) =>
            updateProject.mutate({ projectId: selectedProject.id, name, description }, {
              onSuccess: (p) => {
                setShowEdit(false);
                setProject({ projectId: p.id, projectName: p.name, pmProjectSlug: p.slug ?? undefined });
                toast.success("Project updated");
              },
              onError: () => toast.error("Failed to update project"),
            })
          }
        />
      ) : null}
        </>,
        document.body,
      ) : null}
    </div>
  );
}

function ProjectDialog({
  dark,
  pending,
  title,
  submitLabel,
  pendingLabel,
  initialName = "",
  initialDescription = "",
  templates,
  onClose,
  onSubmit,
}: {
  dark: boolean;
  pending: boolean;
  title: string;
  submitLabel: string;
  pendingLabel: string;
  initialName?: string;
  initialDescription?: string;
  // When provided, render the create-only Taiga options (template + visibility).
  templates?: ProjectTemplate[];
  onClose: () => void;
  onSubmit: (name: string, description: string, opts: { isPrivate: boolean; templateId: number | null }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isPrivate, setIsPrivate] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);

  // Default the template to Scrum (or the first available) once templates load.
  useEffect(() => {
    if (templates && templates.length && templateId === null) {
      setTemplateId((templates.find((t) => t.slug === "scrum") ?? templates[0]).id);
    }
  }, [templates, templateId]);

  const inputClass = cn(
    "w-full rounded border px-3 text-sm outline-none focus:border-violet-500",
    dark
      ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500"
      : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400",
  );

  const canSubmit = Boolean(name.trim()) && Boolean(description.trim());

  function submit() {
    if (!canSubmit) return;
    onSubmit(name.trim(), description.trim(), { isPrivate, templateId });
  }

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", dark ? "bg-black/75" : "bg-slate-950/35 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-lg rounded-xl border p-6 shadow-2xl", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={cn("mb-4 text-base font-bold", dark ? "text-white" : "text-slate-950")}>{title}</h3>
        <div className="space-y-3">
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Name <span className="text-red-400">*</span>
            </label>
            <input
              className={cn("h-9 border-violet-700", inputClass)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              className={cn("h-28 resize-none py-2", inputClass)}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this project…"
            />
          </div>
          {templates ? (
            <>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
                  Template
                </label>
                <select
                  className={cn("h-9", inputClass)}
                  value={templateId ?? ""}
                  onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={cn("mb-1 block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-600")}>
                  Visibility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={cn(
                      "h-9 rounded border text-sm font-semibold transition-colors",
                      !isPrivate ? "border-violet-500 bg-violet-500/15 text-violet-300" : dark ? "border-neutral-700 text-neutral-400 hover:border-neutral-600" : "border-slate-300 text-slate-500 hover:border-slate-400",
                    )}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={cn(
                      "h-9 rounded border text-sm font-semibold transition-colors",
                      isPrivate ? "border-violet-500 bg-violet-500/15 text-violet-300" : dark ? "border-neutral-700 text-neutral-400 hover:border-neutral-600" : "border-slate-300 text-slate-500 hover:border-slate-400",
                    )}
                  >
                    Private
                  </button>
                </div>
                <p className={cn("mt-1 text-[11px]", dark ? "text-neutral-500" : "text-slate-500")}>
                  Taiga free tier caps private projects — use Public if you hit the limit.
                </p>
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-5 flex gap-3">
          <button
            className="flex-1 rounded bg-violet-700 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
            disabled={pending || !canSubmit}
            onClick={submit}
          >
            {pending ? pendingLabel : submitLabel}
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
