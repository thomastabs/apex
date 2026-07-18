"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardCheck, ClipboardList, FileCode2, FileText, FolderOpen,
  Layers3, PanelRightClose, PanelRightOpen, Rocket, Search, Users,
} from "lucide-react";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useAiConfig } from "@/lib/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { ConfirmDialog, type DragSectionProps } from "./sidebar/shared";
import { ProjectSection } from "./sidebar/project-section";
import { ContextSection } from "./sidebar/context-section";
import { BoardSection } from "./sidebar/board-section";
import { TasksSection } from "./sidebar/tasks-section";
import { PacksSection } from "./sidebar/packs-section";
import { TestPlansSection } from "./sidebar/test-plans-section";
import { DeployPacksSection } from "./sidebar/deploy-packs-section";
import { UsersSection } from "./sidebar/users-section";

type SectionId = "project" | "context" | "board" | "tasks" | "packs" | "testplans" | "deploypacks" | "users";

const SECTION_ICONS: Record<SectionId, typeof FolderOpen> = {
  project: FolderOpen, context: FileText, board: Layers3, tasks: ClipboardList,
  packs: FileCode2, testplans: ClipboardCheck, deploypacks: Rocket, users: Users,
};

const SECTION_LABELS: Record<SectionId, string> = {
  project: "Project", context: "Context", board: "Board", tasks: "Tasks",
  packs: "Packs", testplans: "Test Plans", deploypacks: "Deploy Packs", users: "Users",
};

