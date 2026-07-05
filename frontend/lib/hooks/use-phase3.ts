"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateProposal,
  generateTasks,
  getEligibleStories,
  getProposals,
  getStoryContext,
  crossCheckTasks,
  lockStory,
  saveProposal,
  scanDesignConflicts,
} from "@/lib/api/phase3";
import { getPmAdapter } from "@/lib/api/pm-factory";
import { toPmCtx } from "@/lib/api/workspace";
import type { PmTask } from "@/lib/api/pm-types";
import type {
  EffortEstimate,
  Phase3GenerateProposalRequest,
  Phase3LockStoryRequest,
  Phase3SaveProposalRequest,
  Phase3Task,
  RequestContext,
} from "@/lib/api/types";

const EFFORT_POINTS: Record<EffortEstimate, number> = {
  XS: 1, S: 2, M: 3, L: 5, XL: 8,
};
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useApiContext, useFigmaContext } from "@/lib/stores/session-store";
import { useCancellableMutation } from "@/lib/hooks/use-cancellable-mutation";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Apex metadata encoding / decoding in PM task descriptions
// ---------------------------------------------------------------------------

// The marker heading must follow the --- immediately: matching any "---"
// that is *eventually* followed by the heading swallows user content that
// legitimately contains a markdown horizontal rule.
const APEX_META_BLOCK_RE = /\n\n---\n\n(?:\*Apex —[^\n]*\*|\*\*Apex Metadata\*\*[\s\S]*?)(?:\n\n\[\/\/\]: # \(apex-meta:\{.*?\}\))?\s*$/;

const EFFORT_LABELS: Record<string, string> = { XS: "XS (1 pt)", S: "S (2 pts)", M: "M (3 pts)", L: "L (5 pts)", XL: "XL (8 pts)" };
const EFFORT_FROM_LABEL: Record<string, string> = { "XS (1 pt)": "XS", "S (2 pts)": "S", "M (3 pts)": "M", "L (5 pts)": "L", "XL (8 pts)": "XL" };

// Taiga (and most PM backends) round-trip descriptions with CRLF line endings.
// The apex-meta regexes are written against "\n", so normalize first — otherwise
// the block fails to match and effort/covers/deps silently reset to defaults.
function normalizeEol(text: string): string {
  return (text ?? "").replace(/\r\n?/g, "\n");
}

export function reattachApexBlock(rawOrig: string, newDescription: string): string {
  const blockMatch = normalizeEol(rawOrig).match(APEX_META_BLOCK_RE);
  if (!blockMatch) return newDescription.trim();
  return newDescription.trim() + blockMatch[0];
}

export function encodeApexMeta(task: Phase3Task): string {
  const base = task.description.trim();
  const effort = task.effort_estimate ?? "M";
  const covered = task.covered_scenarios ?? [];
  const deps = task.predecessor_task_ids ?? [];
  const lines: string[] = ["**Apex Metadata**"];
  // Persist the local id so predecessor_task_ids stay valid after a
  // round-trip through the PM tool — positional reassignment breaks the
  // DAG as soon as a task is deleted or reordered in the PM.
  lines.push(`- **Apex task id:** ${task.id}`);
  lines.push(`- **Effort:** ${EFFORT_LABELS[effort] ?? effort}`);
  if (covered.length) lines.push(`- **Covers:** ${covered.join(" | ")}`);
  if (deps.length) lines.push(`- **Depends on tasks:** ${deps.join(", ")}`);
  return `${base}\n\n---\n\n${lines.join("\n")}`;
}

export function decodeApexMeta(rawDescription: string): {
  description: string;
  effort_estimate: EffortEstimate;
  covered_scenarios: string[];
  predecessor_task_ids: number[];
  apex_task_id: number | null;
} {
  const raw = normalizeEol(rawDescription);
  const legacyMatch = raw.match(/\[\/\/\]: # \(apex-meta:(\{.*?\})\)\s*$/s);
  const blockMatch = raw.match(APEX_META_BLOCK_RE);
  const description = blockMatch ? raw.slice(0, raw.length - blockMatch[0].length).trim() : raw.trim();

  if (legacyMatch) {
    try {
      const meta = JSON.parse(legacyMatch[1]) as { effort?: string; covered_scenarios?: string[]; predecessor_task_ids?: number[] };
      return {
        description,
        effort_estimate: (meta.effort ?? "M") as EffortEstimate,
        covered_scenarios: meta.covered_scenarios ?? [],
        predecessor_task_ids: meta.predecessor_task_ids ?? [],
        apex_task_id: null,
      };
    } catch { /* fall through */ }
  }

  if (!blockMatch) {
    return { description, effort_estimate: "M", covered_scenarios: [], predecessor_task_ids: [], apex_task_id: null };
  }

  const block = blockMatch[0];
  const effortRaw = block.match(/\*\*Effort:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "M";
  const effortParsed = EFFORT_FROM_LABEL[effortRaw] ?? effortRaw.split(" ")[0];
  const effort = (["XS","S","M","L","XL"].includes(effortParsed) ? effortParsed : "M") as EffortEstimate;
  const coversRaw = block.match(/\*\*Covers:\*\*\s*([^\n]+)/)?.[1]?.trim();
  const depsRaw = block.match(/\*\*Depends on tasks:\*\*\s*([\d, ]+)/)?.[1]?.trim();
  const idRaw = block.match(/\*\*Apex task id:\*\*\s*(\d+)/)?.[1];
  return {
    description,
    effort_estimate: effort,
    covered_scenarios: coversRaw ? coversRaw.split(" | ").map((s) => s.trim()).filter(Boolean) : [],
    predecessor_task_ids: depsRaw
      ? depsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : [],
    apex_task_id: idRaw ? parseInt(idRaw, 10) : null,
  };
}

// Web URL for a pushed task in the PM tool's UI (Taiga only — Jira subtasks
// have no stable standalone URL here). Mirrors the phase-1 story-URL builder.
export function pmTaskWebUrl(
  context: RequestContext | null,
  ref: string | number | undefined,
  pmWebUrl?: string,
): string | null {
  if (!context || ref === undefined || ref === null) return null;
  const projectId = context.pmProjectId;
  if (!projectId) return null;
  if (context.pmTool === "taiga") {
    const webBase = (context.taigaApiUrl ?? "")
      .replace("/api/v1", "")
      .replace("//api.taiga.io", "//tree.taiga.io")
      .replace(/\/+$/, "");
    if (!webBase) return null;
    return `${webBase}/project/${projectId}/task/${ref}`;
  }
  if (context.pmTool === "jira") {
    // pmProjectId is the Jira project KEY; the task ref is the numeric tail of
    // the issue key, so the browse URL is {base}/browse/{KEY}-{ref}.
    const base = (pmWebUrl ?? "").replace(/\/+$/, "");
    if (!base) return null;
    return `${base}/browse/${projectId}-${ref}`;
  }
  return null;
}

export function findPmTaskBySubject(
  cached: PmTask[], storyId: number, subject: string,
): PmTask | undefined {
  const key = subject.trim().toLowerCase();
  return cached.find((t) => Number(t.user_story) === storyId && t.subject.trim().toLowerCase() === key);
}

// Kept for backward compat with phase3-workflow.tsx imports
export { findPmTaskBySubject as findTaigaTaskBySubject };

// Tool-aware: Jira needs the project KEY (pmProjectId); Taiga needs the numeric
// id — pmProjectId holds the slug there, which Taiga's REST API rejects (NaN).
const getAdapterCtx = toPmCtx;

// ---------------------------------------------------------------------------

export function useEligibleStories() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase3", "eligible-stories", context?.projectId],
    queryFn: () => getEligibleStories(context!),
    enabled: Boolean(context),
    staleTime: 30_000,
  });
}

