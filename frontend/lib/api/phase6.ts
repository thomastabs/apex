import { ApiError, apiRequest } from "./client";
import type {
  ConformanceEligibleStoriesResponse,
  ConformanceReport,
  RequestContext,
} from "./types";

// Conformance runs the AI semantic layer over the spec + synced code — long.
export const PHASE6_AI_TIMEOUT_MS = 480_000;

export function getConformanceEligibleStories(context: RequestContext) {
  return apiRequest<ConformanceEligibleStoriesResponse>("/api/phase6/eligible-stories", { context });
}

export function verifyConformance(context: RequestContext, storyId: number, ai = true) {
  return apiRequest<ConformanceReport>("/api/phase6/conformance", {
    method: "POST",
    context,
    body: { story_id: storyId, ai },
    timeoutMs: ai ? PHASE6_AI_TIMEOUT_MS : undefined,
  });
}

/** Load the last persisted report, or null if none has been run yet (404). */
export async function getConformanceReport(
  context: RequestContext,
  storyId: number,
): Promise<ConformanceReport | null> {
  try {
    return await apiRequest<ConformanceReport>(`/api/phase6/conformance/${storyId}`, { context });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
