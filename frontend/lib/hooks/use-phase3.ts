"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateProposal,
  generateTasks,
  getEligibleStories,
  getMissingTaskLists,
  getProposals,
  getStoryContext,
  getTaskBoard,
  getTaskList,
  lockStory,
  saveProposal,
  saveTaskList,
} from "@/lib/api/phase3";
import { getPmAdapter } from "@/lib/api/pm-factory";
import type { PmTask } from "@/lib/api/pm-types";
import type {
  EffortEstimate,
  Phase3GenerateProposalRequest,
  Phase3LockStoryRequest,
  Phase3SaveProposalRequest,
  Phase3Task,
} from "@/lib/api/types";

const EFFORT_POINTS: Record<EffortEstimate, number> = {
  XS: 1, S: 2, M: 3, L: 5, XL: 8,
};
import { usePhase3Store } from "@/lib/stores/phase3-store";
import { useApiContext } from "@/lib/stores/session-store";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Apex metadata encoding / decoding in PM task descriptions
// ---------------------------------------------------------------------------

const APEX_META_BLOCK_RE = /\n\n---\n\n(?:\*Apex —[^\n]*\*|[\s\S]*?\*\*Apex Metadata\*\*[\s\S]*?)(?:\n\n\[\/\/\]: # \(apex-meta:\{.*?\}\))?\s*$/s;

const EFFORT_LABELS: Record<string, string> = { XS: "XS (1 pt)", S: "S (2 pts)", M: "M (3 pts)", L: "L (5 pts)", XL: "XL (8 pts)" };
const EFFORT_FROM_LABEL: Record<string, string> = { "XS (1 pt)": "XS", "S (2 pts)": "S", "M (3 pts)": "M", "L (5 pts)": "L", "XL (8 pts)": "XL" };

export function reattachApexBlock(rawOrig: string, newDescription: string): string {
  const blockMatch = rawOrig.match(APEX_META_BLOCK_RE);
  if (!blockMatch) return newDescription.trim();
  return newDescription.trim() + blockMatch[0];
}

export function encodeApexMeta(task: Phase3Task): string {
  const base = task.description.trim();
  const effort = task.effort_estimate ?? "M";
  const covered = task.covered_scenarios ?? [];
  const deps = task.predecessor_task_ids ?? [];
  const lines: string[] = ["**Apex Metadata**"];
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
} {
  const legacyMatch = rawDescription.match(/\[\/\/\]: # \(apex-meta:(\{.*?\})\)\s*$/s);
  const blockMatch = rawDescription.match(APEX_META_BLOCK_RE);
  const description = blockMatch ? rawDescription.slice(0, rawDescription.length - blockMatch[0].length).trim() : rawDescription.trim();

  if (legacyMatch) {
    try {
      const meta = JSON.parse(legacyMatch[1]) as { effort?: string; covered_scenarios?: string[]; predecessor_task_ids?: number[] };
      return {
        description,
        effort_estimate: (meta.effort ?? "M") as EffortEstimate,
        covered_scenarios: meta.covered_scenarios ?? [],
        predecessor_task_ids: meta.predecessor_task_ids ?? [],
      };
    } catch { /* fall through */ }
  }

  if (!blockMatch) {
    return { description, effort_estimate: "M", covered_scenarios: [], predecessor_task_ids: [] };
  }

  const block = blockMatch[0];
  const effortRaw = block.match(/\*\*Effort:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "M";
  const effortParsed = EFFORT_FROM_LABEL[effortRaw] ?? effortRaw.split(" ")[0];
  const effort = (["XS","S","M","L","XL"].includes(effortParsed) ? effortParsed : "M") as EffortEstimate;
  const coversRaw = block.match(/\*\*Covers:\*\*\s*([^\n]+)/)?.[1]?.trim();
  const depsRaw = block.match(/\*\*Depends on tasks:\*\*\s*([\d, ]+)/)?.[1]?.trim();
  return {
    description,
    effort_estimate: effort,
    covered_scenarios: coversRaw ? coversRaw.split(" | ").map((s) => s.trim()).filter(Boolean) : [],
    predecessor_task_ids: depsRaw
      ? depsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : [],
  };
}

export function findPmTaskBySubject(
  cached: PmTask[], storyId: number, subject: string,
): PmTask | undefined {
  const key = subject.trim().toLowerCase();
  return cached.find((t) => Number(t.user_story) === storyId && t.subject.trim().toLowerCase() === key);
}

// Kept for backward compat with phase3-workflow.tsx imports
export { findPmTaskBySubject as findTaigaTaskBySubject };

function getAdapterCtx(context: NonNullable<ReturnType<typeof useApiContext>>) {
  return {
    token: context.taigaToken,
    baseUrl: context.taigaApiUrl ?? "",
    projectId: context.pmProjectId ?? String(context.projectId),
  };
}

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

  return useMutation({
    mutationFn: (storyId: number) => generateTasks(context!, storyId),
    onSuccess: (data) => {
      setTaskList(data.tasks);
      toast.success(`${data.tasks.length} tasks generated.`);
    },
    onError: () => toast.error("Task generation failed. Try again."),
  });
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
    onSuccess: ({ results, failures }, storyId) => {
      for (const { taskIndex, localTaskId, id, ref } of results) {
        setPmTaskResult(taskIndex, id, ref);
        patchTask(localTaskId, { pm_task_id: id });
      }
      setTasksPushed(true);
      const updatedList = usePhase3Store.getState().taskList;
      if (context && updatedList.length > 0) {
        void saveTaskList(context, storyId, updatedList).then(() => {
          void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["pm", "project-tasks"] });
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

export function useGenerateProposal() {
  const context = useApiContext();
  const { setPackDraft } = usePhase3Store();

  return useMutation({
    mutationFn: (body: Phase3GenerateProposalRequest) => generateProposal(context!, body),
    onSuccess: (data, variables) => {
      setPackDraft(variables.task_id, data.proposal_md);
    },
    onError: () => toast.error("Pack generation failed. Try again."),
  });
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
      void queryClient.invalidateQueries({ queryKey: ["phase3", "eligible-stories"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "story-index-stats"] });
      toast.success("Story locked as implementation-ready.");
    },
    onError: () => toast.error("Failed to lock story."),
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
  const { hydrateTasks, hydrateFromBackend } = usePhase3Store();
  const query = useQuery({
    queryKey: ["phase3", "task-list", context?.projectId, storyId],
    queryFn: () => getTaskList(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 0,
  });

  const jsonEmpty = query.isSuccess && (query.data?.tasks.length ?? 0) === 0;
  const pmFallbackQuery = useQuery({
    queryKey: ["pm", "project-tasks", context?.projectId],
    queryFn: () => getPmAdapter(context!.pmTool).getProjectTasks(getAdapterCtx(context!)),
    enabled: Boolean(context) && jsonEmpty && storyId !== null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!query.isSuccess) return;
    if (query.data?.tasks && query.data.tasks.length > 0) {
      hydrateFromBackend(query.data.tasks);
      return;
    }
    if (!storyId || !pmFallbackQuery.data) return;
    const storyTasks = pmFallbackQuery.data
      .filter((t) => Number(t.user_story) === storyId)
      .sort((a, b) => Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id)));
    if (storyTasks.length === 0) return;
    const reconstructed: Phase3Task[] = storyTasks.map((t, i) => {
      const decoded = decodeApexMeta(t.description || "");
      return {
        id: i + 1,
        subject: t.subject,
        description: decoded.description,
        effort_estimate: decoded.effort_estimate,
        covered_scenarios: decoded.covered_scenarios,
        predecessor_task_ids: decoded.predecessor_task_ids,
        pm_task_id: String(t.id),
      };
    });
    hydrateTasks(reconstructed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, pmFallbackQuery.data, storyId]);
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

export function useSaveTaskList() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, tasks }: { storyId: number; tasks: Phase3Task[] }) =>
      saveTaskList(context!, storyId, tasks),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
    },
    onError: () => toast.error("Failed to save task list. Changes may not persist."),
  });
}

