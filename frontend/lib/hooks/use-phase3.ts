"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateProposal,
  generateTasks,
  getEligibleStories,
  getStoryContext,
  lockStory,
  saveProposal,
} from "@/lib/api/phase3";
import { taigaCreateTask } from "@/lib/api/taiga-direct";
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
    onSuccess: ({ results, failures }) => {
      for (const { taskIndex, id, ref } of results) {
        setTaigaTaskResult(taskIndex, id, ref);
      }
      setTasksPushed(true);
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
