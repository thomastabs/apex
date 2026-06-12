import { apiRequest } from "./client";
import type {
  InfraDelta,
  Phase5DeployPackResponse,
  Phase5EligibleStoriesResponse,
  Phase5InfraDeltaResponse,
  Phase5StoryContext,
  RequestContext,
} from "./types";

export const PHASE5_AI_TIMEOUT_MS = 480_000;

export function getEligibleStories(context: RequestContext) {
  return apiRequest<Phase5EligibleStoriesResponse>("/api/phase5/eligible-stories", { context });
}

export function getStoryContext(context: RequestContext, storyId: number) {
  return apiRequest<Phase5StoryContext>(`/api/phase5/story-context/${storyId}`, { context });
}

export function generateInfraDelta(context: RequestContext, storyId: number) {
  return apiRequest<Phase5InfraDeltaResponse>("/api/phase5/generate-infra-delta", {
    method: "POST",
    context,
    body: { story_id: storyId },
    timeoutMs: PHASE5_AI_TIMEOUT_MS,
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

export function generateDeployPack(context: RequestContext, storyId: number) {
  return apiRequest<Phase5DeployPackResponse>("/api/phase5/generate-deploy-pack", {
    method: "POST",
    context,
    body: { story_id: storyId },
    timeoutMs: PHASE5_AI_TIMEOUT_MS,
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

export function reviseDeployPack(
  context: RequestContext,
  storyId: number,
  deployPackMd: string,
  feedback: string,
) {
  return apiRequest<Phase5DeployPackResponse>("/api/phase5/revise-deploy-pack", {
    method: "POST",
    context,
    body: { story_id: storyId, deploy_pack_md: deployPackMd, feedback },
    timeoutMs: PHASE5_AI_TIMEOUT_MS,
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
