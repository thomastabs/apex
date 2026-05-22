import { apiRequest } from "./client";
import type {
  DesignBundle,
  LockDesignRequest,
  LockDesignResponse,
  LockTechStackRequest,
  ProposeTechStackRequest,
  ProposeTechStackResponse,
  RequestContext,
  TechStackStatus,
} from "./types";

export const PHASE2_AI_TIMEOUT_MS = 480_000;

export function getTechStackStatus(context: RequestContext) {
  return apiRequest<TechStackStatus>("/api/phase2/tech-stack-status", { context });
}

export function proposeTechStack(context: RequestContext, body: ProposeTechStackRequest = {}) {
  return apiRequest<ProposeTechStackResponse>("/api/phase2/propose-tech-stack", {
    method: "POST",
    context,
    body,
    timeoutMs: PHASE2_AI_TIMEOUT_MS,
  });
}

export function lockTechStack(context: RequestContext, body: LockTechStackRequest) {
  return apiRequest<TechStackStatus>("/api/phase2/lock-tech-stack", {
    method: "POST",
    context,
    body,
  });
}

export function generateDesignBundle(context: RequestContext, signal?: AbortSignal) {
  return apiRequest<DesignBundle>("/api/phase2/generate-design-bundle", {
    method: "POST",
    context,
    body: {},
    timeoutMs: PHASE2_AI_TIMEOUT_MS,
    signal,
  });
}

export function lockDesign(context: RequestContext, body: LockDesignRequest) {
  return apiRequest<LockDesignResponse>("/api/phase2/lock-design", {
    method: "POST",
    context,
    body,
    timeoutMs: 120_000,
  });
}

export function refreshStoryIndex(context: RequestContext) {
  return apiRequest<{ ok: boolean }>("/api/phase2/refresh-story-index", {
    method: "POST",
    context,
  });
}
