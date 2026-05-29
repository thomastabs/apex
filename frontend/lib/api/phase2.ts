import { apiRequest } from "./client";
import {
  taigaGetStory,
  taigaListStoryStatuses,
  taigaUpdateStory,
} from "./taiga-direct";
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
  // Persist to backend first — Taiga is only updated after the bundle is safely stored.
  // If persist fails it throws and Taiga is never touched, avoiding split-brain state.
  const persisted = await apiRequest<LockDesignResponse>("/api/phase2/persist-design", {
    method: "POST",
    context,
    body,
    timeoutMs: 120_000,
  });
  let taiga_failures: Array<{ story_id: number; error: string }> = [];
  try {
    taiga_failures = await transitionTaigaStories(context, body.story_ids);
  } catch {
    // transitionTaigaStories shouldn't throw, but if it does the bundle is already saved
    taiga_failures = body.story_ids.map((id) => ({ story_id: id, error: "Taiga transition failed unexpectedly" }));
  }
  return {
    ...persisted,
    ok: persisted.ok && taiga_failures.length === 0,
    taiga_failures,
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

async function transitionTaigaStories(context: RequestContext, storyIds: number[]) {
  let statusId: number | undefined;
  let statusFetchFailed = false;
  try {
    const statuses = await taigaListStoryStatuses(context.taigaToken, context.projectId, context.taigaApiUrl);
    statusId = statuses.find((status) => {
      const name = status.name.toLowerCase();
      return name.includes("design_locked") || name.includes("design locked") || name.includes("ready for implementation");
    })?.id;
  } catch {
    statusFetchFailed = true;
  }
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
  if (statusFetchFailed && failures.length === 0) {
    // Stories were tagged but status wasn't updated — surface this so the lock result isn't misleadingly ok=true
    failures.push({ story_id: -1, error: "Could not fetch Taiga story statuses — stories tagged but status not updated" });
  }
  return failures;
}
