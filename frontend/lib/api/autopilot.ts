import { apiRequest } from "./client";
import type { RequestContext } from "./types";

export type AutopilotEpic = {
  title: string;
  description: string;
};

export type AutopilotSettings = {
  pause_at_checkpoints: boolean;
  create_epics_in_taiga: boolean;
  // When true, the pipeline derives epics from the project concept (AI) instead of
  // requiring a manual epics list. Ignored in Figma project mode.
  auto_epics: boolean;
};

export type AutopilotPhaseKey = "phase1" | "phase2" | "phase3" | "phase4" | "phase5";

export type AutopilotStartRequest = {
  concept: string;
  epics: AutopilotEpic[];
  tech_stack_hint: string;
  settings: AutopilotSettings;
  figma_file_key?: string;
  figma_token?: string;
  figma_project_id?: string;  // project mode: derive one epic per file (file-as-epic)
  start_phase?: AutopilotPhaseKey;  // skip earlier phases already done in the project
};

export type AutopilotEvent = {
  id: number;
  ts: number;
  level: "info" | "success" | "warning" | "error" | "checkpoint";
  msg: string;
  phase: string;
  artifact: string;
};

export type AutopilotState = "running" | "paused" | "stopped" | "done" | "error" | "interrupted";
export type AutopilotPhase = "init" | "phase1" | "phase2" | "phase3" | "phase4" | "phase5" | "done";

export type AutopilotStatus = {
  job_id: string;
  state: AutopilotState;
  current_phase: AutopilotPhase;
  current_epic_idx: number | null;
  current_story_id: number | null;
  events: AutopilotEvent[];
  error: string | null;
  story_count: number;
  stories_done: number;
  epic_count: number;
  epics_done: number;
  checkpoint_phase: string | null;
  steer_note: string;
};

export function startAutopilot(ctx: RequestContext, body: AutopilotStartRequest): Promise<{ job_id: string }> {
  return apiRequest("/api/autopilot/start", { method: "POST", context: ctx, body });
}

export function getAutopilotStatus(ctx: RequestContext, jobId: string): Promise<AutopilotStatus> {
  return apiRequest(`/api/autopilot/${jobId}`, { method: "GET", context: ctx });
}

export function pauseAutopilot(ctx: RequestContext, jobId: string): Promise<{ ok: boolean; state: AutopilotState }> {
  return apiRequest(`/api/autopilot/${jobId}/pause`, { method: "POST", context: ctx });
}

export function resumeAutopilot(ctx: RequestContext, jobId: string): Promise<{ ok: boolean; state: AutopilotState }> {
  return apiRequest(`/api/autopilot/${jobId}/resume`, { method: "POST", context: ctx });
}

export function stopAutopilot(ctx: RequestContext, jobId: string): Promise<{ ok: boolean; state: AutopilotState }> {
  return apiRequest(`/api/autopilot/${jobId}/stop`, { method: "POST", context: ctx });
}

export function takeOverAutopilot(ctx: RequestContext, jobId: string): Promise<{ ok: boolean; state: AutopilotState }> {
  return apiRequest(`/api/autopilot/${jobId}/take-over`, { method: "POST", context: ctx });
}

export function steerAutopilot(ctx: RequestContext, jobId: string, note: string): Promise<{ ok: boolean; state: AutopilotState }> {
  return apiRequest(`/api/autopilot/${jobId}/steer`, { method: "POST", context: ctx, body: { note } });
}

/** Reattach: the active project's persisted job (live, or interrupted after a restart). */
export function getPersistedAutopilot(ctx: RequestContext): Promise<AutopilotStatus> {
  return apiRequest("/api/autopilot/persisted", { method: "GET", context: ctx });
}

/** Resume the active project's interrupted job from its persisted cursor. */
export function resumeInterruptedAutopilot(ctx: RequestContext): Promise<{ job_id: string }> {
  return apiRequest("/api/autopilot/persisted/resume", { method: "POST", context: ctx });
}

/** Forget the persisted job (New Run). */
export function clearPersistedAutopilot(ctx: RequestContext): Promise<{ ok: boolean; state: AutopilotState }> {
  return apiRequest("/api/autopilot/persisted", { method: "DELETE", context: ctx });
}