export function useStoryContext(storyId: number | null) {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase3", "story-context", context?.projectId, storyId],
    queryFn: () => getStoryContext(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 60_000,
  });
}

export function useGenerateTasks() {
  const context = useApiContext();
  const { setTaskList } = usePhase3Store();

  return useCancellableMutation(
    ({ storyId, instructions = "" }: { storyId: number; instructions?: string }, signal) =>
      generateTasks(context!, storyId, instructions, signal),
    {
      onSuccess: (data) => {
        setTaskList(data.tasks);
        toast.success(`${data.tasks.length} tasks generated.`);
      },
      onError: () => toast.error("Task generation failed. Try again."),
    },
  );
}

export function usePushTasksToTaiga() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const { taskList, setPmTaskResult, setTasksPushed, patchTask } = usePhase3Store();

  return useMutation({
    mutationFn: async (storyId: number) => {
      if (!context) throw new Error("No project context.");
      const adapter = getPmAdapter(context.pmTool);
      const ctx = getAdapterCtx(context);
      const results: Array<{ taskIndex: number; localTaskId: number; id: string; ref: string | number }> = [];
      const failures: Array<{ subject: string; error: string }> = [];
      for (let i = 0; i < taskList.length; i++) {
        const task = taskList[i];
        try {
          const created = await adapter.createTask(
            ctx,
            String(storyId),
            task.subject,
            encodeApexMeta(task),
            task.effort_estimate ? EFFORT_POINTS[task.effort_estimate] : undefined,
          );
          results.push({ taskIndex: i, localTaskId: task.id, id: created.id, ref: created.ref });
        } catch (err) {
          failures.push({ subject: task.subject, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }
      if (results.length === 0) {
        throw new Error(`All task pushes failed. First error: ${failures[0]?.error ?? "unknown"}`);
      }
      return { results, failures };
    },
    onSuccess: ({ results, failures }) => {
      for (const { taskIndex, localTaskId, id, ref } of results) {
        setPmTaskResult(taskIndex, id, ref);
        patchTask(localTaskId, { pm_task_id: id, pm_task_ref: ref });
      }
      setTasksPushed(true);
      void queryClient.invalidateQueries({ queryKey: ["pm", "project-tasks", context?.projectId] });
      if (failures.length > 0) {
        const names = failures.map((f) => f.subject).join(", ");
        toast.warning(`${results.length} tasks pushed; ${failures.length} failed: ${names}`);
      } else {
        toast.success(`${results.length} tasks pushed.`);
      }
    },
    onError: () => toast.error("Failed to push tasks. Check your connection and try again."),
  });
}

export function useScanDesignConflicts() {
  const context = useApiContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => scanDesignConflicts(context!),
    onSuccess: () => {
      // Refresh board/analytics flags (the scan set/cleared design_conflict).
      void qc.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
    },
  });
}

