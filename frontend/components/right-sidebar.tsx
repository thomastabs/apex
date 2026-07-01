"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ClipboardCheck, ClipboardList, FileCode2, FileText, FolderOpen,
  Layers3, PanelRightClose, PanelRightOpen, Rocket,
} from "lucide-react";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./sidebar/shared";
import { ProjectSection } from "./sidebar/project-section";
import { ContextSection } from "./sidebar/context-section";
import { BoardSection } from "./sidebar/board-section";
import { TasksSection } from "./sidebar/tasks-section";
import { PacksSection } from "./sidebar/packs-section";
import { TestPlansSection } from "./sidebar/test-plans-section";
import { DeployPacksSection } from "./sidebar/deploy-packs-section";

// Pages that are their own full-screen workspace (no Taiga board/pack/plan
// context applies) — the Epics/Tasks/Packs sections stay out of the way
// there, same as the left sidebar's context zone did before them.
const HIDDEN_PREFIXES = ["/autopilot", "/fix-bolt", "/traceability", "/analytics"];

const RAIL_ICONS = [FolderOpen, FileText, Layers3, ClipboardList, FileCode2, ClipboardCheck, Rocket];

export function RightSidebar() {
  const theme = useUiStore((s) => s.theme);
  const dark = theme === "dark";
  const width = useUiStore((s) => s.rightSidebarWidth);
  const setWidth = useUiStore((s) => s.setRightSidebarWidth);
  const collapsed = useUiStore((s) => s.rightSidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setRightSidebarCollapsed);

  const taigaToken = useSessionStore((s) => s.taigaToken);
  const projectId = useSessionStore((s) => s.projectId);
  const pathname = usePathname();

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  function confirm(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

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

  const showTaigaSections = Boolean(projectId) && !HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  const sidebarBg = dark ? "bg-[#111112] border-neutral-800" : "bg-[#f5f5f7] border-slate-200";

  // ── collapsed state — mirrors the left sidebar's icon rail ──
  if (collapsed) {
    return (
      <aside className={cn("sticky top-0 h-screen w-12 shrink-0 border-l flex flex-col", sidebarBg)}>
        <button className="grid size-12 shrink-0 place-items-center text-violet-400 hover:text-violet-300" onClick={() => setCollapsed(false)} aria-label="Expand workspace panel">
          <PanelRightOpen className="size-4" />
        </button>
        <div className="flex flex-1 flex-col items-center gap-1 py-2">
          {RAIL_ICONS.map((Icon, i) => (
            <button
              key={i}
              onClick={() => setCollapsed(false)}
              className={cn("grid size-9 place-items-center rounded transition-colors", dark ? "text-neutral-600 hover:text-neutral-300" : "text-slate-300 hover:text-slate-600")}
            >
              <Icon className="size-4" />
            </button>
          ))}
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
        className="group absolute left-0 top-0 z-50 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
        onPointerDown={startResize}
        role="separator" aria-orientation="vertical" aria-label="Resize workspace panel"
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
        <button
          onClick={() => setCollapsed(true)}
          className={cn("grid size-7 shrink-0 place-items-center rounded transition-colors", dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700")}
          aria-label="Collapse workspace panel"
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProjectSection dark={dark} confirm={confirm} />
        {showTaigaSections ? (
          <>
            <ContextSection dark={dark} projectId={projectId!} confirm={confirm} />
            <BoardSection dark={dark} projectId={projectId!} confirm={confirm} />
            <TasksSection dark={dark} />
            <PacksSection dark={dark} confirm={confirm} />
            <TestPlansSection dark={dark} confirm={confirm} />
            <DeployPacksSection dark={dark} confirm={confirm} />
          </>
        ) : !projectId ? (
          <p className={cn("px-4 py-4 text-xs leading-5", dark ? "text-neutral-600" : "text-slate-400")}>
            Select a project above to unlock the phase workflows.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
