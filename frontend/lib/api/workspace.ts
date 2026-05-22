import { apiRequest } from "./client";
import {
  taigaCreateEpic,
  taigaCreateProject,
  taigaCreateStory,
  taigaDeleteEpic,
  taigaDeleteProject,
  taigaDeleteStory,
  taigaGetBoard,
  taigaGetMe,
  taigaGetUsers,
  taigaInviteUser,
  taigaListProjects,
  taigaListStoryStatuses,
  taigaRemoveMember,
  taigaUpdateEpic,
  taigaUpdateMemberRole,
  taigaUpdateStory,
} from "./taiga-direct";
import type {
  AuthContext,
  ContextFilesResponse,
  Epic,
  EpicWithStories,
  Me,
  Project,
  RequestContext,
  Story,
  UsersResponse,
} from "./types";

export function getServerConfig(context: AuthContext) {
  return apiRequest<{ project_id: number | null; taiga_web_url: string }>("/api/workspace/config", { context });
}

export type AiConfigResponse = {
  fast_model: string;
  coder_model: string;
  available_models: Array<{ id: string; label: string; role: string }>;
};

export function getAiConfig(context: AuthContext) {
  return apiRequest<AiConfigResponse>("/api/workspace/ai-config", { context });
}

export function saveAiConfig(context: AuthContext, fast_model: string, coder_model: string) {
  return apiRequest<{ fast_model: string; coder_model: string }>("/api/workspace/ai-config", {
    method: "POST",
    context,
    body: { fast_model, coder_model },
  });
}

export function saveServerConfig(context: AuthContext, projectId: number) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { project_id: projectId },
  });
}

export function getMe(context: AuthContext) {
  return taigaGetMe(context.taigaToken);
}

export function listProjects(context: AuthContext) {
  return taigaListProjects(context.taigaToken);
}

export function createProject(context: AuthContext, name: string, description: string) {
  return taigaCreateProject(context.taigaToken, name, description);
}

export function deleteProject(context: AuthContext, projectId: number) {
  return taigaDeleteProject(context.taigaToken, projectId);
}

export function getContextFiles(context: RequestContext) {
  return apiRequest<ContextFilesResponse>("/api/workspace/context-files", { context });
}

export function updateContextFile(context: RequestContext, filename: string, content: string) {
  return apiRequest<ContextFilesResponse>(`/api/workspace/context-files/${filename}`, {
    method: "PUT",
    context,
    body: { content },
  });
}

export function resetContextFile(context: RequestContext, filename: string) {
  return apiRequest<ContextFilesResponse>(`/api/workspace/context-files/${filename}/reset`, {
    method: "POST",
    context,
  });
}

export function getBoard(context: RequestContext) {
  return taigaGetBoard(context.taigaToken, context.projectId);
}

export function getUsers(context: RequestContext) {
  return taigaGetUsers(context.taigaToken, context.projectId);
}

export function inviteUser(context: RequestContext, usernameOrEmail: string, roleId: number) {
  return taigaInviteUser(context.taigaToken, context.projectId, usernameOrEmail, roleId);
}

export function listStoryStatuses(context: RequestContext) {
  return taigaListStoryStatuses(context.taigaToken, context.projectId);
}

export function createEpic(context: RequestContext, subject: string, description: string, tags: string[] = []) {
  return taigaCreateEpic(context.taigaToken, context.projectId, subject, description, tags);
}

export function deleteEpic(context: RequestContext, epicId: number) {
  return taigaDeleteEpic(context.taigaToken, epicId);
}

export function createStory(
  context: RequestContext,
  epicId: number,
  subject: string,
  description: string,
  tags: string[] = [],
  statusId?: number,
) {
  return taigaCreateStory(context.taigaToken, context.projectId, epicId, subject, description, tags, statusId);
}

export function deleteStory(context: RequestContext, storyId: number) {
  return taigaDeleteStory(context.taigaToken, storyId);
}

export function updateEpic(
  context: RequestContext,
  epicId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
) {
  return taigaUpdateEpic(context.taigaToken, epicId, version, fields);
}

export function updateStory(
  context: RequestContext,
  storyId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
) {
  return taigaUpdateStory(context.taigaToken, storyId, version, fields);
}

export function removeMember(context: RequestContext, membershipId: number) {
  return taigaRemoveMember(context.taigaToken, membershipId);
}

export function updateMemberRole(context: RequestContext, membershipId: number, roleId: number) {
  return taigaUpdateMemberRole(context.taigaToken, membershipId, roleId);
}

export function rebuildStoryIndex(context: RequestContext) {
  return apiRequest<{ ok: boolean }>("/api/workspace/context-files/rebuild-index", {
    method: "POST",
    context,
  });
}

export type StoryIndexStats = {
  total: number;
  phase2_designed: number;
  phase3_proposed: number;
  phase4_tested: number;
  phase5_deployed: number;
};

export function getStoryIndexStats(context: RequestContext) {
  return apiRequest<StoryIndexStats>("/api/workspace/context-files/story-index-stats", { context });
}

export function resetAllContextFiles(context: RequestContext) {
  return apiRequest<ContextFilesResponse>("/api/workspace/context-files/reset-all", {
    method: "POST",
    context,
  });
}
