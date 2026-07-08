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
  figma_file_key: string;
  github_pat_configured: boolean;
  figma_token_configured: boolean;
};

export function saveGithubConfig(context: AuthContext, repo: string, pat?: string) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { github_repo: repo, ...(pat !== undefined ? { github_pat: pat } : {}) },
  });
}

/** Decrypted PAT saved server-side, for restoring the browser-direct GitHub
 * session on load — never part of the general config response. */
export function getGithubPat(context: AuthContext) {
  return apiRequest<{ pat: string }>("/api/workspace/github-pat", { context });
}

export type GithubWebhookConfig = {
  instance_id: string;
  secret: string;
  configured: boolean;
};

export function getGithubWebhookConfig(context: AuthContext) {
  return apiRequest<GithubWebhookConfig>("/api/workspace/github-webhook", { context });
}

export type GithubSyncStatus = {
  last_push_at: string | null;
  context_synced_at: string | null;
};

export function getGithubSyncStatus(context: RequestContext) {
  return apiRequest<GithubSyncStatus>("/api/workspace/github/sync-status", { context });
}

export function saveFigmaConfig(context: AuthContext, fileKey: string, token?: string) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { figma_file_key: fileKey, ...(token !== undefined ? { figma_token: token } : {}) },
  });
}

/** Decrypted token saved server-side, for restoring the Figma session on load
 * — never part of the general config response. */
export function getFigmaToken(context: AuthContext) {
  return apiRequest<{ token: string }>("/api/workspace/figma-token", { context });
}

export function getServerConfig(context: AuthContext) {
  return apiRequest<ServerConfig>("/api/workspace/config", { context });
}

export type AiConfigResponse = {
  model: string;
  available_models: Array<{ id: string; label: string; role: string; provider?: string; note?: string }>;
  // Usable right now (system env var set, or a personal key saved).
  configured_providers: string[];
  // Deployment-wide key set via *_API_KEY env var on the backend — the "system key".
  system_providers: string[];
  // Has a personal key saved to *your* Taiga/Jira account — always the active
  // credential for that provider once saved (takes priority over the system key).
  personal_providers: string[];
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

export type AiKeyStatusResponse = { ok: boolean; personal_providers: string[] };

/** Save a personal AI provider API key, tied to your Taiga/Jira account —
 * encrypted server-side, remembered next time you sign in from anywhere. */
export function saveAiKey(context: AuthContext, provider: string, apiKey: string) {
  return apiRequest<AiKeyStatusResponse>("/api/workspace/ai-keys", {
    method: "POST",
    context,
    body: { provider, api_key: apiKey },
  });
}

export function deleteAiKey(context: AuthContext, provider: string) {
  return apiRequest<AiKeyStatusResponse>(`/api/workspace/ai-keys/${encodeURIComponent(provider)}`, {
    method: "DELETE",
    context,
  });
}

export function saveServerConfig(context: AuthContext, projectId: number) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { project_id: projectId },
  });
}

export function savePmConfig(context: AuthContext, opts: { pmTool: "taiga" | "jira"; taigaUrl?: string; jiraBaseUrl?: string }) {
  return apiRequest<{ ok: boolean }>("/api/workspace/config", {
    method: "POST",
    context,
    body: { pm_tool: opts.pmTool, taiga_url: opts.taigaUrl ?? "", jira_base_url: opts.jiraBaseUrl ?? "" },
  });
}

export function getMe(context: AuthContext) {
  return getPmAdapter(context.pmTool).getMe(toPmAuth(context));
}

export function listProjects(context: AuthContext) {
  return getPmAdapter(context.pmTool).listProjects(toPmAuth(context));
}

export function createProject(context: AuthContext, name: string, description: string, opts?: { isPrivate?: boolean; templateId?: number | null }) {
  return getPmAdapter(context.pmTool).createProject(toPmAuth(context), name, description, opts);
}

export function listProjectTemplates(context: AuthContext) {
  return getPmAdapter(context.pmTool).listProjectTemplates(toPmAuth(context));
}

export function updateProject(context: AuthContext, projectId: number | string, fields: { name?: string; description?: string }) {
  return getPmAdapter(context.pmTool).updateProject(toPmAuth(context), String(projectId), fields);
}

export function deleteProject(context: AuthContext, projectId: number | string) {
  return getPmAdapter(context.pmTool).deleteProject(toPmAuth(context), String(projectId));
}

export function getContextFiles(context: RequestContext) {
  return apiRequest<ContextFilesResponse>("/api/workspace/context-files", { context });
}

export function updateContextFile(context: RequestContext, filename: string, content: string, note = "") {
  return apiRequest<ContextFilesResponse>(`/api/workspace/context-files/${filename}`, {
    method: "PUT",
    context,
    body: { content, note },
  });
}

/**
 * Sync figma-context.md server-side: the backend makes the (several) Figma calls
 * — file + comments + design tokens — assembles the markdown (the same assembler
 * Autopilot uses) and writes it, so the browser makes ONE request and the Figma
 * token never round-trips through client-side assembly. Returns the refreshed
 * context-files listing. A Figma rate-limit surfaces as a 429 with the real reason.
 */
export function syncFigmaContext(context: RequestContext, figmaToken: string, figmaFileKey: string) {
  return apiRequest<ContextFilesResponse>("/api/workspace/figma/sync-context", {
    method: "POST",
    context,
    headers: { "X-Figma-Token": figmaToken },
    body: { figma_file_key: figmaFileKey },
  });
}

/**
 * Sync github-context.md server-side: the backend clones the configured repo
 * (server-side PAT, already persisted) and packs it with `repomix` into real
 * file contents — no PAT round-trips through the browser, and there's nothing
 * to pass in the body (repo + PAT are resolved server-side). Returns the
 * refreshed context-files listing.
 */
