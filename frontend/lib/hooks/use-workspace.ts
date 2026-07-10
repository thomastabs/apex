"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeBacktrace,
  acknowledgeConflict,
  logDecision,
  acknowledgeSpecDrift,
  createEpic,
  createProject,
  listProjectTemplates,
  updateProject,
  createStory,
  deleteAiKey,
  deleteEpic,
  deleteProject,
  deleteStory,
  getAiConfig,
  getBoard,
  getContextFiles,
  getFigmaToken,
  getGithubPat,
  getGithubSyncStatus,
  getGithubWebhookConfig,
  getMe,
  getServerConfig,
  acknowledgeFigmaChange,
  getStoryIndexStats,
  scanFigmaChanges,
  scanFigmaChangesMulti,
  setStoryFigmaLink,
  getStoryPhaseStatus,
  getTraceabilityGraph,
  saveTraceabilityLayout,
  getUsers,
  inviteUser,
  listProjects,
  listStoryStatuses,
  rebuildStoryIndex,
  removeMember,
  resetAllContextFiles,
  resetContextFile,
  saveAiConfig,
  saveAiKey,
  saveGithubConfig,
  saveFigmaConfig,
  saveServerConfig,
  setStoryPhaseStatus,
  updateContextFile,
  updateEpic,
  updateMemberRole,
  updateStory,
  type ApexPhaseStatus,
} from "@/lib/api/workspace";
import { getUsageSummary } from "@/lib/api/usage";
import { useApiContext, useAuthContext, useGithubContext, useFigmaContext } from "@/lib/stores/session-store";
import { toast } from "sonner";

export function useMe() {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "me"],
    queryFn: () => getMe(auth!),
    enabled: Boolean(auth),
  });
}

export function useServerConfig() {
  const auth = useAuthContext();
  const ctx = useApiContext();
  return useQuery({
    // github_repo/github_pat_configured are per-project now — key on projectId
    // so switching projects actually refetches instead of reusing a stale
    // cached response from whichever project was active before.
    queryKey: ["workspace", "server-config", ctx?.projectId],
    queryFn: () => getServerConfig(auth!, ctx?.projectId),
    enabled: Boolean(auth),
    staleTime: Infinity,
  });
}

export function useSaveServerConfig() {
  const auth = useAuthContext();
  return useMutation({
    mutationFn: (projectId: number) => saveServerConfig(auth!, projectId),
  });
}

export function useProjects() {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "projects"],
    queryFn: () => listProjects(auth!),
    enabled: Boolean(auth),
  });
}

export function useCreateProject() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description, isPrivate, templateId }: { name: string; description: string; isPrivate?: boolean; templateId?: number | null }) =>
      createProject(auth!, name, description, { isPrivate, templateId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "projects"] });
    },
  });
}

export function useProjectTemplates() {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "project-templates", auth?.pmTool, auth?.taigaApiUrl],
    queryFn: () => listProjectTemplates(auth!),
    enabled: Boolean(auth) && auth?.pmTool === "taiga",
    staleTime: 5 * 60_000,
  });
}

export function useUpdateProject() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name, description }: { projectId: number; name?: string; description?: string }) =>
      updateProject(auth!, projectId, { name, description }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "projects"] });
    },
  });
}

export function useDeleteProject() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) => deleteProject(auth!, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "projects"] });
    },
  });
}

export function useContextFiles() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "context-files", context?.projectId],
    queryFn: () => getContextFiles(context!),
    enabled: Boolean(context),
    staleTime: 30 * 1000,
  });
}

export function useUpdateContextFile() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content, note }: { filename: string; content: string; note?: string }) =>
      updateContextFile(context!, filename, content, note),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
      // Controlled co-evolution: a post-lock spec edit is never silent.
      if (res.drift?.amended) {
        const n = res.drift.affected_story_ids.length;
        toast.warning(
          `Spec changed after lock — ${n} downstream ${n === 1 ? "story" : "stories"} flagged for review.`,
        );
        void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
      }
    },
  });
}

