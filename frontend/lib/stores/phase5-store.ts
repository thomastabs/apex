"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InfraDelta } from "@/lib/api/types";

type Phase5State = {
  selectedStoryId: number | null;
  currentStoryMeta: { title: string; epicTitle: string };
  infraDelta: InfraDelta | null;
  // The original AI recommendation, kept so toggling the verdict (which clears
  // delta items for a Routine save) never loses the AI-generated draft.
  aiRecommendation: InfraDelta | null;
  deltaSaved: boolean;
  // True only between a user-initiated Clear and the next setInfraDelta (a
  // fresh generate, or — after another mount — a real resume load). Exists so
  // useLoadInfraDelta's "resume a previous session" query can be gated on
  // more than infraDelta === null: that condition alone reopens the instant
  // Clear sets infraDelta to null, so the resume-query re-fires, re-fetches
  // the story's still-saved server-side delta (Clear never deletes it), and
  // silently restores the exact thing Clear just discarded. See its own
  // "Discard ... and re-run from scratch" copy — a stale reload is the one
  // thing it must never do.
  deltaCleared: boolean;
  deployPackMd: string | null;
  packSaved: boolean;
  techLeadApproved: boolean;
  devopsApproved: boolean;
  rejectionFeedback: string;

  setSelectedStoryId: (id: number | null) => void;
  setCurrentStoryMeta: (title: string, epicTitle: string) => void;
  setInfraDelta: (delta: InfraDelta | null, saved?: boolean, asRecommendation?: boolean) => void;
  clearInfraDelta: () => void;
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
  aiRecommendation: null as InfraDelta | null,
  deltaSaved: false,
  deltaCleared: false,
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

      setInfraDelta: (infraDelta, saved = false, asRecommendation = false) =>
        set(asRecommendation
          ? { infraDelta, deltaSaved: saved, aiRecommendation: infraDelta, deltaCleared: false }
          : { infraDelta, deltaSaved: saved, deltaCleared: false }),

      clearInfraDelta: () =>
        set({ infraDelta: null, aiRecommendation: null, deltaSaved: false, deltaCleared: true }),

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
        aiRecommendation: state.aiRecommendation,
        deltaSaved: state.deltaSaved,
        deltaCleared: state.deltaCleared,
        deployPackMd: state.deployPackMd,
        packSaved: state.packSaved,
        techLeadApproved: state.techLeadApproved,
        devopsApproved: state.devopsApproved,
      }),
    },
  ),
);
