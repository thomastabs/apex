"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskBoard } from "@/lib/hooks/use-phase3";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import type { TaskBoardStory } from "@/lib/api/types";
import { PanelHeader, type DragSectionProps } from "./shared";

const EFFORT_COLORS: Record<string, string> = {
  XS: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  S:  "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  M:  "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30",
  L:  "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  XL: "bg-red-500/15 text-red-400 ring-red-500/30",
};

type TasksSectionProps = DragSectionProps & { dark: boolean };

export function TasksSection({ dark, shellClass, dragHandlers, onDragStart }: TasksSectionProps) {
  const [open, setOpen] = useState(false);
  const { data: backendStories = [], isLoading } = useTaskBoard();
  const { selectedStoryId, taskList, currentStoryMeta } = usePhase3Store();

  // Merge backend data with current in-session story (Zustand store fallback)
  const stories = useMemo<TaskBoardStory[]>(() => {
    const merged = [...backendStories];
    if (selectedStoryId !== null && taskList.length > 0) {
      const alreadyInBoard = merged.some((s) => s.story_id === selectedStoryId);
      if (!alreadyInBoard) {
        merged.unshift({
          story_id: selectedStoryId,
          title: currentStoryMeta.title || `Story #${selectedStoryId}`,
          epic_title: currentStoryMeta.epicTitle,
          phase_status: "",
          tasks: taskList.map((t) => ({
            id: t.id,
            subject: t.subject,
            effort_estimate: t.effort_estimate ?? "",
            has_proposal: false,
          })),
        });
      }
    }
    return merged;
  }, [backendStories, selectedStoryId, taskList, currentStoryMeta]);

  const totalTasks = stories.reduce((sum, s) => sum + s.tasks.length, 0);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<ClipboardList className="size-4" />}
          title="Task Board"
          badge={totalTasks > 0 ? String(totalTasks) : undefined}
          open={open}
          onClick={() => setOpen(!open)}
          onDragStart={onDragStart}
        />
        {open && (
          <div className={cn("px-4 py-3", expandedPanelClass)}>
            {isLoading ? (
              <p className={cn("text-xs", subduedTextClass)}>Loading…</p>
            ) : stories.length === 0 ? (
              <p className={cn("text-xs", subduedTextClass)}>
                No tasks generated yet. Go to Phase 3 and decompose a story.
              </p>
            ) : (
              <div className="space-y-4">
                {stories.map((story) => (
                  <div key={story.story_id}>
                    <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider", subduedTextClass)}>
                      US#{story.story_id} — {story.title || `Story ${story.story_id}`}
                    </p>
                    <div className="space-y-1">
                      {story.tasks.map((task, idx) => (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-center gap-2 rounded px-2 py-1.5 text-xs",
                            dark ? "bg-neutral-800/50" : "bg-slate-50",
                          )}
                        >
                          <span className={cn("shrink-0 font-mono text-[10px]", subduedTextClass)}>
                            {idx + 1}.
                          </span>
                          <span className={cn("min-w-0 flex-1 truncate", dark ? "text-neutral-300" : "text-slate-700")}>
                            {task.subject}
                          </span>
                          {task.effort_estimate && (
                            <span className={cn(
                              "inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[9px] font-bold ring-1",
                              EFFORT_COLORS[task.effort_estimate] ?? "bg-neutral-500/15 text-neutral-400 ring-neutral-500/30",
                            )}>
                              {task.effort_estimate}
                            </span>
                          )}
                          {task.has_proposal && (
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