export function useTaskBoard() {
  const context = useApiContext();
  return useQuery({
    queryKey: ["phase3", "task-board", context?.projectId],
    queryFn: async () => {
      const data = await getTaskBoard(context!);
      return data.stories;
    },
    enabled: Boolean(context),
    staleTime: 60_000,
  });
}

export function useSyncTaskLists() {
  const context = useApiContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!context) throw new Error("No project context.");
      const adapter = getPmAdapter(context.pmTool);
      const ctx = getAdapterCtx(context);
      const [{ story_ids: missingIds }, pmTasks] = await Promise.all([
        getMissingTaskLists(context),
        adapter.getProjectTasks(ctx),
      ]);
      if (missingIds.length === 0) return { saved: 0, skipped: 0 };

      const tasksByStory = new Map<number, PmTask[]>();
      for (const t of pmTasks) {
        const sid = Number(t.user_story);
        if (!tasksByStory.has(sid)) tasksByStory.set(sid, []);
        tasksByStory.get(sid)!.push(t);
      }

      let saved = 0;
      let skipped = 0;
      for (const storyId of missingIds) {
        const storyTasks = tasksByStory.get(storyId)?.sort((a, b) => Number(a.id) - Number(b.id));
        if (!storyTasks || storyTasks.length === 0) { skipped++; continue; }
        const tasks: Phase3Task[] = storyTasks.map((t, i) => {
          const decoded = decodeApexMeta(t.description || "");
          return {
            id: i + 1,
            subject: t.subject,
            description: decoded.description,
            effort_estimate: decoded.effort_estimate,
            covered_scenarios: decoded.covered_scenarios,
            predecessor_task_ids: decoded.predecessor_task_ids,
            pm_task_id: String(t.id),
          };
        });
        try {
          await saveTaskList(context, storyId, tasks);
          saved++;
        } catch {
          skipped++;
        }
      }
      return { saved, skipped };
    },
    onSuccess: ({ saved, skipped }) => {
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
      if (saved === 0 && skipped === 0) {
        toast.success("All task lists already synced.");
      } else {
        toast.success(`Synced ${saved} task list${saved !== 1 ? "s" : ""}.${skipped > 0 ? ` ${skipped} stories had no tasks.` : ""}`);
      }
    },
    onError: () => toast.error("Task list sync failed."),
  });
}

