"use client";
import { useState } from "react";
import { FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useSaveServerConfig,
} from "@/lib/hooks/use-workspace";
import { useSessionStore } from "@/lib/stores/session-store";
import { usePhase2Store } from "@/lib/stores/phase2-store";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type ProjectSectionProps = DragSectionProps & {
  dark: boolean;
  confirm: (msg: string, cb: () => void) => void;
};

export function ProjectSection({ dark, confirm, shellClass, dragHandlers, onDragStart }: ProjectSectionProps) {
  const [projectOpen, setProjectOpen] = useState(true);

  const projectId = useSessionStore((s) => s.projectId);
  const projectName = useSessionStore((s) => s.projectName);
  const setProject = useSessionStore((s) => s.setProject);
  const clearPhase2Draft = usePhase2Store((s) => s.clearPhase2Draft);

  const projects = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const saveServerConfig = useSaveServerConfig();

  const projectOptions = projects.data ?? [];
  const activeProjectName =
    projectOptions.find((p) => p.id === projectId)?.name ??
    projectName ??
    (projectId ? `Project ${projectId}` : "No project selected");

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  return (
    <div {...dragHandlers} className={shellClass}>
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
                  setProject({ projectId: selected.id, projectName: selected.name });
                  saveServerConfig.mutate(selected.id);
                  clearPhase2Draft();
                  toast.info(`Switched to ${selected.name} — Phase 2 draft cleared`);
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
                onClick={() => confirm("Delete this Taiga project and all its data?", () => deleteProject.mutate(projectId))}
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
