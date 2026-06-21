"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateDeployPack,
  generateInfraDelta,
  getDeployPack,
  getEligibleStories,
  getInfraDelta,
  getQaResults,
  getStoryContext,
  passDeploymentGate,
  reviseDeployPack,
  saveDeployPack,
  saveInfraDelta,
  saveVerification,
} from "@/lib/api/phase5";
import { getProposals } from "@/lib/api/phase3";
import { useStoryTasks } from "@/lib/hooks/use-phase4";
import { useApiContext } from "@/lib/stores/session-store";
import { usePhase5Store } from "@/lib/stores/phase5-store";
import { useCancellableMutation } from "@/lib/hooks/use-cancellable-mutation";
import { toast } from "sonner";
import type {
  DeployPackOptions,
  InfraDelta,
  VerificationMatrixPayload,
  VerificationScenarioRow,
} from "@/lib/api/types";

export function useEligibleStories() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase5", "eligible-stories", context?.projectId],
    queryFn: () => getEligibleStories(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useStoryContext(storyId: number | null) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase5", "story-context", context?.projectId, storyId],
    queryFn: () => getStoryContext(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
  });
}

/** Loads a previously saved infra delta into the draft store (refresh-resume). */
export function useLoadInfraDelta(storyId: number | null, enabled: boolean) {
  const context = useApiContext();
  const setInfraDelta = usePhase5Store((s) => s.setInfraDelta);
  return useQuery({
    queryKey: ["phase5", "infra-delta", context?.projectId, storyId],
    queryFn: async () => {
      const res = await getInfraDelta(context!, storyId!);
      setInfraDelta(res.delta, true, true);
      return res;
    },
    enabled: Boolean(context) && storyId !== null && enabled,
    retry: false, // 422 when no delta saved yet — expected, not an error to retry
  });
}

export function useGenerateInfraDelta() {
  const context = useApiContext();
  const setInfraDelta = usePhase5Store((s) => s.setInfraDelta);
  return useCancellableMutation(
    (storyId: number, signal) => generateInfraDelta(context!, storyId, signal),
    {
      onSuccess: (data) => setInfraDelta(data.delta, false, true),
      onError: (err: Error) => toast.error(`Infra delta check failed: ${err.message}`),
    },
  );
}