export async function fetchPmTaskFull(
  context: { taigaToken: string; taigaApiUrl?: string; pmTool?: "taiga" | "jira"; projectId: number },
  taskId: string,
): Promise<{ description: string; version: string | number }> {
  const adapter = getPmAdapter(context.pmTool);
  const ctx = { token: context.taigaToken, baseUrl: context.taigaApiUrl ?? "", projectId: String(context.projectId) };
  const raw = await adapter.getTask(ctx, taskId);
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
      void queryClient.invalidateQueries({ queryKey: ["pm", "project-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
      toast.success("Task added.");
    },
    onError: (err) => {
      const adapter = getPmAdapter(context?.pmTool);
      toast.error(adapter.errMsg(err, "Add task"));
    },
  });
}

export function usePushMetadataToTaiga() {
  const context = useApiContext();
  const queryClient = useQueryClient();
  const { taskList, patchTask } = usePhase3Store();

  return useMutation({
    mutationFn: async (storyId: number) => {
      if (!context) throw new Error("No context.");
      const adapter = getPmAdapter(context.pmTool);
      const ctx = getAdapterCtx(context);

      const cached = queryClient.getQueryData<PmTask[]>(["pm", "project-tasks", context.projectId]) ?? [];
      const resolved: Array<{ localId: number; pmTaskId: string }> = [];
      const targets = taskList.map((task) => {
        const pmId = task.pm_task_id ?? (task.taiga_task_id ? String(task.taiga_task_id) : undefined);
        if (pmId) return { ...task, pm_task_id: pmId };
        const match = findPmTaskBySubject(cached, storyId, task.subject);
        if (match) {
          resolved.push({ localId: task.id, pmTaskId: match.id });
          return { ...task, pm_task_id: match.id };
        }
        return task;
      }).filter((t) => t.pm_task_id);

      if (targets.length === 0) throw new Error("No tasks with PM IDs to update.");

      const withVersions = await Promise.all(
        targets.map(async (task) => {
          const current = await adapter.getTask(ctx, task.pm_task_id!);
          return { task, version: current.version };
        }),
      );

      let updated = 0;
      const errors: string[] = [];
      for (const { task, version: initialVersion } of withVersions) {
        try {
          let ver = initialVersion;
          for (let attempt = 0; attempt <= 1; attempt++) {
            try {
              await adapter.updateTask(ctx, task.pm_task_id!, ver, { description: encodeApexMeta(task) });
              break;
            } catch (err) {
              if (adapter.isPmVersionConflict(err) && attempt === 0) {
                const refreshed = await adapter.getTask(ctx, task.pm_task_id!);
                ver = refreshed.version;
              } else throw err;
            }
          }
          updated++;
        } catch (err) {
          errors.push(`Task ${task.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
      return { updated, errors, resolved };
    },
    onSuccess: ({ updated, errors, resolved }) => {
      for (const { localId, pmTaskId } of resolved) {
        patchTask(localId, { pm_task_id: pmTaskId });
      }
      if (errors.length > 0) {
        toast.warning(`Updated ${updated} tasks. ${errors.length} failed: ${errors.join("; ")}`);
      } else {
        toast.success(`Metadata pushed for ${updated} task${updated !== 1 ? "s" : ""}.`);
      }
    },
    onError: (err) => {
      const adapter = getPmAdapter(context?.pmTool);
      toast.error(adapter.errMsg(err, "Push metadata"));
    },
  });
}
