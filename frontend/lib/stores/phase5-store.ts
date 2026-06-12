"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InfraDelta } from "@/lib/api/types";

type Phase5State = {
  selectedStoryId: number | null;
  currentStoryMeta: { title: string; epicTitle: string };
  infraDelta: InfraDelta | null;
  deltaSaved: boolean;
  deployPackMd: string | null;
  packSaved: boolean;
  techLeadApproved: boolean;
  devopsApproved: boolean;
  rejectionFeedback: string;

  setSelectedStoryId: (id: number | null) => void;
  setCurrentStoryMeta: (title: string, epicTitle: string) => void;
  setInfraDelta: (delta: InfraDelta | null, saved?: boolean) => void;
  setDeltaSaved: (saved: boolean) => void;
  setDeployPackMd: (md: string | null, saved?: boolean) => void;
  setPackSaved: (saved: boolean) => void;
  setSignOffs: (techLead: boolean, devops: boolean) => void;
  setRejectionFeedback: (feedback: string) => void;
  clearPhase5Draft: () => void;
};

const EMPTY_DRAFT = {
  selectedStoryId: null as number | null,
  currentStoryMeta: { title: "", epicTitle: "" },
  infraDelta: null as InfraDelta | null,
  deltaSaved: false,
  deployPackMd: null as string | null,
  packSaved: false,
  techLeadApproved: false,
  devopsApproved: false,
  rejectionFeedback: "",
};

export const usePhase5Store = create<Phase5State>()(
  persist(
    (set) => ({
      ...EMPTY_DRAFT,

      setSelectedStoryId: (id) =>
        set((state) => {
          if (id === state.selectedStoryId) return {};
          return { ...EMPTY_DRAFT, selectedStoryId: id };
        }),

      setCurrentStoryMeta: (title, epicTitle) =>
        set({ currentStoryMeta: { title, epicTitle } }),

      setInfraDelta: (infraDelta, saved = false) =>
        set({ infraDelta, deltaSaved: saved }),

      setDeltaSaved: (deltaSaved) => set({ deltaSaved }),

      setDeployPackMd: (deployPackMd, saved = false) =>
        set({ deployPackMd, packSaved: saved }),

      setPackSaved: (packSaved) => set({ packSaved }),

      setSignOffs: (techLeadApproved, devopsApproved) =>
        set({ techLeadApproved, devopsApproved }),

      setRejectionFeedback: (rejectionFeedback) => set({ rejectionFeedback }),

      clearPhase5Draft: () => set({ ...EMPTY_DRAFT }),
    }),
    {
      name: "apex-phase5-draft",
      partialize: (state) => ({
        selectedStoryId: state.selectedStoryId,
        currentStoryMeta: state.currentStoryMeta,
        infraDelta: state.infraDelta,
        deltaSaved: state.deltaSaved,
        deployPackMd: state.deployPackMd,
        packSaved: state.packSaved,
        techLeadApproved: state.techLeadApproved,
        devopsApproved: state.devopsApproved,
      }),
    },
  ),
);
