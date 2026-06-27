"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PmTool = "taiga" | "jira";

type SessionState = {
  pmTool: PmTool;
  taigaToken: string;
  taigaApiUrl: string;
  jiraEmail: string;
  projectId: number | null;
  projectName: string;
  pmProjectSlug: string;
  // Instance the selected project belongs to. A project picked on one Taiga
  // instance must not be used under another (would request a cross-instance
  // project the token isn't a member of → 403). useApiContext gates on this.
  projectInstanceUrl: string;
  githubPat: string;
  githubRepo: string;
  // Figma personal access token (NOT persisted — re-entered each session, like githubPat).
  figmaToken: string;
  figmaFileKey: string;
  setSession: (session: { taigaToken: string; taigaApiUrl?: string; projectId?: number; projectName?: string; pmTool?: PmTool; jiraEmail?: string }) => void;
  setAuth: (auth: { taigaToken: string; taigaApiUrl?: string; pmTool?: PmTool; jiraEmail?: string }) => void;
  setProject: (project: { projectId: number; projectName?: string; pmProjectSlug?: string }) => void;
  setGithub: (opts: { pat?: string; repo?: string }) => void;
  setFigma: (opts: { token?: string; fileKey?: string }) => void;
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
      projectInstanceUrl: "",
      githubPat: "",
      githubRepo: "",
      figmaToken: "",
      figmaFileKey: "",
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
          projectInstanceUrl: "",
        }),
      setProject: ({ projectId, projectName = "", pmProjectSlug = "" }) =>
        set((s) => ({ projectId, projectName, pmProjectSlug, projectInstanceUrl: s.taigaApiUrl })),
      setGithub: ({ pat, repo }) => set({
        ...(pat !== undefined ? { githubPat: pat } : {}),
        ...(repo !== undefined ? { githubRepo: repo } : {}),
      }),
      setFigma: ({ token, fileKey }) => set({
        ...(token !== undefined ? { figmaToken: token } : {}),
        ...(fileKey !== undefined ? { figmaFileKey: fileKey } : {}),
      }),
      clearSession: () => set((s) => ({ pmTool: s.pmTool, taigaToken: "", taigaApiUrl: "", jiraEmail: "", projectId: null, projectName: "", pmProjectSlug: "", projectInstanceUrl: "", githubPat: "", githubRepo: "", figmaToken: "", figmaFileKey: "" })),
    }),
    {
      name: "apex-session",
      // Use sessionStorage so tokens are cleared when the browser tab/window closes.
      // Tokens are not persisted to localStorage — localStorage is cleared of the old
      // key on first load via the migrate function.
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return localStorage;
        // Remove stale localStorage entry from older versions
        try { localStorage.removeItem("apex-session"); } catch { /* ignore */ }
        return sessionStorage;
      }),
      version: 7,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        return {
          pmTool: (state.pmTool as PmTool) ?? "taiga",
          taigaToken: (state.taigaToken as string) ?? "",
          taigaApiUrl: (state.taigaApiUrl as string) ?? "",
          jiraEmail: (state.jiraEmail as string) ?? "",
          projectId: (state.projectId as number | null) ?? null,
          projectName: (state.projectName as string) ?? "",
          pmProjectSlug: (state.pmProjectSlug as string) ?? "",
          // Reset on upgrade so a pre-v6 selection (no instance binding) is
          // re-confirmed before any project-scoped request fires.
          projectInstanceUrl: (state.projectInstanceUrl as string) ?? "",
          githubPat: "",
          githubRepo: (state.githubRepo as string) ?? "",
          figmaToken: "",
          figmaFileKey: (state.figmaFileKey as string) ?? "",
        };
      },
      // githubPat / figmaToken intentionally excluded — these credentials are not
      // persisted anywhere. Users must re-enter them each session.
      partialize: (state) => ({
        pmTool: state.pmTool,
        taigaToken: state.taigaToken,
        taigaApiUrl: state.taigaApiUrl,
        jiraEmail: state.jiraEmail,
        projectId: state.projectId,
        projectName: state.projectName,
        pmProjectSlug: state.pmProjectSlug,
        projectInstanceUrl: state.projectInstanceUrl,
        githubRepo: state.githubRepo,
        figmaFileKey: state.figmaFileKey,
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
  const projectInstanceUrl = useSessionStore((state) => state.projectInstanceUrl);

  if (!taigaToken || !projectId) {
    return null;
  }
  // Don't use a project selected on a different instance — it would fire
  // project-scoped requests the current token can't access (cross-instance 403).
  if (projectInstanceUrl !== taigaApiUrl) {
    return null;
  }

  return { taigaToken, taigaApiUrl, projectId, pmTool, pmProjectId: pmProjectSlug || undefined };
}

export function useGithubContext() {
  const githubPat = useSessionStore((state) => state.githubPat);
  const githubRepo = useSessionStore((state) => state.githubRepo);
  if (!githubPat || !githubRepo) return null;
  const [owner, repo] = githubRepo.split("/");
  if (!owner || !repo) return null;
  return { pat: githubPat, owner, repo };
}

export function useFigmaContext() {
  const figmaToken = useSessionStore((state) => state.figmaToken);
  const figmaFileKey = useSessionStore((state) => state.figmaFileKey);
  if (!figmaToken || !figmaFileKey) return null;
  return { token: figmaToken, fileKey: figmaFileKey };
}

export function useAuthContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const taigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  const pmTool = useSessionStore((state) => state.pmTool);
  return taigaToken ? { taigaToken, taigaApiUrl, pmTool } : null;
}
