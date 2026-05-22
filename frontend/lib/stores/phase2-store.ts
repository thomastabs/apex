"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArchitectureAlternative, DesignBundle } from "@/lib/api/types";

type Phase2State = {
  selectedAlternativeIndex: number;
  alternatives: ArchitectureAlternative[];
  techStackDraft: string;
  designBundle: DesignBundle | null;
  designLeadApproved: boolean;
  techLeadApproved: boolean;
  setAlternatives: (alternatives: ArchitectureAlternative[]) => void;
  setSelectedAlternativeIndex: (index: number) => void;
  setTechStackDraft: (value: string) => void;
  setDesignBundle: (bundle: DesignBundle | null) => void;
  setDesignLeadApproved: (approved: boolean) => void;
  setTechLeadApproved: (approved: boolean) => void;
  clearPhase2Draft: () => void;
};

export const usePhase2Store = create<Phase2State>()(
  persist(
    (set) => ({
      selectedAlternativeIndex: -1,
      alternatives: [],
      techStackDraft: "",
      designBundle: null,
      designLeadApproved: false,
      techLeadApproved: false,
      setAlternatives: (alternatives) => set({ alternatives }),
      setSelectedAlternativeIndex: (selectedAlternativeIndex) => set({ selectedAlternativeIndex }),
      setTechStackDraft: (techStackDraft) => set({ techStackDraft }),
      setDesignBundle: (designBundle) =>
        set({
          designBundle,
          designLeadApproved: false,
          techLeadApproved: false,
        }),
      setDesignLeadApproved: (designLeadApproved) => set({ designLeadApproved }),
      setTechLeadApproved: (techLeadApproved) => set({ techLeadApproved }),
      clearPhase2Draft: () =>
        set({
          selectedAlternativeIndex: -1,
          alternatives: [],
          techStackDraft: "",
          designBundle: null,
          designLeadApproved: false,
          techLeadApproved: false,
        }),
    }),
    {
      name: "apex-phase2-draft",
      partialize: (state) => ({
        alternatives: state.alternatives,
        selectedAlternativeIndex: state.selectedAlternativeIndex,
        techStackDraft: state.techStackDraft,
      }),
    },
  ),
);
