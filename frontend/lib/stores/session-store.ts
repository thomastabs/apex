"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveId } from "../api/plane-id-shim";

type PmTool = "taiga" | "plane";

type SessionState = {
  pmTool: PmTool;
  // Reused generically across both tools despite the Taiga-era names — the
  // backend already treats this as a tool-agnostic "pm_token"/base URL
  // (AuthContext.pm_token, deps.py's _pm_auth_headers branches on pmTool to
  // pick the actual header shape). Renaming these fields would touch dozens
  // of call sites across the frontend for no functional gain; workspaceSlug
  // below is the one genuinely Plane-only addition.
  taigaToken: string;
  taigaApiUrl: string;
  // Plane-only: required, no Plane API can discover it from a key alone (see
  // plane_integration_plan memory). Empty/unused for Taiga.
  workspaceSlug: string;
  projectId: number | null;
  // Plane-only: the real UUID behind projectId's minted int, captured at
  // selection time. The mint table (plane-id-shim.ts) is a module singleton
  // that resets on every reload, so a persisted minted int alone becomes
  // meaningless after a reload (matches nothing in the fresh table, even
  // for the same real project) — this is what useRestoreProjectConfig
  // re-mints from to recover the correct int for the current session.
  planeProjectId: string;
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
  // Cached verified file name for figmaFileKey — lets the sidebar skip a
  // /files?depth=1 verify on every navigation (that call is rate-limited).
  figmaFileName: string;
  // Persisted so an Autopilot run can be re-attached after a refresh (the run keeps
  // going server-side). Cleared on New Run / sign-out.
  autopilotJobId: string | null;
  setAutopilotJobId: (jobId: string | null) => void;
  setSession: (session: { taigaToken: string; taigaApiUrl?: string; projectId?: number; projectName?: string; pmTool?: PmTool; workspaceSlug?: string }) => void;
  setAuth: (auth: { taigaToken: string; taigaApiUrl?: string; pmTool?: PmTool; workspaceSlug?: string }) => void;
  setProject: (project: { projectId: number; projectName?: string; pmProjectSlug?: string }) => void;
  clearProject: () => void;
  setGithub: (opts: { pat?: string; repo?: string }) => void;
  setFigma: (opts: { token?: string; fileKey?: string; fileName?: string }) => void;
  clearSession: () => void;
};

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      pmTool: "taiga",
      taigaToken: "",
      taigaApiUrl: "",
      workspaceSlug: "",
      projectId: null,
      planeProjectId: "",
      projectName: "",
      pmProjectSlug: "",
      projectInstanceUrl: "",
      githubPat: "",
      githubRepo: "",
      figmaToken: "",
      figmaFileKey: "",
      figmaFileName: "",
      autopilotJobId: null,
      setAutopilotJobId: (jobId) => set({ autopilotJobId: jobId }),
      setSession: ({ taigaToken, taigaApiUrl, projectId, projectName = "", pmTool, workspaceSlug }) =>
        set({
          taigaToken,
          ...(pmTool != null ? { pmTool } : {}),
          ...(taigaApiUrl != null ? { taigaApiUrl } : {}),
          ...(workspaceSlug != null ? { workspaceSlug } : {}),
          ...(projectId != null ? { projectId, projectName } : {}),
        }),
      setAuth: ({ taigaToken, taigaApiUrl, pmTool, workspaceSlug }) =>
        set({
          taigaToken,
          ...(pmTool != null ? { pmTool } : {}),
          ...(taigaApiUrl != null ? { taigaApiUrl } : {}),
          workspaceSlug: workspaceSlug ?? "",
          projectId: null,
          planeProjectId: "",
          projectName: "",
          pmProjectSlug: "",
          projectInstanceUrl: "",
        }),
      setProject: ({ projectId, projectName = "", pmProjectSlug = "" }) =>
        // github_repo/github_pat are per-project (server-side) — clear the stale
        // previous project's values immediately on switch so they don't visibly
        // "stick" for a moment (or longer, if the new project's restore fetch
        // fails) before GithubAutoSync repopulates them for the new project.
        set((s) => ({
          projectId, projectName, pmProjectSlug, projectInstanceUrl: s.taigaApiUrl,
          // Best-effort: projectId was just minted moments ago from this same
          // session's listProjects() call, so resolving it back right now
          // should never fail — wrapped anyway since a store update must
          // never throw. See planeProjectId's field comment.
          planeProjectId: s.pmTool === "plane" ? (() => { try { return resolveId(projectId); } catch { return ""; } })() : "",
          githubPat: "", githubRepo: "",
        })),
      // Clears just the active-project selection (kept separate from
      // clearSession, which also signs the user out). Deleting the
      // currently-active project must call this — otherwise every
      // project-scoped query (useApiContext) keeps firing against an id
      // that no longer exists server-side, and the workspace sidebar spins
      // forever / throws "not found"/"access denied" toasts even though the
      // project picker itself correctly shows nothing selected (found live,
      // 2026-08-19: useDeleteProject's onSuccess only invalidated the
      // project list, never touched this store).
      clearProject: () => set({
        projectId: null, planeProjectId: "", projectName: "", pmProjectSlug: "",
        projectInstanceUrl: "", githubPat: "", githubRepo: "",
      }),
      setGithub: ({ pat, repo }) => set({
        ...(pat !== undefined ? { githubPat: pat } : {}),
        ...(repo !== undefined ? { githubRepo: repo } : {}),
      }),
      setFigma: ({ token, fileKey, fileName }) => set({
        ...(token !== undefined ? { figmaToken: token } : {}),
        // A new file key invalidates the cached name unless one is supplied.
        ...(fileKey !== undefined ? { figmaFileKey: fileKey, figmaFileName: fileName ?? "" } : {}),
        ...(fileKey === undefined && fileName !== undefined ? { figmaFileName: fileName } : {}),
      }),
      clearSession: () => set((s) => ({ pmTool: s.pmTool, taigaToken: "", taigaApiUrl: "", workspaceSlug: "", projectId: null, planeProjectId: "", projectName: "", pmProjectSlug: "", projectInstanceUrl: "", githubPat: "", githubRepo: "", figmaToken: "", figmaFileKey: "", figmaFileName: "", autopilotJobId: null })),
    }),
    {
      name: "apex-session",
      // Use sessionStorage so tokens are cleared when the browser tab/window closes.
      // Tokens are not persisted to localStorage — localStorage is cleared of the old
      // key on first load via the migrate function.
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return noopStorage;
        // Remove stale localStorage entry from older versions
        try { localStorage.removeItem("apex-session"); } catch { /* ignore */ }
        return window.sessionStorage;
      }),
      version: 12,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        return {
          autopilotJobId: (state.autopilotJobId as string | null) ?? null,
          // Jira support was removed — any stale persisted pmTool other than
          // "taiga"/"plane" collapses to Taiga rather than crashing a
          // mid-session tab. A pre-v11 session could only ever have "taiga"
          // anyway (Plane's login UI didn't exist yet), so this is really
          // just the Jira-removal guard, unchanged in spirit.
          pmTool: (state.pmTool === "plane" ? "plane" : "taiga") as PmTool,
          taigaToken: (state.taigaToken as string) ?? "",
          taigaApiUrl: (state.taigaApiUrl as string) ?? "",
          workspaceSlug: (state.workspaceSlug as string) ?? "",
          projectId: (state.projectId as number | null) ?? null,
          // New in v12 — a pre-v12 session never had this, so a Plane
          // project selected before this version reads back as "" and
          // useRestoreProjectConfig's re-mint correction simply can't run
          // once (falls through to the plain "no match" branch instead,
          // same as today's un-fixed behaviour) until reselected once.
          planeProjectId: (state.planeProjectId as string) ?? "",
          projectName: (state.projectName as string) ?? "",
          pmProjectSlug: (state.pmProjectSlug as string) ?? "",
          // Reset on upgrade so a pre-v6 selection (no instance binding) is
          // re-confirmed before any project-scoped request fires.
          projectInstanceUrl: (state.projectInstanceUrl as string) ?? "",
          githubPat: "",
          githubRepo: (state.githubRepo as string) ?? "",
          figmaToken: "",
          figmaFileKey: (state.figmaFileKey as string) ?? "",
          figmaFileName: (state.figmaFileName as string) ?? "",
        };
      },
      // githubPat / figmaToken intentionally excluded — these credentials are not
      // persisted anywhere. Users must re-enter them each session.
      partialize: (state) => ({
        pmTool: state.pmTool,
        taigaToken: state.taigaToken,
        taigaApiUrl: state.taigaApiUrl,
        workspaceSlug: state.workspaceSlug,
        projectId: state.projectId,
        planeProjectId: state.planeProjectId,
        projectName: state.projectName,
        pmProjectSlug: state.pmProjectSlug,
        projectInstanceUrl: state.projectInstanceUrl,
        githubRepo: state.githubRepo,
        figmaFileKey: state.figmaFileKey,
        figmaFileName: state.figmaFileName,
        autopilotJobId: state.autopilotJobId,
      }),
    },
  ),
);

