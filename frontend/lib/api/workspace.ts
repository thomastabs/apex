import { apiRequest } from "./client";
import { getPmAdapter } from "./pm-factory";
import type { PmAuthContext, PmRequestContext } from "./pm-types";
import type {
  AuthContext,
  ContextFilesResponse,
  RequestContext,
} from "./types";

function toPmAuth(ctx: AuthContext): PmAuthContext {
  return { token: ctx.taigaToken, baseUrl: ctx.taigaApiUrl ?? "" };
}

export function toPmCtx(ctx: RequestContext): PmRequestContext {
  return {
    token: ctx.taigaToken,
    baseUrl: ctx.taigaApiUrl ?? "",
    // For Jira, pmProjectId is the project KEY (e.g. "TEST") — required.
    // For Taiga, pmProjectId is the slug (e.g. "test2") — wrong; Taiga REST API
    // uses numeric IDs, so always fall back to the numeric projectId for Taiga.
    projectId: ctx.pmTool === "jira"
      ? (ctx.pmProjectId ?? String(ctx.projectId))
      : String(ctx.projectId),
  };
}

export type ServerConfig = {
  project_id: number | null;
  taiga_web_url: string;
  pm_tool: string;
  pm_web_url: string;
  github_repo: string;
};

export function saveGithubConfig(context: AuthContext, repo: string) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { github_repo: repo },
  });
}

export function getServerConfig(context: AuthContext) {
  return apiRequest<ServerConfig>("/api/workspace/config", { context });
}

export type AiConfigResponse = {
  model: string;
  available_models: Array<{ id: string; label: string; role: string; provider?: string; note?: string }>;
  configured_providers: string[];
};

export function getAiConfig(context: AuthContext) {
  return apiRequest<AiConfigResponse>("/api/workspace/ai-config", { context });
}

export function saveAiConfig(context: AuthContext, model: string) {
  return apiRequest<{ model: string }>("/api/workspace/ai-config", {
    method: "POST",
    context,
    body: { model },
  });
}

export function saveServerConfig(context: AuthContext, projectId: number) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { project_id: projectId },
  });
}

export function savePmConfig(context: AuthContext, opts: { pmTool: "taiga" | "jira"; jiraBaseUrl?: string }) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { pm_tool: opts.pmTool, jira_base_url: opts.jiraBaseUrl ?? "" },
  });
}

export function getMe(context: AuthContext) {
  return getPmAdapter(context.pmTool).getMe(toPmAuth(context));
}

export function listProjects(context: AuthContext) {
  return getPmAdapter(context.pmTool).listProjects(toPmAuth(context));
}

export function createProject(context: AuthContext, name: string, description: string) {
  return getPmAdapter(context.pmTool).createProject(toPmAuth(context), name, description);
}

export function deleteProject(context: AuthContext, projectId: number | string) {
  return getPmAdapter(context.pmTool).deleteProject(toPmAuth(context), String(projectId));
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
  return getPmAdapter(context.pmTool).getBoard(toPmCtx(context));
}

export function getUsers(context: RequestContext) {
  return getPmAdapter(context.pmTool).getUsers(toPmCtx(context));
}

export function inviteUser(context: RequestContext, usernameOrEmail: string, roleId: number | string) {
  return getPmAdapter(context.pmTool).inviteUser(toPmCtx(context), usernameOrEmail, String(roleId));
}

export function listStoryStatuses(context: RequestContext) {
  return getPmAdapter(context.pmTool).listStoryStatuses(toPmCtx(context));
}

export function createEpic(context: RequestContext, subject: string, description: string, tags: string[] = []) {
  return getPmAdapter(context.pmTool).createEpic(toPmCtx(context), subject, description, tags);
}

export async function deleteEpic(context: RequestContext, epicId: number | string) {
  const result = await getPmAdapter(context.pmTool).deleteEpic(toPmCtx(context), String(epicId));
  await apiRequest<{ ok: boolean }>(`/api/workspace/context-files/story-index/epics/${epicId}`, {
    method: "DELETE",
    context,
  }).catch(() => undefined);
  return result;
}

export function createStory(
  context: RequestContext,
  epicId: number | string,
  subject: string,
  description: string,
  tags: string[] = [],
  statusId?: number | string,
) {
  return getPmAdapter(context.pmTool).createStory(
    toPmCtx(context),
    String(epicId),
    subject,
    description,
    tags,
    statusId !== undefined ? String(statusId) : undefined,
  );
}

export async function deleteStory(context: RequestContext, storyId: number | string) {
  await getPmAdapter(context.pmTool).deleteStory(toPmCtx(context), String(storyId));
  await apiRequest<{ ok: boolean }>(`/api/workspace/context-files/story-index/stories/${storyId}`, {
    method: "DELETE",
    context,
  }).catch(() => undefined);
  return { ok: true };
}

export function updateEpic(
  context: RequestContext,
  epicId: number | string,
  version: number | string,
  fields: { subject?: string; description?: string; tags?: string[] },
) {
  return getPmAdapter(context.pmTool).updateEpic(toPmCtx(context), String(epicId), version, fields);
}

export function updateStory(
  context: RequestContext,
  storyId: number | string,
  version: number | string,
  fields: { subject?: string; description?: string; tags?: string[]; status?: string },
) {
  return getPmAdapter(context.pmTool).updateStory(toPmCtx(context), String(storyId), version, fields);
}

export function removeMember(context: RequestContext, membershipId: number | string) {
  return getPmAdapter(context.pmTool).removeMember(toPmCtx(context), String(membershipId));
}

export function updateMemberRole(context: RequestContext, membershipId: number | string, roleId: number | string) {
  return getPmAdapter(context.pmTool).updateMemberRole(toPmCtx(context), String(membershipId), String(roleId));
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
  phase4_passed: number;
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
