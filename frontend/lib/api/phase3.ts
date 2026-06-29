import { apiRequest } from "./client";
import type { CrossCheckResult } from "./phase1";
import type {
  DesignConflictReport,
  Phase3EligibleStoriesResponse,
  Phase3GenerateProposalRequest,
  Phase3GenerateProposalResponse,
  Phase3GenerateTasksResponse,
  Phase3LockStoryRequest,
  Phase3SaveProposalRequest,
  Phase3StoryContext,
  RequestContext,
} from "./types";

export const PHASE3_AI_TIMEOUT_MS = 480_000;

export function getEligibleStories(context: RequestContext) {
  return apiRequest<Phase3EligibleStoriesResponse>("/api/phase3/eligible-stories", { context });
}

export function scanDesignConflicts(context: RequestContext) {
  return apiRequest<DesignConflictReport>("/api/phase3/scan-design-conflicts", { method: "POST", context });
}

export function crossCheckTasks(context: RequestContext, storyId: number, altModel = "", signal?: AbortSignal) {
  return apiRequest<CrossCheckResult>("/api/phase3/cross-check-tasks", {
    method: "POST", context, body: { story_id: storyId, alt_model: altModel }, timeoutMs: 300_000, signal,
  });
}

export function getStoryContext(context: RequestContext, storyId: number) {
  return apiRequest<Phase3StoryContext>(`/api/phase3/story-context/${storyId}`, { context });
}

export function generateTasks(context: RequestContext, storyId: number, instructions = "", signal?: AbortSignal) {
  return apiRequest<Phase3GenerateTasksResponse>("/api/phase3/generate-tasks", {
    method: "POST",
    context,
    body: { story_id: storyId, instructions },
    timeoutMs: PHASE3_AI_TIMEOUT_MS,
    signal,
  });
}

export function generateProposal(
  context: RequestContext,
  body: Phase3GenerateProposalRequest,
  signal?: AbortSignal,
  // When the story is linked to a Figma frame, passing the token lets the backend
  // render that screen to a PNG and attach it to the developer pack (multimodal).
  figmaToken?: string,
) {
  return apiRequest<Phase3GenerateProposalResponse>("/api/phase3/generate-proposal", {
    method: "POST",
    context,
    body,
    headers: figmaToken ? { "X-Figma-Token": figmaToken } : undefined,
    timeoutMs: PHASE3_AI_TIMEOUT_MS,
    signal,
  });
}

export function saveProposal(context: RequestContext, body: Phase3SaveProposalRequest) {
  return apiRequest<{ ok: boolean }>("/api/phase3/save-proposal", {
    method: "POST",
    context,
    body,
  });
}

export function lockStory(context: RequestContext, body: Phase3LockStoryRequest) {
  return apiRequest<{ ok: boolean }>("/api/phase3/lock-story", {
    method: "POST",
    context,
    body,
  });
}

export function getProposals(context: RequestContext, storyId: number) {
  return apiRequest<{ story_id: number; proposals: Array<{ task_id: number; proposal_md: string }> }>(
    `/api/phase3/proposals/${storyId}`,
    { context },
  );
}

export function listPacks(context: RequestContext) {
  return apiRequest<{
    packs: Array<{ story_id: number; story_title: string; task_id: number; chars: number }>;
  }>("/api/phase3/packs", { context });
}

export function deleteProposal(context: RequestContext, storyId: number, taskId: number) {
  return apiRequest<{ ok: boolean }>(`/api/phase3/proposal/${storyId}/${taskId}`, {
    method: "DELETE",
    context,
  });
}