export function useAcknowledgeSpecDrift() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: number) => acknowledgeSpecDrift(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useAcknowledgeBacktrace() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: number) => acknowledgeBacktrace(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useAcknowledgeConflict() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: number) => acknowledgeConflict(context!, storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useSetStoryFigmaLink() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, figmaNodeId, figmaModified = "", figmaFileKey = "" }: { storyId: number; figmaNodeId: string; figmaModified?: string; figmaFileKey?: string }) =>
      setStoryFigmaLink(context!, storyId, figmaNodeId, figmaModified, figmaFileKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useScanFigmaChanges() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    // A bare string scans the single configured file (legacy); the object form scans
    // per file (file key → current lastModified).
    mutationFn: (
      arg: string | { modifiedByFile: Record<string, string> },
    ) =>
      typeof arg === "string"
        ? scanFigmaChanges(context!, arg)
        : scanFigmaChangesMulti(context!, arg.modifiedByFile),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useAcknowledgeFigmaChange() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, currentModified = "" }: { storyId: number; currentModified?: string }) =>
      acknowledgeFigmaChange(context!, storyId, currentModified),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useLogDecision() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { scope: string; summary: string; reason?: string }) => logDecision(context!, body),
    onSuccess: () => {
      // Refresh the Active Context sidebar so the new decisions.md entry shows.
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files", context?.projectId] });
    },
  });
}

export function useResetContextFile() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => resetContextFile(context!, filename),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
    },
  });
}

export function useBoard() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "board", context?.projectId],
    queryFn: () => getBoard(context!),
    enabled: Boolean(context),
    staleTime: 30 * 1000,
  });
}

export function useStoryStatuses() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "story-statuses", context?.projectId],
    queryFn: () => listStoryStatuses(context!),
    enabled: Boolean(context),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fire-and-forget story-index resync. Called automatically after every
 * operation that adds, changes, or removes epics/stories/tasks so the index
 * (and the nav badges derived from it) never needs a manual rebuild click.
 * Silent on failure — the manual rebuild button stays as the fallback.
 */
export function useAutoSyncStoryIndex() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (!context) return;
    void rebuildStoryIndex(context)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context.projectId] });
        void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
        void queryClient.invalidateQueries({ queryKey: ["phase3", "eligible-stories", context.projectId] });
        void queryClient.invalidateQueries({ queryKey: ["phase4", "eligible-stories", context.projectId] });
        void queryClient.invalidateQueries({ queryKey: ["phase5", "eligible-stories", context.projectId] });
      })
      .catch(() => undefined);
  }, [context, queryClient]);
}

// Read a story's Apex phase_status from the story index.
export function useStoryPhaseStatus(storyId: number | null) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "story-phase-status", context?.projectId, storyId],
    queryFn: () => getStoryPhaseStatus(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 0,
  });
}

// Manually override a story's Apex phase_status. Invalidates the per-phase
// eligible-story lists + index stats so nav badges and Phase 2-5 reflect it.
export function useSetStoryPhaseStatus() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, phaseStatus }: { storyId: number; phaseStatus: ApexPhaseStatus }) =>
      setStoryPhaseStatus(context!, storyId, phaseStatus),
    onSuccess: (_, { storyId }) => {
      const pid = context?.projectId;
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-phase-status", pid, storyId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", pid] });
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
      for (const phase of ["phase3", "phase4", "phase5"]) {
        void queryClient.invalidateQueries({ queryKey: [phase, "eligible-stories", pid] });
      }
    },
  });
}

export function useCreateEpic() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();
  return useMutation({
    mutationFn: ({ subject, description, tags }: { subject: string; description: string; tags?: string[] }) =>
      createEpic(context!, subject, description, tags ?? []),
    onSuccess: () => {
      autoSync();
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
    },
  });
}

export function useDeleteEpic() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();
  return useMutation({
    mutationFn: (epicId: number) => deleteEpic(context!, epicId),
    onSuccess: () => {
      autoSync();
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
    },
  });
}

