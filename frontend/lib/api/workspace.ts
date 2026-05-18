import { apiRequest } from "./client";
import type {
  AuthContext,
  ContextFilesResponse,
  EpicWithStories,
  Me,
  Project,
  RequestContext,
  UsersResponse,
} from "./types";

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

export function createEpic(context: RequestContext, subject: string, description: string) {
  return apiRequest<unknown>("/api/workspace/epics", {
    method: "POST",
    context,
    body: { subject, description },
  });
}

export function deleteEpic(context: RequestContext, epicId: number) {
  return apiRequest<unknown>(`/api/workspace/epics/${epicId}`, {
    method: "DELETE",
    context,
  });
}

export function createStory(context: RequestContext, epicId: number, subject: string, description: string) {
  return apiRequest<unknown>("/api/workspace/stories", {
    method: "POST",
    context,
    body: { epic_id: epicId, subject, description },
  });
}

export function deleteStory(context: RequestContext, storyId: number) {
  return apiRequest<unknown>(`/api/workspace/stories/${storyId}`, {
    method: "DELETE",
    context,
  });
}
