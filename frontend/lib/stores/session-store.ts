"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type SessionState = {
  taigaToken: string;
  projectId: number | null;
  projectName: string;
  setSession: (session: { taigaToken: string; projectId?: number; projectName?: string }) => void;
  setAuth: (auth: { taigaToken: string }) => void;
  setProject: (project: { projectId: number; projectName?: string }) => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      taigaToken: "",
      projectId: null,
      projectName: "",
      setSession: ({ taigaToken, projectId, projectName = "" }) =>
        set({ taigaToken, ...(projectId != null ? { projectId, projectName } : {}) }),
      setAuth: ({ taigaToken }) => set({ taigaToken, projectId: null, projectName: "" }),
      setProject: ({ projectId, projectName = "" }) => set({ projectId, projectName }),
      clearSession: () => set({ taigaToken: "", projectId: null, projectName: "" }),
    }),
    {
      name: "apex-session",
      partialize: (state) => ({
        taigaToken: state.taigaToken,
        projectId: state.projectId,
        projectName: state.projectName,
      }),
    },
  ),
);

export function useApiContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const projectId = useSessionStore((state) => state.projectId);

  if (!taigaToken || !projectId) {
    return null;
  }

  return { taigaToken, projectId };
}

export function useAuthContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  return taigaToken ? { taigaToken } : null;
}
