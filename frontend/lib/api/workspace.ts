import { apiRequest } from "./client";
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

export function login(username: string, password: string) {
  return apiRequest<{ auth_token: string; me: Me }>("/api/workspace/login", {
    method: "POST",
    body: { username, password },
  });
}

export function getMe(context: AuthContext) {
  return apiRequest<Me>("/api/workspace/me", { context });
}

export function listProjects(context: AuthContext) {
  return apiRequest<Project[]>("/api/workspace/projects", { context });
}

export function createProject(context: AuthContext, name: string, description: string) {
  return apiRequest<Project>("/api/workspace/projects", {
    method: "POST",
    context,
    body: { name, description },
  });
}

export function deleteProject(context: AuthContext, projectId: number) {
  return apiRequest<{ ok: boolean }>(`/api/workspace/projects/${projectId}`, {
    method: "DELETE",
    context,
  });
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
  return apiRequest<EpicWithStories[]>("/api/workspace/board", { context });
}

export function getUsers(context: RequestContext) {
  return apiRequest<UsersResponse>("/api/workspace/users", { context });
}

export function inviteUser(context: RequestContext, usernameOrEmail: string, roleId: number) {
  return apiRequest<unknown>("/api/workspace/users/invite", {
    method: "POST",
    context,
    body: { username_or_email: usernameOrEmail, role_id: roleId },
  });
}

export function listStoryStatuses(context: RequestContext) {
  return apiRequest<Array<{ id: number; name: string; color: string; is_closed: boolean }>>("/api/workspace/story-statuses", { context });
}

export function createEpic(context: RequestContext, subject: string, description: string, tags: string[] = []) {
  return apiRequest<unknown>("/api/workspace/epics", {
    method: "POST",
    context,
    body: { subject, description, tags },
  });
}

export function deleteEpic(context: RequestContext, epicId: number) {
  return apiRequest<unknown>(`/api/workspace/epics/${epicId}`, {
    method: "DELETE",
    context,
  });
}

export function createStory(
  context: RequestContext,
  epicId: number,
  subject: string,
  description: string,
  tags: string[] = [],
  statusId?: number,
) {
  return apiRequest<unknown>("/api/workspace/stories", {
    method: "POST",
    context,
    body: { epic_id: epicId, subject, description, tags, status_id: statusId ?? null },
  });
}

export function deleteStory(context: RequestContext, storyId: number) {
  return apiRequest<unknown>(`/api/workspace/stories/${storyId}`, {
    method: "DELETE",
    context,
  });
}

export function updateEpic(
  context: RequestContext,
  epicId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
) {
  return apiRequest<Epic>(`/api/workspace/epics/${epicId}`, {
    method: "PUT",
    context,
    body: { version, ...fields },
  });
}

export function updateStory(
  context: RequestContext,
  storyId: number,
  version: number,
  fields: { subject?: string; description?: string; tags?: string[] },
) {
  return apiRequest<Story>(`/api/workspace/stories/${storyId}`, {
    method: "PUT",
    context,
    body: { version, ...fields },
  });
}

export function removeMember(context: RequestContext, membershipId: number) {
  return apiRequest<{ ok: boolean }>(`/api/workspace/users/members/${membershipId}`, {
    method: "DELETE",
    context,
  });
}

export function updateMemberRole(context: RequestContext, membershipId: number, roleId: number) {
  return apiRequest<unknown>(`/api/workspace/users/members/${membershipId}/role`, {
    method: "PUT",
    context,
    body: { role_id: roleId },
  });
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
