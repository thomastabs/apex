import { apiRequest } from "./client";
import type { RequestContext } from "./types";

export type ImportEpicSummary = {
  id: number;
  title: string;
  story_count: number;
};

export type ImportStatusMapping = {
  taiga_name: string;
  apex_status: string;
};

export type ImportBootstrapResult = {
  imported: number;
  skipped: number;
  epics: ImportEpicSummary[];
  status_mapping: ImportStatusMapping[];
};

export type ImportStoryResult = {
  story_id: number;
  status: "ok" | "skipped";
  reason?: string;
};

export type ImportReconstructResult = {
  epic_id: number;
  epic_title: string;
  results: ImportStoryResult[];
};

export function importBootstrap(ctx: RequestContext): Promise<ImportBootstrapResult> {
  return apiRequest<ImportBootstrapResult>("/api/workspace/import-from-pm", {
    method: "POST",
    context: ctx,
  });
}

export function importReconstructEpic(ctx: RequestContext, epicId: number): Promise<ImportReconstructResult> {
  return apiRequest<ImportReconstructResult>(`/api/workspace/import-from-pm/reconstruct-epic/${epicId}`, {
    method: "POST",
    context: ctx,
  });
}