export function useCreateStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();
  return useMutation({
    mutationFn: ({
      epicId, subject, description, tags, statusId,
    }: { epicId: number; subject: string; description: string; tags?: string[]; statusId?: number }) =>
      createStory(context!, epicId, subject, description, tags ?? [], statusId),
    onSuccess: () => {
      autoSync();
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
    },
  });
}

export function useDeleteStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();
  return useMutation({
    mutationFn: (storyId: number) => deleteStory(context!, storyId),
    onSuccess: () => {
      autoSync();
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
    },
  });
}

export function useUsers() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "users", context?.projectId],
    queryFn: () => getUsers(context!),
    enabled: Boolean(context),
    staleTime: 60 * 1000,
  });
}

export function useInviteUser() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usernameOrEmail, roleId }: { usernameOrEmail: string; roleId: number | string }) =>
      inviteUser(context!, usernameOrEmail, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "users"] });
    },
  });
}

export function useRemoveMember() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: number) => removeMember(context!, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "users"] });
    },
  });
}

export function useUpdateMemberRole() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, roleId }: { membershipId: number; roleId: number }) =>
      updateMemberRole(context!, membershipId, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "users"] });
    },
  });
}

export function useUpdateEpic() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();
  return useMutation({
    mutationFn: ({
      epicId,
      version,
      fields,
    }: {
      epicId: number;
      version: number;
      fields: { subject?: string; description?: string; tags?: string[]; status?: number };
    }) => updateEpic(context!, epicId, version, fields),
    onSuccess: () => {
      autoSync();
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
    },
  });
}

export function useUpdateStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const autoSync = useAutoSyncStoryIndex();
  return useMutation({
    mutationFn: ({
      storyId,
      version,
      fields,
    }: {
      storyId: number;
      version: number;
      fields: { subject?: string; description?: string; tags?: string[]; status?: string };
    }) => updateStory(context!, storyId, version, fields),
    onSuccess: () => {
      autoSync();
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
    },
  });
}

export function useRebuildStoryIndex() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rebuildStoryIndex(context!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase2", "eligible-epics"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useStoryIndexStats() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "story-index-stats", context?.projectId],
    queryFn: () => getStoryIndexStats(context!),
    enabled: Boolean(context),
    staleTime: 30 * 1000,
  });
}

export function useTraceabilityGraph(scenarios = false) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "traceability-graph", context?.projectId, scenarios],
    queryFn: () => getTraceabilityGraph(context!, scenarios),
    enabled: Boolean(context),
    staleTime: 30 * 1000,
    // Reflect work done in other phases: refetch when the graph page regains
    // focus or remounts (it's a standalone route). Stays fresh without websockets.
    refetchOnWindowFocus: true,
  });
}

export function useSaveTraceLayout() {
  const context = useApiContext();
  return useMutation({
    mutationFn: (nodes: Array<{ id: string; x: number; y: number }>) => saveTraceabilityLayout(context!, nodes),
    onError: () => toast.error("Failed to save the graph layout."),
  });
}

export function useResetAllContextFiles() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetAllContextFiles(context!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
    },
  });
}

export function useAiConfig() {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "ai-config"],
    queryFn: () => getAiConfig(auth!),
    enabled: Boolean(auth),
    staleTime: 30 * 1000,
  });
}

export function useSaveAiConfig() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ model }: { model: string }) => saveAiConfig(auth!, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "ai-config"] });
    },
  });
}

export function useSaveAiKey() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) => saveAiKey(auth!, provider, apiKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "ai-config"] });
    },
  });
}

export function useDeleteAiKey() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => deleteAiKey(auth!, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "ai-config"] });
    },
  });
}

export function useUsageSummary(days = 30) {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "usage-summary", days],
    queryFn: () => getUsageSummary(auth!, days),
    enabled: Boolean(auth),
    staleTime: 30 * 1000,
  });
}

/** github_repo/github_pat are per-project — saves into whichever project is
 * currently active (there's no other project to reasonably guess). */
export function useSaveGithubConfig() {
  const auth = useAuthContext();
  const ctx = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repo, pat }: { repo: string; pat?: string }) => {
      if (!ctx?.projectId) throw new Error("No project selected.");
      return saveGithubConfig(auth!, repo, ctx.projectId, pat);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "server-config"] });
    },
  });
}

