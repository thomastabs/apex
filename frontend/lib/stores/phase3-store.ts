"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Phase3Task } from "@/lib/api/types";

type Phase3State = {
  selectedStoryId: number | null;
  taskList: Phase3Task[];
  taigaTaskIds: Record<number, number>;   // taskIndex → taiga task id
  taigaTaskRefs: Record<number, number>;  // taskIndex → taiga task ref
  tasksPushed: boolean;
  packDrafts: Record<number, string>;     // taskId → markdown string
  lockedTaskIds: number[];
  currentStoryMeta: { title: string; epicTitle: string };
  pushedStoryIds: number[];               // persisted across story switches
  setSelectedStoryId: (id: number | null) => void;
  setTaskList: (tasks: Phase3Task[]) => void;
  hydrateTasks: (tasks: Phase3Task[]) => void;
  patchTask: (id: number, updates: Partial<Omit<Phase3Task, "id">>) => void;
  appendTask: (task: Phase3Task) => void;
  setTaigaTaskResult: (taskIndex: number, id: number, ref: number) => void;
  setTasksPushed: (pushed: boolean) => void;
  setPackDraft: (taskId: number, md: string) => void;
  setPackDrafts: (drafts: Record<number, string>) => void;
  setLockedTaskIds: (ids: number[]) => void;
  setCurrentStoryMeta: (title: string, epicTitle: string) => void;
  clearPhase3Draft: () => void;
};

export const usePhase3Store = create<Phase3State>()(
  persist(
    (set) => ({
      selectedStoryId: null,
      taskList: [],
      taigaTaskIds: {},
      taigaTaskRefs: {},
      tasksPushed: false,
      packDrafts: {},
      lockedTaskIds: [],
      currentStoryMeta: { title: "", epicTitle: "" },
      pushedStoryIds: [],
      setSelectedStoryId: (id) =>
        set((state) => {
          if (id === state.selectedStoryId) return {};
          return {
            selectedStoryId: id,
            taskList: [],
            taigaTaskIds: {},
            taigaTaskRefs: {},
            tasksPushed: id !== null && state.pushedStoryIds.includes(id),
            packDrafts: {},
            lockedTaskIds: [],
            currentStoryMeta: { title: "", epicTitle: "" },
          };
        }),
      // Used when generating new tasks — resets push state
      setTaskList: (taskList) => set({ taskList, taigaTaskIds: {}, taigaTaskRefs: {}, tasksPushed: false }),
      // Patch a single task in-place without touching tasksPushed
      patchTask: (id, updates) =>
        set((s) => ({ taskList: s.taskList.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
      // Append a new task without resetting push state
      appendTask: (task) => set((s) => ({ taskList: [...s.taskList, task] })),
      // Used when restoring from backend — marks story as pushed (tasks exist in backend = they were pushed)
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
      setTaigaTaskResult: (taskIndex, id, ref) =>
        set((s) => ({
          taigaTaskIds: { ...s.taigaTaskIds, [taskIndex]: id },
          taigaTaskRefs: { ...s.taigaTaskRefs, [taskIndex]: ref },
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
        set((s) => ({ packDrafts: { ...s.packDrafts, [taskId]: md } })),
      setPackDrafts: (drafts) => set({ packDrafts: drafts }),
      setLockedTaskIds: (lockedTaskIds) => set({ lockedTaskIds }),
      setCurrentStoryMeta: (title, epicTitle) => set({ currentStoryMeta: { title, epicTitle } }),
      clearPhase3Draft: () =>
        set((s) => ({
          selectedStoryId: null,
          taskList: [],
          taigaTaskIds: {},
          taigaTaskRefs: {},
          tasksPushed: false,
          packDrafts: {},
          lockedTaskIds: [],
          currentStoryMeta: { title: "", epicTitle: "" },
          // Remove locked story from pushedStoryIds
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
