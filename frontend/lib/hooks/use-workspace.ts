"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEpic,
  createProject,
  createStory,
  deleteEpic,
  deleteProject,
  deleteStory,
  getBoard,
  getContextFiles,
  getMe,
  getStoryIndexStats,
  getUsers,
  inviteUser,
  listProjects,
  login,
  rebuildStoryIndex,
  removeMember,
  resetAllContextFiles,
  resetContextFile,
  updateContextFile,
  updateEpic,
  updateMemberRole,
  updateStory,
} from "@/lib/api/workspace";
import { useApiContext, useAuthContext } from "@/lib/stores/session-store";

export function useMe() {
  const auth = useAuthContext();
  return useQuery({
    queryKey: ["workspace", "me"],
    queryFn: () => getMe(auth!),
    enabled: Boolean(auth),
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

export function useLogin() {
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
  });
}

export function useCreateProject() {
  const auth = useAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      createProject(auth!, name, description),
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
  });
}

export function useUpdateContextFile() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      updateContextFile(context!, filename, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "context-files"] });
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
  });
}

export function useCreateEpic() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subject, description }: { subject: string; description: string }) =>
      createEpic(context!, subject, description),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
    },
  });
}

export function useDeleteEpic() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (epicId: number) => deleteEpic(context!, epicId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
    },
  });
}

export function useCreateStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ epicId, subject, description }: { epicId: number; subject: string; description: string }) =>
      createStory(context!, epicId, subject, description),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
    },
  });
}

export function useDeleteStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: number) => deleteStory(context!, storyId),
    onSuccess: () => {
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
  });
}

export function useInviteUser() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usernameOrEmail, roleId }: { usernameOrEmail: string; roleId: number }) =>
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
  return useMutation({
    mutationFn: ({
      epicId,
      version,
      fields,
    }: {
      epicId: number;
      version: number;
      fields: { subject?: string; description?: string; tags?: string[] };
    }) => updateEpic(context!, epicId, version, fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["phase1", "epics"] });
    },
  });
}

export function useUpdateStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      storyId,
      version,
      fields,
    }: {
      storyId: number;
      version: number;
      fields: { subject?: string; description?: string; tags?: string[] };
    }) => updateStory(context!, storyId, version, fields),
    onSuccess: () => {
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
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
  });
}

export function useStoryIndexStats() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["workspace", "story-index-stats", context?.projectId],
    queryFn: () => getStoryIndexStats(context!),
    enabled: Boolean(context),
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
