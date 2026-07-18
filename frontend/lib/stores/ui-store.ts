"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiTheme = "dark" | "light";
type TraceabilityView = "flowchart" | "cluster";
export type Locale = "en" | "pt";

// The right-hand Workspace sidebar's sections, in default order — drag to
// reorder there, persisted per user (see components/right-sidebar.tsx).
const DEFAULT_WORKSPACE_SECTION_ORDER = ["project", "context", "board", "tasks", "packs", "testplans", "deploypacks", "users"];

// A search-result jump target — set by the command palette, consumed once by
// whichever right-sidebar section owns that kind (board-section.tsx for
// epic/story, tasks-section.tsx for task, context-section.tsx for file), then
// cleared. Deliberately not persisted (see partialize below) — a stale jump
// target reappearing after reload would pop a dialog with no user action.
export type SearchFocus =
  | { kind: "epic"; id: number }
  | { kind: "story"; id: number }
  | { kind: "task"; id: string }
  | { kind: "file"; filename: string };

type UiState = {
  theme: UiTheme;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  workspaceSectionOrder: string[];
  rightSidebarWidth: number;
  rightSidebarCollapsed: boolean;
  traceabilityView: TraceabilityView;
  commandPaletteOpen: boolean;
  searchFocus: SearchFocus | null;
  locale: Locale;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setWorkspaceSectionOrder: (order: string[]) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setTraceabilityView: (view: TraceabilityView) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchFocus: (focus: SearchFocus) => void;
  clearSearchFocus: () => void;
  setLocale: (locale: Locale) => void;
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
      commandPaletteOpen: false,
      searchFocus: null,
      locale: "en",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(900, Math.max(280, width)) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setWorkspaceSectionOrder: (order) => set({ workspaceSectionOrder: order }),
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: Math.min(900, Math.max(280, width)) }),
      setRightSidebarCollapsed: (rightSidebarCollapsed) => set({ rightSidebarCollapsed }),
      setTraceabilityView: (traceabilityView) => set({ traceabilityView }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setSearchFocus: (searchFocus) => set({ searchFocus }),
      clearSearchFocus: () => set({ searchFocus: null }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "apex-ui",
      // commandPaletteOpen/searchFocus are ephemeral UI/navigation signals,
      // not persisted preferences — see SearchFocus doc comment above.
      partialize: (state) => {
        const { commandPaletteOpen: _open, searchFocus: _focus, ...rest } = state;
        return rest;
      },
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