export function useSaveInfraDelta() {
  const context = useApiContext();
  const qc = useQueryClient();
  const setDeltaSaved = usePhase5Store((s) => s.setDeltaSaved);
  return useMutation({
    mutationFn: ({ storyId, delta }: { storyId: number; delta: InfraDelta }) =>
      saveInfraDelta(context!, storyId, delta),
    onSuccess: (_, { storyId }) => {
      toast.success("Infra delta saved.");
      setDeltaSaved(true);
      void qc.invalidateQueries({ queryKey: ["phase5", "infra-delta", context?.projectId, storyId] });
      void qc.invalidateQueries({ queryKey: ["phase5", "eligible-stories", context?.projectId] });
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });
}

/** Loads a previously saved deploy pack into the draft store (refresh-resume). */
export function useLoadDeployPack(storyId: number | null, enabled: boolean) {
  const context = useApiContext();
  const setDeployPackMd = usePhase5Store((s) => s.setDeployPackMd);
  return useQuery({
    queryKey: ["phase5", "deploy-pack", context?.projectId, storyId],
    queryFn: async () => {
      const res = await getDeployPack(context!, storyId!);
      if (res.deploy_pack_md) setDeployPackMd(res.deploy_pack_md, true);
      return res;
    },
    enabled: Boolean(context) && storyId !== null && enabled,
  });
}

export function useGenerateDeployPack() {
  const context = useApiContext();
  // Result committed by the caller (phase5-workflow) so a regenerate-over-existing
  // pack can be routed through the diff gate first.
  return useCancellableMutation(
    ({ storyId, options }: { storyId: number; options?: DeployPackOptions }, signal) =>
      generateDeployPack(context!, storyId, options, signal),
    {
      onError: (err: Error) => toast.error(`Deploy pack generation failed: ${err.message}`),
    },
  );
}

export function useSaveDeployPack() {
  const context = useApiContext();
  const qc = useQueryClient();
  const setPackSaved = usePhase5Store((s) => s.setPackSaved);
  return useMutation({
    mutationFn: ({ storyId, deployPackMd }: { storyId: number; deployPackMd: string }) =>
      saveDeployPack(context!, storyId, deployPackMd),
    onSuccess: (_, { storyId }) => {
      toast.success("Deploy pack saved.");
      setPackSaved(true);
      void qc.invalidateQueries({ queryKey: ["phase5", "deploy-pack", context?.projectId, storyId] });
      void qc.invalidateQueries({ queryKey: ["phase5", "eligible-stories", context?.projectId] });
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });
}

export function useReviseDeployPack() {
  const context = useApiContext();
  // Result committed by the caller (phase5-workflow) so the revision can be
  // routed through the diff gate before it replaces the current pack.
  return useCancellableMutation(
    ({ storyId, deployPackMd, feedback }: {
      storyId: number;
      deployPackMd: string;
      feedback: string;
    }, signal) => reviseDeployPack(context!, storyId, deployPackMd, feedback, signal),
    {
      onError: (err: Error) => toast.error(`Revision failed: ${err.message}`),
    },
  );
}

/** Gherkin scenario titles — NOT phase4's parseScenarioNames, which parses
 *  test-plan `## Scenario:` headings instead of the gherkin itself. */
export function parseGherkinScenarioTitles(gherkin: string): string[] {
  const names: string[] = [];
  for (const m of gherkin.matchAll(/^\s*Scenario(?:\s+Outline)?:\s*(.+)$/gm)) {
    names.push(m[1].trim());
  }
  return [...new Set(names)];
}

const norm = (s: string) => s.trim().toLowerCase();

export type TraceabilityTaskInput = {
  id: number;
  covered_scenarios?: string[];
};

/**
 * Traceability matrix — pure assembly of existing artifacts, zero AI calls:
 * gherkin scenario titles × PM task "Covers" lines × saved developer packs ×
 * persisted QA results. Scenario names come from three independently
 * AI-generated sources, so the join is normalized and mismatches surface as
 * gaps rather than errors.
 */
export function buildTraceabilityMatrix(
  gherkin: string,
  tasks: TraceabilityTaskInput[],
  packTaskIds: Set<number>,
  qaAttempts: Array<{ results: Array<{ scenario: string; result: "pass" | "fail" }> }>,
): VerificationMatrixPayload | null {
  const scenarioTitles = parseGherkinScenarioTitles(gherkin);
  if (scenarioTitles.length === 0) return null;

  // Latest QA verdict per scenario (attempts are chronological)
  const qaByScenario = new Map<string, "pass" | "fail">();
  for (const attempt of qaAttempts) {
    for (const r of attempt.results) qaByScenario.set(norm(r.scenario), r.result);
  }

  const knownScenarios = new Set(scenarioTitles.map(norm));
  const rows: VerificationScenarioRow[] = scenarioTitles.map((title) => {
    const covering = tasks.filter((t) =>
      (t.covered_scenarios ?? []).some((c) => norm(c) === norm(title)),
    );
    const taskIds = covering.map((t) => t.id);
    const withPack = taskIds.filter((id) => packTaskIds.has(id));
    const qaResult = qaByScenario.get(norm(title)) ?? "untested";
    const gaps: string[] = [];
    if (taskIds.length === 0) gaps.push("NO_COVERING_TASK");
    if (taskIds.length > 0 && withPack.length < taskIds.length) gaps.push("TASK_WITHOUT_PACK");
    if (qaResult === "untested") gaps.push("NOT_TESTED");
    return { scenario: title, tasks: taskIds, tasks_with_pack: withPack, qa_result: qaResult, gaps };
  });

  // Covers-lines pointing at no gherkin scenario — surfaces task/spec drift
  const orphans = new Set<string>();
  for (const t of tasks) {
    for (const c of t.covered_scenarios ?? []) {
      if (!knownScenarios.has(norm(c))) orphans.add(c.trim());
    }
  }
  for (const o of orphans) {
    rows.push({ scenario: `${o} (task covers — not in gherkin)`, tasks: [], tasks_with_pack: [], qa_result: "untested", gaps: ["ORPHAN_COVERS"] });
  }

  const real = rows.filter((r) => !r.gaps.includes("ORPHAN_COVERS"));
  const summary = {
    total: real.length,
    covered: real.filter((r) => r.tasks.length > 0).length,
    with_pack: real.filter((r) => r.tasks.length > 0 && r.tasks_with_pack.length === r.tasks.length).length,
    tested: real.filter((r) => r.qa_result !== "untested").length,
    gap_count: rows.reduce((n, r) => n + r.gaps.length, 0),
  };
  return { scenarios: rows, summary, complete: summary.gap_count === 0 };
}

export function useTraceabilityMatrix(storyId: number | null) {
  const context = useApiContext();
  const { data: storyCtx } = useStoryContext(storyId);
  const { tasks, isLoading: tasksLoading } = useStoryTasks(storyId);

  const proposalsQuery = useQuery({
    queryKey: ["phase3", "proposals", context?.projectId, storyId],
    queryFn: () => getProposals(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
  });

  const qaQuery = useQuery({
    queryKey: ["phase5", "qa-results", context?.projectId, storyId],
    queryFn: () => getQaResults(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
  });

  const matrix: VerificationMatrixPayload | null = useMemo(() => {
    if (!storyCtx) return null;
    return buildTraceabilityMatrix(
      storyCtx.gherkin,
      tasks,
      new Set((proposalsQuery.data?.proposals ?? []).map((p) => p.task_id)),
      qaQuery.data?.qa_results?.attempts ?? [],
    );
  }, [storyCtx, tasks, proposalsQuery.data, qaQuery.data]);

  return {
    matrix,
    isLoading: !storyCtx || tasksLoading || proposalsQuery.isLoading || qaQuery.isLoading,
  };
}

export function useSaveVerification() {
  const context = useApiContext();
  return useMutation({
    mutationFn: ({ storyId, matrix }: { storyId: number; matrix: VerificationMatrixPayload }) =>
      saveVerification(context!, storyId, matrix),
    // Silent on success — auto-saved as gate evidence; failure is advisory only.
    onError: (err: Error) => toast.error(`Verification save failed: ${err.message}`),
  });
}

export function usePassDeploymentGate() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, techLeadApproved, devopsApproved, notes }: {
      storyId: number;
      techLeadApproved: boolean;
      devopsApproved: boolean;
      notes?: string;
    }) => passDeploymentGate(context!, storyId, { techLeadApproved, devopsApproved, notes }),
    onSuccess: () => {
      toast.success("Deployment Gate passed — story deployed.");
      void qc.invalidateQueries({ queryKey: ["phase5", "eligible-stories", context?.projectId] });
      void qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
    onError: (err: Error) => toast.error(`Gate failed: ${err.message}`),
  });
}
