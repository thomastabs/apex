"use client";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

export type DragSectionProps = {
  dragHandlers?: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  shellClass?: string;
  onDragStart?: (e: React.DragEvent) => void;
};

export function PanelHeader({
  icon, title, badge, open, onClick, onDragStart, actions,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  open: boolean;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  actions?: React.ReactNode;
}) {
  const dark = useUiStore((state) => state.theme) === "dark";
  return (
    <div
      className={cn(
        "flex items-center border-b transition-colors hover:bg-violet-500/5",
        dark ? "border-neutral-800" : "border-slate-300",
      )}
    >
      {onDragStart ? (
        <div
          draggable
          onDragStart={onDragStart}
          onClickCapture={(e) => e.stopPropagation()}
          className={cn(
            "flex h-14 w-8 shrink-0 cursor-grab items-center justify-center pl-2 transition-colors active:cursor-grabbing",
            dark ? "text-neutral-600 hover:text-neutral-400" : "text-slate-400 hover:text-slate-600",
          )}
          title="Drag to reorder"
        >
          <GripVertical className="size-3.5" />
        </div>
      ) : null}
      <button className="flex h-14 flex-1 items-center gap-2 px-4 text-left" onClick={onClick}>
        {open ? (
          <ChevronDown className={cn("size-3", dark ? "text-neutral-500" : "text-slate-400")} />
        ) : (
          <ChevronRight className={cn("size-3", dark ? "text-neutral-500" : "text-slate-400")} />
        )}
        <span className="text-violet-400">{icon}</span>
        <span className={cn("flex-1 text-sm font-semibold", dark ? "text-neutral-100" : "text-slate-950")}>
          {title}
        </span>
        {badge ? (
          <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-400">
            {badge}
          </span>
        ) : null}
      </button>
      {actions ? <div className="shrink-0 pr-2">{actions}</div> : null}
    </div>
  );
}
