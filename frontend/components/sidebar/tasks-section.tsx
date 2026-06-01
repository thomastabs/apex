"use client";
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaigaTaskBoard } from "@/lib/hooks/use-phase3";
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { PanelHeader, type DragSectionProps } from "./shared";

type TasksSectionProps = DragSectionProps & { dark: boolean };

export function TasksSection({ dark, shellClass, dragHandlers, onDragStart }: TasksSectionProps) {
  const [open, setOpen] = useState(false);
  const { data: taigaBoard = [], isLoading } = useTaigaTaskBoard();
  const { selectedStoryId, taskList, currentStoryMeta } = usePhase3Store();

  // Merge Taiga data with current in-session tasks (pre-push, not yet in Taiga)
  const stories = useMemo(() => {
    const merged = [...taigaBoard];
    if (selectedStoryId !== null && taskList.length > 0) {
      const alreadyInBoard = merged.some((s) => s.story_id === selectedStoryId);
      if (!alreadyInBoard) {
        merged.unshift({
          story_id: selectedStoryId,
          tasks: taskList.map((t, i) => ({
            id: i,
            ref: 0,
            subject: t.subject,
            user_story: selectedStoryId,
          })),
        });
      }
    }
    return merged;
  }, [taigaBoard, selectedStoryId, taskList]);

  const totalTasks = stories.reduce((sum, s) => sum + s.tasks.length, 0);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";

  function getStoryLabel(storyId: number) {
    if (storyId === selectedStoryId && currentStoryMeta.title) {
      return `US#${storyId} — ${currentStoryMeta.title}`;
    }
    return `US#${storyId}`;
  }

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
                No tasks pushed to Taiga yet. Go to Phase 3, generate and push tasks.
              </p>
            ) : (
              <div className="space-y-4">
                {stories.map((story) => (
                  <div key={story.story_id}>
                    <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider", subduedTextClass)}>
                      {getStoryLabel(story.story_id)}
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
                            {task.ref > 0 ? `#${task.ref}` : `${idx + 1}.`}
                          </span>
                          <span className={cn("min-w-0 flex-1 truncate", dark ? "text-neutral-300" : "text-slate-700")}>
                            {task.subject}
                          </span>
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
