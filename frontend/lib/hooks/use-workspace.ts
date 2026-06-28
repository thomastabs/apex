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
  deleteEpic,
  deleteProject,
  deleteStory,
  getAiConfig,
  getBoard,
  getContextFiles,
  getMe,
  getServerConfig,
  acknowledgeFigmaChange,
  getStoryIndexStats,
  scanFigmaChanges,
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
  return useQuery({
    queryKey: ["workspace", "server-config"],
    queryFn: () => getServerConfig(auth!),
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
    mutationFn: (currentModified: string) => scanFigmaChanges(context!, currentModified),
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

export function useSaveGithubConfig() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repo: string) => saveGithubConfig(auth!, repo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "server-config"] });
    },
  });
}

export function useSyncGithubContext() {
  const ctx = useApiContext();
  const github = useGithubContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!ctx || !github) throw new Error("Not connected to GitHub.");
      const { fetchGithubContextMd } = await import("@/lib/api/github-browser");
      const md = await fetchGithubContextMd(github);
      const { updateContextFile } = await import("@/lib/api/workspace");
      return updateContextFile(ctx, "github-context.md", md);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
    },
  });
}

export function useSaveFigmaConfig() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => saveFigmaConfig(auth!, fileKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "server-config"] });
    },
  });
}

export function useSyncFigmaContext() {
  const ctx = useApiContext();
  const figma = useFigmaContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!ctx || !figma) throw new Error("Not connected to Figma.");
      const { fetchFigmaContextMd } = await import("@/lib/api/figma");
      const md = await fetchFigmaContextMd(figma.token, figma.fileKey);
      const { updateContextFile } = await import("@/lib/api/workspace");
      return updateContextFile(ctx, "figma-context.md", md);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
    },
  });
}
