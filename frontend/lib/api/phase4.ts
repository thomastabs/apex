import { apiRequest } from "./client";
import type {
  Phase4EligibleStoriesResponse,
  Phase4FailGateRequest,
  Phase4GenerateBugReportRequest,
  Phase4GenerateBugReportResponse,
  Phase4GenerateTestPlanResponse,
  Phase4ScenarioResultItem,
  Phase4StoryContext,
  Phase4TestPlanResponse,
  Phase4TestPlansResponse,
  RequestContext,
} from "./types";

export const PHASE4_AI_TIMEOUT_MS = 480_000;

export function getEligibleStories(context: RequestContext) {
  return apiRequest<Phase4EligibleStoriesResponse>("/api/phase4/eligible-stories", { context });
}

export function getStoryContext(context: RequestContext, storyId: number) {
  return apiRequest<Phase4StoryContext>(`/api/phase4/story-context/${storyId}`, { context });
}

export function generateTestPlan(context: RequestContext, storyId: number) {
  return apiRequest<Phase4GenerateTestPlanResponse>("/api/phase4/generate-test-plan", {
    method: "POST",
    context,
    body: { story_id: storyId },
    timeoutMs: PHASE4_AI_TIMEOUT_MS,
  });
}

export function saveTestPlan(context: RequestContext, storyId: number, testPlanMd: string) {
  return apiRequest<{ ok: boolean }>("/api/phase4/save-test-plan", {
    method: "POST",
    context,
    body: { story_id: storyId, test_plan_md: testPlanMd },
  });
}

export function getTestPlan(context: RequestContext, storyId: number) {
  return apiRequest<Phase4TestPlanResponse>(`/api/phase4/test-plan/${storyId}`, { context });
}

export function listTestPlans(context: RequestContext) {
  return apiRequest<Phase4TestPlansResponse>("/api/phase4/test-plans", { context });
}

export function deleteTestPlan(context: RequestContext, storyId: number) {
  return apiRequest<{ ok: boolean }>(`/api/phase4/test-plan/${storyId}`, {
    method: "DELETE",
    context,
  });
}

export function generateBugReport(context: RequestContext, body: Phase4GenerateBugReportRequest) {
  return apiRequest<Phase4GenerateBugReportResponse>("/api/phase4/generate-bug-report", {
    method: "POST",
    context,
    body,
    timeoutMs: PHASE4_AI_TIMEOUT_MS,
  });
}

export function passGate(
  context: RequestContext,
  storyId: number,
  scenarioResults?: Phase4ScenarioResultItem[],
) {
  return apiRequest<{ ok: boolean }>("/api/phase4/pass-gate", {
    method: "POST",
    context,
    body: {
      story_id: storyId,
      ...(scenarioResults?.length ? { scenario_results: scenarioResults } : {}),
    },
  });
}

export function failGate(context: RequestContext, body: Phase4FailGateRequest) {
  return apiRequest<{ ok: boolean }>("/api/phase4/fail-gate", {
    method: "POST",
    context,
    body,
  });
}
