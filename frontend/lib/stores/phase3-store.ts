"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Phase3Task } from "@/lib/api/types";

type Phase3State = {
  selectedStoryId: number | null;
  taskList: Phase3Task[];
  pmTaskIds: Record<number, string>;      // taskIndex → PM task id (string for Jira compat)
  pmTaskRefs: Record<number, string | number>; // taskIndex → PM task ref
  tasksPushed: boolean;
  packDrafts: Record<number, string>;     // taskId → markdown string
  prevPackDrafts: Record<number, string>; // taskId → previous markdown (undo buffer, not persisted)
  lockedTaskIds: number[];
  currentStoryMeta: { title: string; epicTitle: string };
  pushedStoryIds: number[];               // persisted across story switches
  setSelectedStoryId: (id: number | null) => void;
  setTaskList: (tasks: Phase3Task[]) => void;
  hydrateTasks: (tasks: Phase3Task[]) => void;
  patchTask: (id: number, updates: Partial<Omit<Phase3Task, "id">>) => void;
  appendTask: (task: Phase3Task) => void;
  removePushedStoryId: (id: number) => void;
  setPmTaskResult: (taskIndex: number, id: string, ref: string | number) => void;
  setTasksPushed: (pushed: boolean) => void;
  setPackDraft: (taskId: number, md: string) => void;
  setPackDrafts: (drafts: Record<number, string>) => void;
  restorePackDraft: (taskId: number) => void;
  setLockedTaskIds: (ids: number[]) => void;
  setCurrentStoryMeta: (title: string, epicTitle: string) => void;
  clearPhase3Draft: () => void;
};

export const usePhase3Store = create<Phase3State>()(
  persist(
    (set) => ({
      selectedStoryId: null,
      taskList: [],
      pmTaskIds: {},
      pmTaskRefs: {},
      tasksPushed: false,
      packDrafts: {},
      prevPackDrafts: {},
      lockedTaskIds: [],
      currentStoryMeta: { title: "", epicTitle: "" },
      pushedStoryIds: [],
      setSelectedStoryId: (id) =>
        set((state) => {
          if (id === state.selectedStoryId) return {};
          return {
            selectedStoryId: id,
            taskList: [],
            pmTaskIds: {},
            pmTaskRefs: {},
            tasksPushed: id !== null && state.pushedStoryIds.includes(id),
            packDrafts: {},
            prevPackDrafts: {},
            lockedTaskIds: [],
            currentStoryMeta: { title: "", epicTitle: "" },
          };
        }),
      // Used when generating new tasks — resets push state
      setTaskList: (taskList) => set({ taskList, pmTaskIds: {}, pmTaskRefs: {}, tasksPushed: false }),
      // Patch a single task in-place without touching tasksPushed.
      // Clears the pack draft for the task if description or effort changes (pack is now stale).
      patchTask: (id, updates) =>
        set((s) => {
          const newTaskList = s.taskList.map((t) => (t.id === id ? { ...t, ...updates } : t));
          const orig = s.taskList.find((t) => t.id === id);
          const packStale =
            (updates.description !== undefined && updates.description !== orig?.description) ||
            (updates.effort_estimate !== undefined && updates.effort_estimate !== orig?.effort_estimate);
          if (packStale && s.packDrafts[id] !== undefined) {
            const { [id]: _dropped, ...remainingDrafts } = s.packDrafts;
            return { taskList: newTaskList, packDrafts: remainingDrafts };
          }
          return { taskList: newTaskList };
        }),
      // Append a new task without resetting push state
      appendTask: (task) => set((s) => ({ taskList: [...s.taskList, task] })),
      // Used when restoring from PM — only if store is empty
      hydrateTasks: (tasks) =>
        set((state) => {
          if (state.taskList.length !== 0) return {};
          const alreadyTracked =
            state.selectedStoryId !== null && state.pushedStoryIds.includes(state.selectedStoryId);
          return {
            taskList: tasks,
            tasksPushed: true,
            pushedStoryIds:
              alreadyTracked || state.selectedStoryId === null
                ? state.pushedStoryIds
                : [...state.pushedStoryIds, state.selectedStoryId],
          };
        }),
      removePushedStoryId: (id) =>
        set((s) => ({ pushedStoryIds: s.pushedStoryIds.filter((sid) => sid !== id) })),
      setPmTaskResult: (taskIndex, id, ref) =>
        set((s) => ({
          pmTaskIds: { ...s.pmTaskIds, [taskIndex]: id },
          pmTaskRefs: { ...s.pmTaskRefs, [taskIndex]: ref },
        })),
      setTasksPushed: (tasksPushed) =>
        set((s) => {
          if (!tasksPushed || s.selectedStoryId === null) return { tasksPushed };
          const already = s.pushedStoryIds.includes(s.selectedStoryId);
          return {
            tasksPushed,
            pushedStoryIds: already ? s.pushedStoryIds : [...s.pushedStoryIds, s.selectedStoryId],
          };
        }),
      setPackDraft: (taskId, md) =>
        set((s) => {
          const prev = s.packDrafts[taskId];
          return {
            packDrafts: { ...s.packDrafts, [taskId]: md },
            // only save to undo buffer when overwriting an existing non-empty pack
            ...(prev && prev !== md ? { prevPackDrafts: { ...s.prevPackDrafts, [taskId]: prev } } : {}),
          };
        }),
      setPackDrafts: (drafts) => set({ packDrafts: drafts }),
      restorePackDraft: (taskId) =>
        set((s) => {
          const prev = s.prevPackDrafts[taskId];
          if (!prev) return {};
          const { [taskId]: _removed, ...remainingPrev } = s.prevPackDrafts;
          return {
            packDrafts: { ...s.packDrafts, [taskId]: prev },
            prevPackDrafts: remainingPrev,
          };
        }),
      setLockedTaskIds: (lockedTaskIds) => set({ lockedTaskIds }),
      setCurrentStoryMeta: (title, epicTitle) => set({ currentStoryMeta: { title, epicTitle } }),
      clearPhase3Draft: () =>
        set((s) => ({
          selectedStoryId: null,
          taskList: [],
          pmTaskIds: {},
          pmTaskRefs: {},
          tasksPushed: false,
          packDrafts: {},
          prevPackDrafts: {},
          lockedTaskIds: [],
          currentStoryMeta: { title: "", epicTitle: "" },
          pushedStoryIds: s.selectedStoryId !== null
            ? s.pushedStoryIds.filter((id) => id !== s.selectedStoryId)
            : s.pushedStoryIds,
        })),
    }),
    {
      name: "apex-phase3-draft",
      partialize: (state) => ({
        selectedStoryId: state.selectedStoryId,
        taskList: state.taskList,
        packDrafts: state.packDrafts,
        tasksPushed: state.tasksPushed,
        currentStoryMeta: state.currentStoryMeta,
        pushedStoryIds: state.pushedStoryIds,
      }),
    },
  ),
);