export function useCrossCheckTasks() {
  const context = useApiContext();
  return useCancellableMutation(
    ({ storyId, altModel = "" }: { storyId: number; altModel?: string }, signal) =>
      crossCheckTasks(context!, storyId, altModel, signal),
    { onError: (e: Error) => toast.error(`Cross-check failed: ${e.message}`) },
  );
}

export function useGenerateProposal() {
  const context = useApiContext();
  const figma = useFigmaContext();

  // NOTE: the result is committed by the caller (phase3-workflow handleGenerate)
  // so a regenerate-over-existing pack can be routed through the diff gate first.
  return useCancellableMutation(
    (body: Phase3GenerateProposalRequest, signal) => generateProposal(context!, body, signal, figma?.token),
    {
      onError: () => toast.error("Pack generation failed. Try again."),
    },
  );
}

export function useSaveProposal() {
  const context = useApiContext();

  return useMutation({
    mutationFn: (body: Phase3SaveProposalRequest) => saveProposal(context!, body),
    onError: () => toast.error("Failed to save proposal."),
  });
}

export function useLockStory() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Phase3LockStoryRequest) => lockStory(context!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase3", "eligible-stories", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats", context?.projectId] });
      toast.success("Story locked as implementation-ready.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to lock story."),
  });
}

export function useUpdateTaskList() {
  const { taskList, setTaskList, patchTask } = usePhase3Store();

  const addTask = (task: Phase3Task) => setTaskList([...taskList, task]);
  const removeTask = (id: number) => setTaskList(taskList.filter((t) => t.id !== id));
  const updateTask = (id: number, updates: Partial<Omit<Phase3Task, "id">>) => patchTask(id, updates);

  const reorderTasks = (from: number, to: number) => {
    const next = [...taskList];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setTaskList(next);
  };

  return { addTask, removeTask, updateTask, reorderTasks };
}

export function useLoadTaskList(storyId: number | null) {
  const context = useApiContext();
  const { hydrateTasks } = usePhase3Store();
  const query = useQuery({
    queryKey: ["pm", "project-tasks", context?.projectId],
    queryFn: () => getPmAdapter(context!.pmTool).getProjectTasks(getAdapterCtx(context!)),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!query.data || storyId === null || !context) return;
    const storyTasks = query.data
      .filter((t) => Number(t.user_story) === storyId)
      .sort((a, b) => Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id)));
    if (storyTasks.length === 0) return;

    let cancelled = false;
    (async () => {
      const adapter = getPmAdapter(context.pmTool);
      const ctx = getAdapterCtx(context);
      // The task LIST endpoint returns a description without the apex-meta block,
      // so effort/scenarios/deps would decode to defaults (all "M", no covers).
      // Fetch each task's full description from the detail endpoint before
      // decoding — same source the sidebar editor uses. Falls back to the list
      // description if a detail fetch fails.
      const detailed = await Promise.all(
        storyTasks.map(async (t) => {
          try {
            const full = await adapter.getTask(ctx, String(t.id));
            return { ...t, description: full.description };
          } catch {
            return t;
          }
        }),
      );
      if (cancelled) return;
      // Prefer the encoded Apex task id — predecessor_task_ids reference it, so
      // positional ids would corrupt the DAG after a deletion/reorder in the PM.
      // Fall back to position for legacy tasks (and on duplicates).
      const seenIds = new Set<number>();
      const reconstructed: Phase3Task[] = detailed.map((t, i) => {
        const decoded = decodeApexMeta(t.description || "");
        let id = decoded.apex_task_id ?? i + 1;
        while (seenIds.has(id)) id = Math.max(...seenIds) + 1;
        seenIds.add(id);
        return {
          id,
          subject: t.subject,
          description: decoded.description,
          effort_estimate: decoded.effort_estimate,
          covered_scenarios: decoded.covered_scenarios,
          predecessor_task_ids: decoded.predecessor_task_ids,
          pm_task_id: String(t.id),
          pm_task_ref: t.ref,
        };
      });
      hydrateTasks(reconstructed);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, storyId]);
  return query;
}