export function syncGithubContext(context: RequestContext) {
  return apiRequest<ContextFilesResponse>("/api/workspace/github/sync-context", {
    method: "POST",
    context,
  });
}

export function acknowledgeSpecDrift(context: RequestContext, storyId: number) {
  return apiRequest<{ ok: boolean }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/acknowledge-drift`,
    { method: "POST", context },
  );
}

export function acknowledgeBacktrace(context: RequestContext, storyId: number) {
  return apiRequest<{ ok: boolean }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/acknowledge-trace`,
    { method: "POST", context },
  );
}

export function acknowledgeConflict(context: RequestContext, storyId: number) {
  return apiRequest<{ ok: boolean }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/acknowledge-conflict`,
    { method: "POST", context },
  );
}

export function logDecision(
  context: RequestContext,
  body: { scope: string; summary: string; reason?: string },
) {
  return apiRequest<{ ok: boolean }>("/api/workspace/decisions", {
    method: "POST",
    context,
    body: { scope: body.scope, summary: body.summary, reason: body.reason ?? "" },
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
  spec_drift: number;
  drifted_story_ids: number[];
  conformance_regressed: number;
  regressed_story_ids: number[];
  trace_flagged: number;
  trace_story_ids: number[];
  trace_flags: TraceFlagInfo[];
  design_conflict: number;
  conflicted_story_ids: number[];
  conflict_flags: ConflictFlagInfo[];
  figma_links: FigmaLinkInfo[];
  figma_changed: number;
  figma_changed_story_ids: number[];
};

export type FigmaLinkInfo = {
  story_id: number;
  figma_node_id: string;
  figma_file_key?: string;  // which file the node lives in; empty = configured single file
};

export type TraceFlagInfo = {
  story_id: number;
  phase: string;        // "gherkin_locked" | "design_locked"
  phase_label: string;  // "Phase 1" | "Phase 2"
  reason: string;
};

export type ConflictFlagInfo = {
  story_id: number;
  reason: string;
};

export function getStoryIndexStats(context: RequestContext) {
  return apiRequest<StoryIndexStats>("/api/workspace/context-files/story-index-stats", { context });
}

export function setStoryFigmaLink(
  context: RequestContext, storyId: number, figmaNodeId: string, figmaModified = "", figmaFileKey = "",
) {
  return apiRequest<{ ok: boolean }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/figma-link`,
    {
      method: "POST",
      context,
      body: {
        figma_node_id: figmaNodeId, figma_modified: figmaModified,
        figma_file_key: figmaFileKey,
      },
    },
  );
}

export function scanFigmaChanges(context: RequestContext, currentModified: string) {
  return apiRequest<{ changed_story_ids: number[] }>("/api/workspace/figma/scan-changes", {
    method: "POST",
    context,
    body: { current_modified: currentModified },
  });
}

/**
 * Per-file drift scan: file key → that file's current lastModified ("" = configured file).
 * A linked story is flagged when its file changed since the story was linked.
 */
export function scanFigmaChangesMulti(
  context: RequestContext, modifiedByFile: Record<string, string>,
) {
  return apiRequest<{ changed_story_ids: number[] }>("/api/workspace/figma/scan-changes", {
    method: "POST",
    context,
    body: { modified_by_file: modifiedByFile },
  });
}

export function acknowledgeFigmaChange(
  context: RequestContext, storyId: number, currentModified: string,
) {
  return apiRequest<{ ok: boolean }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/acknowledge-figma-change`,
    { method: "POST", context, body: { current_modified: currentModified } },
  );
}

export type TraceNodeType = "project" | "epic" | "design" | "story" | "gherkin" | "scenario" | "tasks" | "tests" | "deploy" | "figma";

export type TraceNode = {
  id: string;
  type: TraceNodeType;
  label: string;
  phase?: number | null;
  story_id?: number | null;
  phase_status?: string | null;
  scenario_count?: number | null;
  verified?: boolean | null;
  figma_node_id?: string | null;
  flags?: Record<string, boolean>;
  position?: { x: number; y: number } | null;
};

export type TraceEdge = {
  id: string;
  source: string;
  target: string;
  kind: "derive" | "design" | "conflict" | "trace" | "verify" | "regression";
};

export type TraceabilityGraph = { nodes: TraceNode[]; edges: TraceEdge[] };

export function getTraceabilityGraph(context: RequestContext, scenarios = false) {
  const qs = scenarios ? "?scenarios=true" : "";
  return apiRequest<TraceabilityGraph>(`/api/workspace/traceability-graph${qs}`, { context });
}

export function saveTraceabilityLayout(context: RequestContext, nodes: Array<{ id: string; x: number; y: number }>) {
  return apiRequest<{ ok: boolean }>("/api/workspace/traceability-graph/positions", {
    method: "PUT",
    context,
    body: { nodes },
  });
}

export type ApexPhaseStatus =
  | "new" | "gherkin_locked" | "design_locked" | "implementation" | "qa" | "qa_passed" | "deployed";

export function getStoryPhaseStatus(context: RequestContext, storyId: number) {
  return apiRequest<{ phase_status: ApexPhaseStatus | null }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/phase-status`,
    { context },
  );
}

export function setStoryPhaseStatus(context: RequestContext, storyId: number, phaseStatus: ApexPhaseStatus) {
  return apiRequest<{ ok: boolean }>(
    `/api/workspace/context-files/story-index/stories/${storyId}/phase-status`,
    { method: "POST", context, body: { phase_status: phaseStatus } },
  );
}

export function resetAllContextFiles(context: RequestContext) {
  return apiRequest<ContextFilesResponse>("/api/workspace/context-files/reset-all", {
    method: "POST",
    context,
  });
}
