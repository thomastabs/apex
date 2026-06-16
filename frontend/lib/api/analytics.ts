import { apiRequest } from "./client";
import type { RequestContext } from "./types";

export type CycleTimeStat = {
  transition: string;
  median_hours: number;
  p90_hours: number;
  samples: number;
};

export type StoryAnalyticsRow = {
  story_id: number;
  title: string;
  epic_title: string;
  phase_status: string;
  fix_bolt_count: number;
  total_cycle_hours: number | null;
  artifact_complete: boolean;
};

export type AnalyticsSummary = {
  funnel: Record<string, number>;
  cycle_times: CycleTimeStat[];
  traceability: { deployed: number; complete: number; rate: number };
  conformance: { eligible: number; checked: number; avg_score: number };
  defects: { total_fix_bolts: number; stories_affected: number; avg_per_story: number };
  stories: StoryAnalyticsRow[];
};

export function getAnalyticsSummary(context: RequestContext) {
  return apiRequest<AnalyticsSummary>("/api/analytics/summary", { context });
}