export function useLoadProposals(storyId: number | null) {
  const context = useApiContext();
  const { setPackDrafts, setTasksPushed, packDrafts } = usePhase3Store();
  const query = useQuery({
    queryKey: ["phase3", "proposals", context?.projectId, storyId],
    queryFn: () => getProposals(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 0,
  });
  useEffect(() => {
    if (!query.data?.proposals?.length) return;
    const hasAny = Object.keys(packDrafts).length > 0;
    if (hasAny) return;
    const restored: Record<number, string> = {};
    for (const { task_id, proposal_md } of query.data.proposals) {
      restored[task_id] = proposal_md;
    }
    setPackDrafts(restored);
    setTasksPushed(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);
  return query;
}

export function useTaskBoard() {
  const context = useApiContext();
  const { data: pmTasks = [] } = useQuery({
    queryKey: ["pm", "project-tasks", context?.projectId],
    queryFn: () => getPmAdapter(context!.pmTool).getProjectTasks(getAdapterCtx(context!)),
    enabled: Boolean(context),
    staleTime: 60_000,
  });
  const stories = useMemo(() => {
    const groups = new Map<number, { story_id: number; title: string; tasks: Array<{ id: number; subject: string; effort_estimate: string }> }>();
    for (const t of pmTasks) {
      const sid = Number(t.user_story);
      if (!groups.has(sid)) {
        groups.set(sid, { story_id: sid, title: t.user_story_subject ?? "", tasks: [] });
      }
      const decoded = decodeApexMeta(t.description || "");
      groups.get(sid)!.tasks.push({ id: Number(t.id), subject: t.subject, effort_estimate: decoded.effort_estimate });
    }
    return Array.from(groups.values()).sort((a, b) => a.story_id - b.story_id);
  }, [pmTasks]);
  return { data: stories };
}

export async function fetchPmTaskFull(
  context: RequestContext,
  taskId: string,
): Promise<{ description: string; version: string | number }> {
  const adapter = getPmAdapter(context.pmTool);
  const raw = await adapter.getTask(toPmCtx(context), taskId);
  const { description } = decodeApexMeta(raw.description);
  return { description, version: raw.version };
}

// Backward compat alias — phase3-workflow.tsx still imports this name
export const fetchTaigaTaskFull = fetchPmTaskFull;

export function useUpdateTaskInTaiga() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pmTaskId, task }: { pmTaskId: string; task: Phase3Task }) => {
      if (!context) throw new Error("No context.");
      const adapter = getPmAdapter(context.pmTool);
      const ctx = getAdapterCtx(context);
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const { version } = await fetchPmTaskFull(context, pmTaskId);
          await adapter.updateTask(ctx, pmTaskId, version, { subject: task.subject, description: encodeApexMeta(task) });
          return;
        } catch (err) {
          if (adapter.isPmVersionConflict(err) && attempt === 0) continue;
          throw err;
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pm", "project-tasks", context?.projectId] });
      toast.success("Task saved.");
    },
    onError: (err) => {
      const adapter = getPmAdapter(context?.pmTool);
      toast.error(adapter.errMsg(err, "Save task"));
    },
  });
}

export function usePushSingleTask() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const { appendTask } = usePhase3Store();

  return useMutation({
    mutationFn: async ({ storyId, task }: { storyId: number; task: Phase3Task }) => {
      if (!context) throw new Error("No context.");
      const adapter = getPmAdapter(context.pmTool);
      const ctx = getAdapterCtx(context);
      const fresh = await queryClient.fetchQuery({
        queryKey: ["pm", "project-tasks", context.projectId],
        queryFn: () => adapter.getProjectTasks(ctx),
        staleTime: 0,
      });
      const dupe = findPmTaskBySubject(fresh, storyId, task.subject);
      if (dupe) throw new Error(`"${task.subject}" already exists (#${dupe.ref})`);
      const created = await adapter.createTask(
        ctx, String(storyId), task.subject, encodeApexMeta(task),
        task.effort_estimate ? EFFORT_POINTS[task.effort_estimate] : undefined,
      );
      return { pmTaskId: created.id };
    },
    onSuccess: ({ pmTaskId }, { task }) => {
      appendTask({ ...task, pm_task_id: pmTaskId });
      void queryClient.invalidateQueries({ queryKey: ["pm", "project-tasks", context?.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
      toast.success("Task added.");
    },
    onError: (err) => {
      const adapter = getPmAdapter(context?.pmTool);
      toast.error(adapter.errMsg(err, "Add task"));
    },
  });
}

