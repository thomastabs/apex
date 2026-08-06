import { apiRequest } from "./client";
import { getBoard } from "./workspace";
import type { RequestContext } from "./types";

export type ImportEpicSummary = {
  id: number;
  title: string;
  story_count: number;
};

export type ImportStatusMapping = {
  // Renamed from taiga_name (2026-08-06, phase 4c) — shared with Plane's
  // bootstrap now, a Taiga-specific field name was misleading.
  pm_status_name: string;
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

/** Plane's bootstrap: fetch the board via the already-tested adapter
 *  (Epics/Modules fallback, pagination, label resolution all handled
 *  there — see plane-direct.ts) and post it to the backend, which mints
 *  durable ids and populates story-index. Never dials Plane for board
 *  data server-side — see plane_integration_plan memory phase 4c. */
export async function importPlaneBootstrap(ctx: RequestContext): Promise<ImportBootstrapResult> {
  const board = await getBoard(ctx);
  return apiRequest<ImportBootstrapResult>("/api/workspace/import-from-pm/plane-bootstrap", {
    method: "POST",
    context: ctx,
    body: {
      epics: board
        .filter((epic) => epic.pm_epic_id)
        .map((epic) => ({
          pm_epic_id: epic.pm_epic_id,
          subject: epic.subject,
          stories: epic.stories
            .filter((story) => story.pm_story_id)
            .map((story) => ({
              pm_story_id: story.pm_story_id,
              subject: story.subject,
              status: story.status,
            })),
        })),
    },
  });
}

export function importReconstructEpic(ctx: RequestContext, epicId: number): Promise<ImportReconstructResult> {
  return apiRequest<ImportReconstructResult>(`/api/workspace/import-from-pm/reconstruct-epic/${epicId}`, {
    method: "POST",
    context: ctx,
  });
}