export function RightSidebar() {
  const theme = useUiStore((s) => s.theme);
  const dark = theme === "dark";
  const width = useUiStore((s) => s.rightSidebarWidth);
  const setWidth = useUiStore((s) => s.setRightSidebarWidth);
  const collapsed = useUiStore((s) => s.rightSidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setRightSidebarCollapsed);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const taigaToken = useSessionStore((s) => s.taigaToken);
  const projectId = useSessionStore((s) => s.projectId);
  const aiConfig = useAiConfig();

  const sectionOrder = useUiStore((s) => s.workspaceSectionOrder);
  const setSectionOrder = useUiStore((s) => s.setWorkspaceSectionOrder);

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [draggedId, setDraggedId] = useState<SectionId | null>(null);
  const [dragOverId, setDragOverId] = useState<SectionId | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  function confirm(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

  function reorder(fromId: SectionId, toId: SectionId) {
    const current = orderedIds.filter((id) => id !== fromId);
    const insertAt = current.indexOf(toId);
    current.splice(insertAt, 0, fromId);
    setSectionOrder(current);
  }

  function dragProps(id: SectionId): DragSectionProps {
    return {
      shellClass: cn(
        `ws-section-${id}`,
        draggedId === id
          ? "opacity-40"
          : dragOverId === id
            ? cn("border-t-2", dark ? "border-t-violet-400 bg-violet-500/10" : "border-t-violet-500 bg-violet-50")
            : "",
      ),
      onDragStart: (e) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = "move";
        // Native drag ghost defaults to just the small grip handle — point it
        // at the whole section row instead so the entire section being
        // moved is visible under the cursor while dragging.
        const shellEl = (e.currentTarget as HTMLElement).closest(`.ws-section-${id}`) as HTMLElement | null;
        if (shellEl) e.dataTransfer.setDragImage(shellEl, 24, 20);
      },
      dragHandlers: {
        onDragOver: (e) => { e.preventDefault(); if (draggedId && draggedId !== id) setDragOverId(id); },
        onDragLeave: () => setDragOverId((cur) => (cur === id ? null : cur)),
        onDrop: (e) => {
          e.preventDefault();
          if (draggedId && draggedId !== id) reorder(draggedId, id);
          setDraggedId(null);
          setDragOverId(null);
        },
        onDragEnd: () => { setDraggedId(null); setDragOverId(null); },
      },
    };
  }

  // Force the icon rail below the width where this panel plus the left
  // sidebar would exceed the viewport (confirmed via live measurement: with
  // both expanded, <main> collapses to 0px at both 375px and 768px).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    function apply(e: { matches: boolean }) {
      if (e.matches) setCollapsed(true);
    }
    apply(mq);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setCollapsed]);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    function onMove(ev: PointerEvent) { setWidth(resizeStartWidthRef.current - (ev.clientX - resizeStartXRef.current)); }
    function onUp() {
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  if (!taigaToken) return null;

  const showTaigaSections = Boolean(projectId);
  const sidebarBg = dark ? "bg-[#111112] border-neutral-800" : "bg-[#f5f5f7] border-slate-200";
  const currentModel = aiConfig.data?.available_models.find((m) => m.id === aiConfig.data?.model)?.label ?? aiConfig.data?.model;

  const knownIds = Object.keys(SECTION_ICONS) as SectionId[];
  const orderedIds = sectionOrder.filter((id): id is SectionId => (knownIds as string[]).includes(id));
  for (const id of knownIds) if (!orderedIds.includes(id)) orderedIds.push(id);
  const visibleIds = orderedIds.filter((id) => id === "project" || showTaigaSections);

  // ── collapsed state — mirrors the left sidebar's icon rail ──
  if (collapsed) {
    return (
      <aside className={cn("sticky top-0 h-screen w-12 shrink-0 border-l flex flex-col", sidebarBg)}>
        <button className="grid size-12 shrink-0 place-items-center text-violet-400 hover:text-violet-300" onClick={() => setCollapsed(false)} aria-label="Expand workspace panel">
          <PanelRightOpen className="size-4" />
        </button>
        <button
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Search"
          className={cn("grid size-9 shrink-0 place-items-center self-center rounded transition-colors", dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-300 hover:text-slate-600")}
        >
          <Search className="size-4" />
        </button>
        <div className="flex shrink-0 flex-col items-center gap-1 py-2">
          {visibleIds.map((id) => {
            const Icon = SECTION_ICONS[id];
            return (
            <button
              key={id}
              onClick={() => setCollapsed(false)}
              aria-label={`Expand ${SECTION_LABELS[id]} panel`}
              className={cn("grid size-9 place-items-center rounded transition-colors", dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-300 hover:text-slate-600")}
            >
              <Icon className="size-4" />
            </button>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center pb-4">
          <span className={cn("rotate-180 select-none text-xs font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl]", dark ? "text-neutral-700" : "text-slate-300")}>
            Workspace
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn("apex-right-sidebar relative z-20 sticky top-0 h-screen shrink-0 overflow-visible border-l flex flex-col", sidebarBg)}
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className="group absolute left-0 top-0 z-50 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace panel"
        aria-valuenow={width}
        aria-valuemin={280}
        aria-valuemax={900}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth(width + 20);
          else if (e.key === "ArrowRight") setWidth(width - 20);
        }}
      >
        <div className="h-full w-px bg-transparent transition-colors group-hover:bg-violet-500/60" />
      </div>

      {typeof document !== "undefined" ? createPortal(
        <ConfirmDialog
          open={Boolean(confirmState)}
          message={confirmState?.message ?? ""}
          onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
          onCancel={() => setConfirmState(null)}
        />,
        document.body,
      ) : null}

      {/* ── Header — matches the left sidebar's zone 1 ── */}
      <header className={cn("flex h-[52px] shrink-0 items-center gap-2 border-b px-4", dark ? "border-neutral-800" : "border-slate-200")}>
        <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>
          Workspace
        </span>
        {currentModel ? (
          <span
            className={cn(
              "shrink-0 truncate rounded border px-2 py-0.5 text-xs font-medium",
              dark ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : "border-violet-300 bg-violet-50 text-violet-600",
            )}
            title="Active AI model (Settings → AI Model to change)"
          >
            {currentModel}
          </span>
        ) : null}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className={cn("grid size-7 shrink-0 place-items-center rounded transition-colors", dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700")}
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search className="size-3.5" />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className={cn("grid size-7 shrink-0 place-items-center rounded transition-colors", dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700")}
          aria-label="Collapse workspace panel"
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleIds.map((id) => {
          const drag = dragProps(id);
          switch (id) {
            case "project":
              return <ProjectSection key={id} dark={dark} confirm={confirm} {...drag} />;
            case "context":
              return <ContextSection key={id} dark={dark} projectId={projectId!} confirm={confirm} {...drag} />;
            case "board":
              return <BoardSection key={id} dark={dark} projectId={projectId!} confirm={confirm} {...drag} />;
            case "tasks":
              return <TasksSection key={id} dark={dark} {...drag} />;
            case "packs":
              return <PacksSection key={id} dark={dark} confirm={confirm} {...drag} />;
            case "testplans":
              return <TestPlansSection key={id} dark={dark} confirm={confirm} {...drag} />;
            case "deploypacks":
              return <DeployPacksSection key={id} dark={dark} confirm={confirm} {...drag} />;
            case "users":
              return <UsersSection key={id} dark={dark} projectId={projectId!} confirm={confirm} {...drag} />;
            default:
              return null;
          }
        })}
        {!showTaigaSections && !projectId ? (
          <p className={cn("px-4 py-4 text-xs leading-5", dark ? "text-neutral-600" : "text-slate-400")}>
            Select a project above to unlock the phase workflows.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
