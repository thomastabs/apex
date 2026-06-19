import { ApiError, apiRequest } from "./client";
import type {
  ConformanceEligibleStoriesResponse,
  ConformanceReport,
  MaintenanceItem,
  MaintenanceItemsResponse,
  RequestContext,
  SeveritySuggestion,
} from "./types";

// Conformance runs the AI semantic layer over the spec + synced code — long.
export const PHASE6_AI_TIMEOUT_MS = 480_000;

export function getConformanceEligibleStories(context: RequestContext) {
  return apiRequest<ConformanceEligibleStoriesResponse>("/api/phase6/eligible-stories", { context });
}

export function verifyConformance(
  context: RequestContext,
  storyId: number,
  ai = true,
  extraFiles: { path: string; content: string }[] = [],
  signal?: AbortSignal,
) {
  return apiRequest<ConformanceReport>("/api/phase6/conformance", {
    method: "POST",
    context,
    body: { story_id: storyId, ai, extra_files: extraFiles },
    timeoutMs: ai ? PHASE6_AI_TIMEOUT_MS : undefined,
    signal,
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

// ── Maintenance (F1 Triage + F2 Fix-Bolt routing) ──────────────────────────

const M = "/api/phase6/maintenance";

export function listMaintenanceItems(context: RequestContext) {
  return apiRequest<MaintenanceItemsResponse>(`${M}/items`, { context });
}

export function createMaintenanceItem(
  context: RequestContext,
  body: {
    subject: string; description?: string; evidence?: string;
    source?: "manual" | "github" | "taiga"; ext_ref?: string; linked_story_id?: number | null;
  },
) {
  return apiRequest<MaintenanceItem>(`${M}/items`, { method: "POST", context, body });
}

export function deleteMaintenanceItem(context: RequestContext, itemId: number) {
  return apiRequest<MaintenanceItemsResponse>(`${M}/items/${itemId}`, { method: "DELETE", context });
}

export function classifyMaintenanceItem(context: RequestContext, itemId: number, signal?: AbortSignal) {
  return apiRequest<MaintenanceItem>(`${M}/items/${itemId}/classify`, {
    method: "POST", context, timeoutMs: PHASE6_AI_TIMEOUT_MS, signal,
  });
}

export function diagnoseMaintenanceItem(context: RequestContext, itemId: number, codeSnippet: string, signal?: AbortSignal) {
  return apiRequest<MaintenanceItem>(`${M}/items/${itemId}/diagnose`, {
    method: "POST", context, body: { code_snippet: codeSnippet }, timeoutMs: PHASE6_AI_TIMEOUT_MS, signal,
  });
}

export function fixBriefMaintenanceItem(context: RequestContext, itemId: number, signal?: AbortSignal) {
  return apiRequest<MaintenanceItem>(`${M}/items/${itemId}/fix-brief`, {
    method: "POST", context, timeoutMs: PHASE6_AI_TIMEOUT_MS, signal,
  });
}

export function suggestLane(context: RequestContext, itemId: number) {
  return apiRequest<SeveritySuggestion>(`${M}/items/${itemId}/suggest-lane`, { context });
}

export function routeMaintenanceItem(context: RequestContext, itemId: number, lane: "fast" | "secure") {
  return apiRequest<MaintenanceItem>(`${M}/items/${itemId}/route`, {
    method: "POST", context, body: { lane },
  });
}

export function resolveMaintenanceItem(
  context: RequestContext, itemId: number, rootCause = "", resolutionSummary = "",
) {
  return apiRequest<MaintenanceItem>(`${M}/items/${itemId}/resolve`, {
    method: "POST", context, body: { root_cause: rootCause, resolution_summary: resolutionSummary },
  });
}