export function useApiContext() {
  const taigaToken = useSessionStore((state) => state.taigaToken);
  const taigaApiUrl = useSessionStore((state) => state.taigaApiUrl);
  const workspaceSlug = useSessionStore((state) => state.workspaceSlug);
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
  // Plane: a persisted projectId is a minted int from THIS TAB's id-shim
  // table (plane-id-shim.ts), a module singleton that resets on every
  // reload. Right after a reload, the persisted int matches nothing until
  // useRestoreProjectConfig (sidebar.tsx) re-mints it from the persisted
  // real UUID (planeProjectId) and corrects the store a moment later — a
  // brief window where every project-scoped query would otherwise fire with
  // an unresolvable id and fail loudly (found live, 2026-08-10: a toast
  // storm on load with any persisted Plane session, see
  // plane_integration_plan memory). Treating "not yet resolved" the same as
  // "no project selected" here means every consumer's existing
  // `enabled: Boolean(context)` gate already covers this for free, instead
  // of each one needing its own resolveId try/catch.
  if (pmTool === "plane") {
    try {
      resolveId(projectId);
    } catch {
      return null;
    }
  }

  return { taigaToken, taigaApiUrl, projectId, pmTool, pmProjectId: pmProjectSlug || undefined, workspaceSlug: workspaceSlug || undefined };
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
  const workspaceSlug = useSessionStore((state) => state.workspaceSlug);
  return taigaToken ? { taigaToken, taigaApiUrl, pmTool, workspaceSlug: workspaceSlug || undefined } : null;
}
