"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiTheme = "dark" | "light";

const DEFAULT_SECTION_ORDER = ["project", "board", "users", "context", "ai", "resources"];

type UiState = {
  theme: UiTheme;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarSectionOrder: string[];
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarSectionOrder: (order: string[]) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      sidebarWidth: 450,
      sidebarCollapsed: false,
      sidebarSectionOrder: DEFAULT_SECTION_ORDER,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(900, Math.max(280, width)) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setSidebarSectionOrder: (order) => set({ sidebarSectionOrder: order }),
    }),
    { name: "apex-ui" },
  ),
);
