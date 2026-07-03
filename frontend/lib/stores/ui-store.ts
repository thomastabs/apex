"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiTheme = "dark" | "light";
type TraceabilityView = "flowchart" | "cluster";

// The right-hand Workspace sidebar's sections, in default order — drag to
// reorder there, persisted per user (see components/right-sidebar.tsx).
const DEFAULT_WORKSPACE_SECTION_ORDER = ["project", "context", "board", "tasks", "packs", "testplans", "deploypacks", "users"];

type UiState = {
  theme: UiTheme;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  workspaceSectionOrder: string[];
  rightSidebarWidth: number;
  rightSidebarCollapsed: boolean;
  traceabilityView: TraceabilityView;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setWorkspaceSectionOrder: (order: string[]) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setTraceabilityView: (view: TraceabilityView) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      sidebarWidth: 450,
      sidebarCollapsed: false,
      workspaceSectionOrder: DEFAULT_WORKSPACE_SECTION_ORDER,
      rightSidebarWidth: 420,
      rightSidebarCollapsed: false,
      traceabilityView: "flowchart",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(900, Math.max(280, width)) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setWorkspaceSectionOrder: (order) => set({ workspaceSectionOrder: order }),
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: Math.min(900, Math.max(280, width)) }),
      setRightSidebarCollapsed: (rightSidebarCollapsed) => set({ rightSidebarCollapsed }),
      setTraceabilityView: (traceabilityView) => set({ traceabilityView }),
    }),
    {
      name: "apex-ui",
      merge: (persisted, current) => {
        const stored = (persisted as Partial<UiState>)?.workspaceSectionOrder;
        const base = (stored ?? DEFAULT_WORKSPACE_SECTION_ORDER).filter((id) => DEFAULT_WORKSPACE_SECTION_ORDER.includes(id));
        const missing = DEFAULT_WORKSPACE_SECTION_ORDER.filter((id) => !base.includes(id));
        return {
          ...(current as UiState),
          ...(persisted as Partial<UiState>),
          workspaceSectionOrder: missing.length ? [...base, ...missing] : base,
        };
      },
    },
  ),
);
