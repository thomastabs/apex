"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type PmTool = "taiga" | "jira";

type SessionState = {
  pmTool: PmTool;
  taigaToken: string;
  taigaApiUrl: string;
  jiraEmail: string;
  projectId: number | null;
  projectName: string;
  pmProjectSlug: string;
  setSession: (session: { taigaToken: string; taigaApiUrl?: string; projectId?: number; projectName?: string; pmTool?: PmTool; jiraEmail?: string }) => void;
  setAuth: (auth: { taigaToken: string; taigaApiUrl?: string; pmTool?: PmTool; jiraEmail?: string }) => void;
  setProject: (project: { projectId: number; projectName?: string; pmProjectSlug?: string }) => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      pmTool: "taiga",
      taigaToken: "",
      taigaApiUrl: "",
      jiraEmail: "",
      projectId: null,
      projectName: "",
      pmProjectSlug: "",
      setSession: ({ taigaToken, taigaApiUrl, projectId, projectName = "", pmTool, jiraEmail }) =>
        set({
          taigaToken,
          ...(pmTool != null ? { pmTool } : {}),
          ...(taigaApiUrl != null ? { taigaApiUrl } : {}),
          ...(jiraEmail != null ? { jiraEmail } : {}),
          ...(projectId != null ? { projectId, projectName } : {}),
        }),
      setAuth: ({ taigaToken, taigaApiUrl, pmTool, jiraEmail }) =>
        set({
          taigaToken,
          ...(pmTool != null ? { pmTool } : {}),
          ...(taigaApiUrl != null ? { taigaApiUrl } : {}),
          ...(jiraEmail != null ? { jiraEmail } : {}),
          projectId: null,
          projectName: "",
          pmProjectSlug: "",
        }),
      setProject: ({ projectId, projectName = "", pmProjectSlug = "" }) => set({ projectId, projectName, pmProjectSlug }),
      clearSession: () => set((s) => ({ pmTool: s.pmTool, taigaToken: "", taigaApiUrl: "", jiraEmail: "", projectId: null, projectName: "", pmProjectSlug: "" })),
    }),
    {
      name: "apex-session",
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          return {
            pmTool: "taiga" as PmTool,
            taigaToken: (state.taigaToken as string) ?? "",
            taigaApiUrl: (state.taigaApiUrl as string) ?? "",
            jiraEmail: "",
            projectId: (state.projectId as number | null) ?? null,
            projectName: (state.projectName as string) ?? "",
            pmProjectSlug: "",
          };
        }
        if (version < 3) {
          return { ...state, pmProjectSlug: "" };
        }
        return state as SessionState;
      },
      partialize: (state) => ({
        pmTool: state.pmTool,
        taigaToken: state.taigaToken,
        taigaApiUrl: state.taigaApiUrl,
        jiraEmail: state.jiraEmail,
        projectId: state.projectId,
        projectName: state.projectName,
        pmProjectSlug: state.pmProjectSlug,
      }),
    },
  ),
);

export function useApiContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const taigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  const projectId = useSessionStore((state) => state.projectId);
  const pmTool = useSessionStore((state) => state.pmTool);
  const pmProjectSlug = useSessionStore((state) => state.pmProjectSlug);

  if (!taigaToken || !projectId) {
    return null;
  }

  return { taigaToken, taigaApiUrl, projectId, pmTool, pmProjectId: pmProjectSlug || undefined };
}

export function useAuthContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const taigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  const pmTool = useSessionStore((state) => state.pmTool);
  return taigaToken ? { taigaToken, taigaApiUrl, pmTool } : null;
}
