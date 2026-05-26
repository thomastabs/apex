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
  setSelectedStoryId: (id: number | null) => void;
  setTaskList: (tasks: Phase3Task[]) => void;
  setTaigaTaskResult: (taskIndex: number, id: number, ref: number) => void;
  setTasksPushed: (pushed: boolean) => void;
  setPackDraft: (taskId: number, md: string) => void;
  setLockedTaskIds: (ids: number[]) => void;
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
      setSelectedStoryId: (selectedStoryId) =>
        set({ selectedStoryId, taskList: [], taigaTaskIds: {}, taigaTaskRefs: {}, tasksPushed: false, packDrafts: {}, lockedTaskIds: [] }),
      setTaskList: (taskList) => set({ taskList, taigaTaskIds: {}, taigaTaskRefs: {}, tasksPushed: false }),
      setTaigaTaskResult: (taskIndex, id, ref) =>
        set((s) => ({
          taigaTaskIds: { ...s.taigaTaskIds, [taskIndex]: id },
          taigaTaskRefs: { ...s.taigaTaskRefs, [taskIndex]: ref },
        })),
      setTasksPushed: (tasksPushed) => set({ tasksPushed }),
      setPackDraft: (taskId, md) =>
        set((s) => ({ packDrafts: { ...s.packDrafts, [taskId]: md } })),
      setLockedTaskIds: (lockedTaskIds) => set({ lockedTaskIds }),
      clearPhase3Draft: () =>
        set({
          selectedStoryId: null,
          taskList: [],
          taigaTaskIds: {},
          taigaTaskRefs: {},
          tasksPushed: false,
          packDrafts: {},
          lockedTaskIds: [],
        }),
    }),
    {
      name: "apex-phase3-draft",
      partialize: (state) => ({
        selectedStoryId: state.selectedStoryId,
        taskList: state.taskList,
        packDrafts: state.packDrafts,
      }),
    },
  ),
);
