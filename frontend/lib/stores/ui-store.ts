"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiTheme = "dark" | "light";

type UiState = {
  theme: UiTheme;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      sidebarWidth: 450,
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(900, Math.max(280, width)) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    { name: "apex-ui" },
  ),
);
