"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type SessionState = {
  taigaToken: string;
  taigaApiUrl: string;
  projectId: number | null;
  projectName: string;
  setSession: (session: { taigaToken: string; taigaApiUrl?: string; projectId?: number; projectName?: string }) => void;
  setAuth: (auth: { taigaToken: string; taigaApiUrl?: string }) => void;
  setProject: (project: { projectId: number; projectName?: string }) => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      taigaToken: "",
      taigaApiUrl: "",
      projectId: null,
      projectName: "",
      setSession: ({ taigaToken, taigaApiUrl, projectId, projectName = "" }) =>
        set({
          taigaToken,
          ...(taigaApiUrl != null ? { taigaApiUrl } : {}),
          ...(projectId != null ? { projectId, projectName } : {}),
        }),
      setAuth: ({ taigaToken, taigaApiUrl }) =>
        set({ taigaToken, ...(taigaApiUrl != null ? { taigaApiUrl } : {}), projectId: null, projectName: "" }),
      setProject: ({ projectId, projectName = "" }) => set({ projectId, projectName }),
      clearSession: () => set({ taigaToken: "", taigaApiUrl: "", projectId: null, projectName: "" }),
    }),
    {
      name: "apex-session",
      partialize: (state) => ({
        taigaToken: state.taigaToken,
        taigaApiUrl: state.taigaApiUrl,
        projectId: state.projectId,
        projectName: state.projectName,
      }),
    },
  ),
);

export function useApiContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const taigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  const projectId = useSessionStore((state) => state.projectId);

  if (!taigaToken || !projectId) {
    return null;
  }

  return { taigaToken, taigaApiUrl, projectId };
}

export function useAuthContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const taigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  return taigaToken ? { taigaToken, taigaApiUrl } : null;
}
