"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  failGate,
  generateBugReport,
  generateTestPlan,
  getEligibleStories,
  getStoryContext,
  getTestPlan,
  passGate,
  saveTestPlan,
} from "@/lib/api/phase4";
import { getPmAdapter } from "@/lib/api/pm-factory";
import { toPmCtx } from "@/lib/api/workspace";
import { decodeApexMeta } from "@/lib/hooks/use-phase3";
import { useApiContext } from "@/lib/stores/session-store";
import { usePhase4Store } from "@/lib/stores/phase4-store";
import { toast } from "sonner";
import type { Phase4FailGateRequest, Phase4FailedScenario } from "@/lib/api/types";

export function useEligibleStories() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase4", "eligible-stories", context?.projectId],
    queryFn: () => getEligibleStories(context!),
    enabled: Boolean(context),
  });
}

export function useStoryContext(storyId: number | null) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase4", "story-context", context?.projectId, storyId],
    queryFn: () => getStoryContext(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
  });
}

/** Implementation tasks for a story, fetched from the PM tool (single source of
 *  truth since the task-list JSON store was removed). Shares the phase-3
 *  project-tasks cache key so the board and Phase 4 stay consistent. */
export function useStoryTasks(storyId: number | null) {
  const context = useApiContext();
  const query = useQuery({
    queryKey: ["pm", "project-tasks", context?.projectId],
    queryFn: () => getPmAdapter(context!.pmTool).getProjectTasks(toPmCtx(context!)),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 60_000,
  });
  const tasks = (query.data ?? [])
    .filter((t) => Number(t.user_story) === storyId)
    .map((t, i) => {
      const decoded = decodeApexMeta(t.description || "");
      return {
        id: i + 1,
        subject: t.subject,
        description: decoded.description,
        effort_estimate: decoded.effort_estimate,
        covered_scenarios: decoded.covered_scenarios,
      };
    });
  return { ...query, tasks };
}

export function useLoadTestPlan(storyId: number | null) {
  const context = useApiContext();
  const setTestPlanMd = usePhase4Store((s) => s.setTestPlanMd);
  return useQuery({
    queryKey: ["phase4", "test-plan", context?.projectId, storyId],
    queryFn: async () => {
      const res = await getTestPlan(context!, storyId!);
      if (res.test_plan_md) setTestPlanMd(res.test_plan_md);
      return res;
    },
    enabled: Boolean(context) && storyId !== null,
  });
}

export function useGenerateTestPlan() {
  const context = useApiContext();
  const qc = useQueryClient();
  const setTestPlanMd = usePhase4Store((s) => s.setTestPlanMd);
  return useMutation({
    mutationFn: (storyId: number) => generateTestPlan(context!, storyId),
    onSuccess: (data, storyId) => {
      setTestPlanMd(data.test_plan_md);
      void qc.invalidateQueries({ queryKey: ["phase4", "test-plan", context?.projectId, storyId] });
    },
    onError: (err: Error) => toast.error(`Test plan generation failed: ${err.message}`),
  });
}

export function useSaveTestPlan() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, testPlanMd }: { storyId: number; testPlanMd: string }) =>
      saveTestPlan(context!, storyId, testPlanMd),
    onSuccess: (_, { storyId }) => {
      toast.success("Test plan saved.");
      void qc.invalidateQueries({ queryKey: ["phase4", "test-plan", context?.projectId, storyId] });
      void qc.invalidateQueries({ queryKey: ["phase4", "eligible-stories"] });
      void qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });
}

export function useGenerateBugReport() {
  const context = useApiContext();
  const setBugReportDraft = usePhase4Store((s) => s.setBugReportDraft);
  return useMutation({
    mutationFn: (req: { storyId: number; failedScenarios: Phase4FailedScenario[] }) =>
      generateBugReport(context!, {
        story_id: req.storyId,
        failed_scenarios: req.failedScenarios,
      }),
    onSuccess: (data, req) => {
      const key = req.failedScenarios[0]?.scenario_name ?? "combined";
      setBugReportDraft(key, data.bug_report_md);
    },
    onError: (err: Error) => toast.error(`Bug report generation failed: ${err.message}`),
  });
}

export function usePassGate() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storyId: number) => passGate(context!, storyId),
    onSuccess: () => {
      toast.success("Testing Gate passed — story ready for production.");
      void qc.invalidateQueries({ queryKey: ["phase4", "eligible-stories"] });
      void qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
    onError: (err: Error) => toast.error(`Gate pass failed: ${err.message}`),
  });
}

export function useUpdatePmStoryStatus() {
  const context = useApiContext();
  return useMutation({
    mutationFn: async ({ pmStoryId, statusName }: { pmStoryId: string; statusName: string }) => {
      if (!context) throw new Error("No project context.");
      const adapter = getPmAdapter(context.pmTool);
      // Tool-aware ctx: Jira needs the project KEY, Taiga the numeric id —
      // pmProjectId holds the Taiga slug, which the Taiga REST API rejects.
      const pmCtx = toPmCtx(context);
      const statuses = await adapter.listStoryStatuses(pmCtx);
      const target = statuses.find((s) => s.name.toLowerCase().includes(statusName.toLowerCase()));
      if (!target) throw new Error(`Status "${statusName}" not found in PM board.`);
      const story = await adapter.getStory(pmCtx, pmStoryId);
      await adapter.updateStory(pmCtx, pmStoryId, story.version ?? 1, { status: target.id });
    },
    onSuccess: () => toast.success("PM story status updated."),
    onError: (err: Error) => toast.error(`PM update failed: ${err.message}`),
  });
}

export function useFailGate() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Phase4FailGateRequest) => failGate(context!, body),
    onSuccess: () => {
      toast.success("Bug report saved. Fix-Bolt artifact ready.");
      void qc.invalidateQueries({ queryKey: ["phase4", "eligible-stories"] });
      void qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
    },
    onError: (err: Error) => toast.error(`Fail gate save failed: ${err.message}`),
  });
}