/** One-shot restore fetch — the decrypted PAT saved server-side, so the
 * browser-direct GitHub session doesn't need retyping every tab/session.
 * `enabled` should gate this on "server says configured, session has none yet"
 * so it's fetched once, not polled. Per-project — keyed + parameterized on
 * projectId so switching projects restores the RIGHT project's PAT. */
export function useGithubPat(enabled: boolean) {
  const auth = useAuthContext();
  const ctx = useApiContext();
  return useQuery({
    queryKey: ["workspace", "github-pat", ctx?.projectId],
    queryFn: () => getGithubPat(auth!, ctx?.projectId),
    enabled: Boolean(auth) && enabled,
    staleTime: Infinity,
  });
}

export function useGithubWebhookConfig(enabled: boolean) {
  const auth = useAuthContext();
  const ctx = useApiContext();
  return useQuery({
    queryKey: ["workspace", "github-webhook", ctx?.projectId],
    queryFn: () => getGithubWebhookConfig(auth!, ctx?.projectId),
    enabled: Boolean(auth) && enabled,
    staleTime: 60 * 1000,
  });
}

/** Settings → GitHub → Pack settings (detail mode, token budget, extra ignore globs). */
export function useGithubPackConfig() {
  const ctx = useApiContext();
  return useQuery({
    queryKey: ["workspace", "github-pack-config", ctx?.projectId],
    queryFn: async () => {
      const { getGithubPackConfig } = await import("@/lib/api/workspace");
      return getGithubPackConfig(ctx!);
    },
    enabled: Boolean(ctx),
    staleTime: 60 * 1000,
  });
}

export function useSaveGithubPackConfig() {
  const ctx = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<import("@/lib/api/workspace").GithubPackConfig>) => {
      if (!ctx) throw new Error("Not connected.");
      const { saveGithubPackConfig } = await import("@/lib/api/workspace");
      return saveGithubPackConfig(ctx, payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["workspace", "github-pack-config", ctx?.projectId], data);
    },
  });
}

/** Server-side clone + repomix pack — see lib/api/workspace.ts syncGithubContext. */
export function useSyncGithubContext() {
  const ctx = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!ctx) throw new Error("Not connected.");
      const { syncGithubContext } = await import("@/lib/api/workspace");
      return syncGithubContext(ctx);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "github-sync-status"] });
    },
  });
}

/**
 * Poll target: shows "last synced at" in the UI. The push webhook now repacks
 * github-context.md server-side on its own (backend/app/api/github_webhook.py),
 * so this no longer needs to drive a client-side auto-resync — it's read-only
 * status display.
 */
export function useGithubSyncStatus() {
  const ctx = useApiContext();
  const github = useGithubContext();
  return useQuery({
    queryKey: ["workspace", "github-sync-status", ctx?.projectId],
    queryFn: () => getGithubSyncStatus(ctx!),
    enabled: Boolean(ctx) && Boolean(github),
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useSaveFigmaConfig() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileKey, token }: { fileKey: string; token?: string }) => saveFigmaConfig(auth!, fileKey, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "server-config"] });
    },
  });
}

/** One-shot restore fetch — see useGithubPat. */
export function useFigmaToken(enabled: boolean) {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "figma-token"],
    queryFn: () => getFigmaToken(auth!),
    enabled: Boolean(auth) && enabled,
    staleTime: Infinity,
  });
}

export function useSyncFigmaContext() {
  const ctx = useApiContext();
  const figma = useFigmaContext();
  const queryClient = useQueryClient();
  return useMutation({
    // Server-side assembly: one call to our backend, which makes the Figma calls
    // (file + comments + design tokens) and writes figma-context.md. The token is
    // sent once as a header; no client-side fan-out to Figma.
    mutationFn: async () => {
      if (!ctx || !figma) throw new Error("Not connected to Figma.");
      const { syncFigmaContext } = await import("@/lib/api/workspace");
      return syncFigmaContext(ctx, figma.token, figma.fileKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
    },
  });
}
