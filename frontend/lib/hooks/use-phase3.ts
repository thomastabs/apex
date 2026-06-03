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
import { taigaCreateTask, taigaGetProjectTasks } from "@/lib/api/taiga-direct";
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
  const { taskList, setTaigaTaskResult, setTasksPushed } = usePhase3Store();

  return useMutation({
    mutationFn: async (storyId: number) => {
      if (!context) throw new Error("No project context.");
      const results: Array<{ taskIndex: number; id: number; ref: number }> = [];
      const failures: Array<{ subject: string; error: string }> = [];
      for (let i = 0; i < taskList.length; i++) {
        const task = taskList[i];
        try {
          const created = await taigaCreateTask(
            context.taigaToken,
            context.projectId,
            storyId,
            task.subject,
            task.description,
            context.taigaApiUrl,
            task.effort_estimate ? EFFORT_POINTS[task.effort_estimate] : undefined,
          );
          results.push({ taskIndex: i, id: created.id, ref: created.ref });
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
      for (const { taskIndex, id, ref } of results) {
        setTaigaTaskResult(taskIndex, id, ref);
      }
      setTasksPushed(true);
      // Persist task list + refresh both board queries
      if (context && taskList.length > 0) {
        void saveTaskList(context, storyId, taskList).then(() => {
          void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["taiga", "project-tasks"] });
      if (failures.length > 0) {
        const names = failures.map((f) => f.subject).join(", ");
        toast.warning(`${results.length} tasks pushed; ${failures.length} failed: ${names}`);
      } else {
        toast.success(`${results.length} tasks pushed to Taiga.`);
      }
    },
    onError: () => toast.error("Failed to push tasks to Taiga. Check your connection and try again."),
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
  const { taskList, setTaskList } = usePhase3Store();

  const addTask = (task: Phase3Task) => setTaskList([...taskList, task]);

  const removeTask = (id: number) => setTaskList(taskList.filter((t) => t.id !== id));

  const updateTask = (id: number, updates: Partial<Omit<Phase3Task, "id">>) =>
    setTaskList(taskList.map((t) => (t.id === id ? { ...t, ...updates } : t)));

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
    queryKey: ["phase3", "task-list", context?.projectId, storyId],
    queryFn: () => getTaskList(context!, storyId!),
    enabled: Boolean(context) && storyId !== null,
    staleTime: 0,
  });

  // When JSON file is missing (tasks pushed before persistence was added), fall back to Taiga cache.
  // The sidebar already runs this query so it's a shared-cache hit, not an extra network call.
  const jsonEmpty = query.isSuccess && (query.data?.tasks.length ?? 0) === 0;
  const taigaFallbackQuery = useQuery({
    queryKey: ["taiga", "project-tasks", context?.projectId],
    queryFn: () => taigaGetProjectTasks(context!.taigaToken, context!.projectId, context!.taigaApiUrl),
    enabled: Boolean(context) && jsonEmpty && storyId !== null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!query.isSuccess) return;
    if (query.data?.tasks && query.data.tasks.length > 0) {
      hydrateTasks(query.data.tasks);
      return;
    }
    if (!storyId || !taigaFallbackQuery.data) return;
    const storyTasks = taigaFallbackQuery.data.filter((t) => t.user_story === storyId);
    if (storyTasks.length === 0) return;
    const reconstructed: Phase3Task[] = storyTasks.map((t, i) => ({
      id: i + 1,
      subject: t.subject,
      description: t.description || "",
      effort_estimate: "M" as const,
      covered_scenarios: [],
      predecessor_task_ids: [],
    }));
    hydrateTasks(reconstructed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, taigaFallbackQuery.data, storyId]);
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
    // proposals exist → tasks were definitely pushed to Taiga
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
      const [{ story_ids: missingIds }, taigaTasks] = await Promise.all([
        getMissingTaskLists(context),
        taigaGetProjectTasks(context.taigaToken, context.projectId, context.taigaApiUrl),
      ]);
      if (missingIds.length === 0) return { saved: 0, skipped: 0 };

      const tasksByStory = new Map<number, typeof taigaTasks>();
      for (const t of taigaTasks) {
        if (!tasksByStory.has(t.user_story)) tasksByStory.set(t.user_story, []);
        tasksByStory.get(t.user_story)!.push(t);
      }

      let saved = 0;
      let skipped = 0;
      for (const storyId of missingIds) {
        const storyTasks = tasksByStory.get(storyId);
        if (!storyTasks || storyTasks.length === 0) { skipped++; continue; }
        const tasks: Phase3Task[] = storyTasks.map((t, i) => ({
          id: i + 1,
          subject: t.subject,
          description: t.description || "",
          effort_estimate: "M" as const,
          covered_scenarios: [],
          predecessor_task_ids: [],
        }));
        await saveTaskList(context, storyId, tasks);
        saved++;
      }
      return { saved, skipped };
    },
    onSuccess: ({ saved, skipped }) => {
      void queryClient.invalidateQueries({ queryKey: ["phase3", "task-board"] });
      if (saved === 0 && skipped === 0) {
        toast.success("All task lists already synced.");
      } else {
        toast.success(`Synced ${saved} task list${saved !== 1 ? "s" : ""}.${skipped > 0 ? ` ${skipped} stories had no Taiga tasks.` : ""}`);
      }
    },
    onError: () => toast.error("Task list sync failed."),
  });
}
