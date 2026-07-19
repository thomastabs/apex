import { apiRequest } from "./client";
import type {
  DeployPackOptions,
  GithubDeploymentConfig,
  GithubDeploymentRunResponse,
  GithubDeploymentStatusResponse,
  InfraDelta,
  Phase5DeployPackResponse,
  Phase5DeployPacksResponse,
  Phase5EligibleStoriesResponse,
  Phase5InfraDeltaResponse,
  Phase5QaResultsResponse,
  Phase5StoryContext,
  RequestContext,
  VerificationMatrixPayload,
} from "./types";

export const PHASE5_AI_TIMEOUT_MS = 480_000;

export function getEligibleStories(context: RequestContext) {
  return apiRequest<Phase5EligibleStoriesResponse>("/api/phase5/eligible-stories", { context });
}

export function getStoryContext(context: RequestContext, storyId: number) {
  return apiRequest<Phase5StoryContext>(`/api/phase5/story-context/${storyId}`, { context });
}

export function generateInfraDelta(
  context: RequestContext,
  storyId: number,
  signal?: AbortSignal,
  extraContextFiles: string[] = [],
) {
  return apiRequest<Phase5InfraDeltaResponse>("/api/phase5/generate-infra-delta", {
    method: "POST",
    context,
    body: { story_id: storyId, ...(extraContextFiles.length ? { extra_context_files: extraContextFiles } : {}) },
    timeoutMs: PHASE5_AI_TIMEOUT_MS,
    signal,
  });
}

export function saveInfraDelta(context: RequestContext, storyId: number, delta: InfraDelta) {
  return apiRequest<{ ok: boolean }>("/api/phase5/save-infra-delta", {
    method: "POST",
    context,
    body: { story_id: storyId, delta },
  });
}

export function getInfraDelta(context: RequestContext, storyId: number) {
  return apiRequest<Phase5InfraDeltaResponse>(`/api/phase5/infra-delta/${storyId}`, { context });
}

export function generateDeployPack(
  context: RequestContext,
  storyId: number,
  options?: DeployPackOptions,
  signal?: AbortSignal,
  extraContextFiles: string[] = [],
) {
  return apiRequest<Phase5DeployPackResponse>("/api/phase5/generate-deploy-pack", {
    method: "POST",
    context,
    body: { story_id: storyId, ...(options ? { options } : {}), ...(extraContextFiles.length ? { extra_context_files: extraContextFiles } : {}) },
    timeoutMs: PHASE5_AI_TIMEOUT_MS,
    signal,
  });
}

export function saveDeployPack(context: RequestContext, storyId: number, deployPackMd: string) {
  return apiRequest<{ ok: boolean }>("/api/phase5/save-deploy-pack", {
    method: "POST",
    context,
    body: { story_id: storyId, deploy_pack_md: deployPackMd },
  });
}

export function getDeployPack(context: RequestContext, storyId: number) {
  return apiRequest<Phase5DeployPackResponse>(`/api/phase5/deploy-pack/${storyId}`, { context });
}

export function listDeployPacks(context: RequestContext) {
  return apiRequest<Phase5DeployPacksResponse>("/api/phase5/deploy-packs", { context });
}

export function deleteDeployPack(context: RequestContext, storyId: number) {
  return apiRequest<{ ok: boolean }>(`/api/phase5/deploy-pack/${storyId}`, {
    method: "DELETE",
    context,
  });
}

export function reviseDeployPack(
  context: RequestContext,
  storyId: number,
  deployPackMd: string,
  feedback: string,
  signal?: AbortSignal,
) {
  return apiRequest<Phase5DeployPackResponse>("/api/phase5/revise-deploy-pack", {
    method: "POST",
    context,
    body: { story_id: storyId, deploy_pack_md: deployPackMd, feedback },
    timeoutMs: PHASE5_AI_TIMEOUT_MS,
    signal,
  });
}

export function getQaResults(context: RequestContext, storyId: number) {
  return apiRequest<Phase5QaResultsResponse>(`/api/phase5/qa-results/${storyId}`, { context });
}

export function saveVerification(
  context: RequestContext,
  storyId: number,
  matrix: VerificationMatrixPayload,
) {
  return apiRequest<{ ok: boolean }>("/api/phase5/save-verification", {
    method: "POST",
    context,
    body: { story_id: storyId, matrix },
  });
}

export function passDeploymentGate(
  context: RequestContext,
  storyId: number,
  opts: { techLeadApproved: boolean; devopsApproved: boolean; notes?: string },
) {
  return apiRequest<{ ok: boolean }>("/api/phase5/pass-deployment-gate", {
    method: "POST",
    context,
    body: {
      story_id: storyId,
      tech_lead_approved: opts.techLeadApproved,
      devops_approved: opts.devopsApproved,
      notes: opts.notes ?? "",
    },
  });
}

export function getGithubDeploymentStatus(context: RequestContext, storyId?: number | null) {
  const suffix = storyId ? `?story_id=${storyId}` : "";
  return apiRequest<GithubDeploymentStatusResponse>(`/api/phase5/github-deployment/status${suffix}`, { context });
}

export function saveGithubDeploymentConfig(context: RequestContext, config: GithubDeploymentConfig) {
  return apiRequest<GithubDeploymentStatusResponse>("/api/phase5/github-deployment/config", {
    method: "POST",
    context,
    body: { config },
  });
}

export function dispatchGithubDeployment(context: RequestContext, storyId: number) {
  return apiRequest<GithubDeploymentRunResponse>("/api/phase5/github-deployment/dispatch", {
    method: "POST",
    context,
    body: { story_id: storyId, confirmed: true },
  });
}

export function syncGithubDeployment(context: RequestContext, storyId: number, runId?: number | null) {
  return apiRequest<GithubDeploymentRunResponse>("/api/phase5/github-deployment/sync", {
    method: "POST",
    context,
    body: { story_id: storyId, ...(runId ? { run_id: runId } : {}) },
  });
}
