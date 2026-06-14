import { apiRequest } from "./client";
import { getPmAdapter } from "./pm-factory";
import { toPmCtx } from "./workspace";
import type {
  DesignSectionKey,
  DesignSectionResponse,
  DiagramNode,
  DiagramResponse,
  LockDesignRequest,
  LockDesignResponse,
  LockTechStackRequest,
  ProposeTechStackRequest,
  ProposeTechStackResponse,
  RequestContext,
  ScreenFlowNode,
  ScreenFlowResponse,
  TechStackStatus,
} from "./types";

export const PHASE2_AI_TIMEOUT_MS = 480_000;

// Delegates to the shared toPmCtx so Taiga gets the numeric projectId — using
// pmProjectId (the slug) made the adapter send project=NaN→null (Taiga 400).
function pmCtx(context: RequestContext) {
  return toPmCtx(context);
}

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
): Promise<DesignSectionResponse> {
  return apiRequest<DesignSectionResponse>("/api/phase2/generate-design-section", {
    method: "POST",
    context,
    body: { section, prior },
    timeoutMs: PHASE2_AI_TIMEOUT_MS,
    signal,
  });
}

export async function lockDesign(context: RequestContext, body: LockDesignRequest): Promise<LockDesignResponse> {
  // Persist to backend first — PM is only updated after the bundle is safely stored.
  // If persist fails it throws and PM is never touched, avoiding split-brain state.
  const persisted = await apiRequest<LockDesignResponse>("/api/phase2/persist-design", {
    method: "POST",
    context,
    body,
    timeoutMs: 120_000,
  });
  let pm_failures: Array<{ story_id: number; error: string }> = [];
  try {
    pm_failures = await transitionDesignLockedStories(context, body.story_ids);
  } catch {
    pm_failures = body.story_ids.map((id) => ({ story_id: id, error: "PM transition failed unexpectedly" }));
  }
  return {
    ...persisted,
    ok: persisted.ok && pm_failures.length === 0,
    taiga_failures: pm_failures,
  };
}

export function loadDiagram(context: RequestContext) {
  return apiRequest<DiagramResponse | null>("/api/phase2/diagram", { context });
}

export function generateDiagram(context: RequestContext, data_model_md: string) {
  return apiRequest<DiagramResponse>("/api/phase2/generate-diagram", {
    method: "POST",
    context,
    body: { data_model_md },
    timeoutMs: PHASE2_AI_TIMEOUT_MS,
  });
}

export function saveDiagramPositions(context: RequestContext, nodes: DiagramNode[]) {
  return apiRequest<{ ok: boolean }>("/api/phase2/diagram/positions", {
    method: "PUT",
    context,
    body: { nodes },
  });
}

export function loadScreenFlow(context: RequestContext) {
  return apiRequest<ScreenFlowResponse | null>("/api/phase2/screen-flow", { context });
}

export function generateScreenFlow(context: RequestContext, ux_brief_md: string) {
  return apiRequest<ScreenFlowResponse>("/api/phase2/generate-screen-flow", {
    method: "POST",
    context,
    body: { ux_brief_md },
    timeoutMs: PHASE2_AI_TIMEOUT_MS,
  });
}

export function saveScreenFlowPositions(context: RequestContext, nodes: ScreenFlowNode[]) {
  return apiRequest<{ ok: boolean }>("/api/phase2/screen-flow/positions", {
    method: "PUT",
    context,
    body: { nodes },
  });
}

export function refreshStoryIndex(context: RequestContext) {
  return apiRequest<{ ok: boolean }>("/api/phase2/refresh-story-index", {
    method: "POST",
    context,
  });
}

async function transitionDesignLockedStories(context: RequestContext, storyIds: number[]) {
  const adapter = getPmAdapter(context.pmTool);
  const ctx = pmCtx(context);
  let targetStatusId: string | undefined;
  let statusFetchFailed = false;
  try {
    const statuses = await adapter.listStoryStatuses(ctx);
    targetStatusId = statuses.find((status) => {
      const name = status.name.toLowerCase();
      return name.includes("design_locked") || name.includes("design locked") || name.includes("ready for implementation");
    })?.id;
  } catch {
    statusFetchFailed = true;
  }
  const failures: Array<{ story_id: number; error: string }> = [];
  for (const storyId of storyIds) {
    try {
      const story = await adapter.getStory(ctx, String(storyId));
      await adapter.updateStory(ctx, String(storyId), story.version ?? 1, {
        tags: Array.from(new Set([...(story.tags ?? []), "apex", "design_locked"])).sort(),
        ...(targetStatusId ? { status: targetStatusId } : {}),
      });
    } catch (error) {
      failures.push({ story_id: storyId, error: error instanceof Error ? error.message : "PM transition failed" });
    }
  }
  if (statusFetchFailed && failures.length === 0) {
    failures.push({ story_id: -1, error: "Could not fetch story statuses — stories tagged but status not updated" });
  }
  return failures;
}
