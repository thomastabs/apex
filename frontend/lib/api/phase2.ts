import { apiRequest } from "./client";
import {
  taigaGetStory,
  taigaListStoryStatuses,
  taigaUpdateStory,
} from "./taiga-direct";
import type {
  DesignSectionKey,
  DesignSectionResponse,
  LockDesignRequest,
  LockDesignResponse,
  LockTechStackRequest,
  ProposeTechStackRequest,
  ProposeTechStackResponse,
  RequestContext,
  TechStackStatus,
  WireframeMode,
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

export function generateDesignSection(
  context: RequestContext,
  section: DesignSectionKey,
  prior: Record<string, string>,
  signal?: AbortSignal,
  wireframeMode: WireframeMode = "screen_inventory",
): Promise<DesignSectionResponse> {
  return apiRequest<DesignSectionResponse>("/api/phase2/generate-design-section", {
    method: "POST",
    context,
    body: { section, prior, wireframe_mode: wireframeMode },
    timeoutMs: PHASE2_AI_TIMEOUT_MS,
    signal,
  });
}

export async function lockDesign(context: RequestContext, body: LockDesignRequest): Promise<LockDesignResponse> {
  // Persist to backend first — Taiga is only updated after the bundle is safely stored.
  // If persist fails it throws and Taiga is never touched, avoiding split-brain state.
  const persisted = await apiRequest<LockDesignResponse>("/api/phase2/persist-design", {
    method: "POST",
    context,
    body,
    timeoutMs: 120_000,
  });
  const taiga_failures = await transitionTaigaStories(context, body.story_ids);
  return {
    ...persisted,
    ok: persisted.ok && taiga_failures.length === 0,
    taiga_failures,
  };
}

export function refreshStoryIndex(context: RequestContext) {
  return apiRequest<{ ok: boolean }>("/api/phase2/refresh-story-index", {
    method: "POST",
    context,
  });
}

async function transitionTaigaStories(context: RequestContext, storyIds: number[]) {
  const statuses = await taigaListStoryStatuses(context.taigaToken, context.projectId, context.taigaApiUrl).catch(() => []);
  const statusId = statuses.find((status) => {
    const name = status.name.toLowerCase();
    return name.includes("design_locked") || name.includes("design locked") || name.includes("ready for implementation");
  })?.id;
  const failures: Array<{ story_id: number; error: string }> = [];
  for (const storyId of storyIds) {
    try {
      const story = await taigaGetStory(context.taigaToken, storyId, context.taigaApiUrl);
      if (!story.version) continue;
      await taigaUpdateStory(
        context.taigaToken,
        storyId,
        story.version,
        {
          tags: Array.from(new Set([...(story.tags ?? []), "apex", "design_locked"])).sort(),
          ...(statusId ? { status: statusId } : {}),
        },
        context.taigaApiUrl,
      );
    } catch (error) {
      failures.push({ story_id: storyId, error: error instanceof Error ? error.message : "Taiga transition failed" });
    }
  }
  return failures;
}
