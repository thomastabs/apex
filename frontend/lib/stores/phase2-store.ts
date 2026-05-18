"use client";

import { create } from "zustand";
import type { ArchitectureAlternative, DesignBundle, EligibleEpic } from "@/lib/api/types";

type Phase2State = {
  selectedEpic: EligibleEpic | null;
  selectedAlternativeIndex: number;
  alternatives: ArchitectureAlternative[];
  techStackDraft: string;
  designBundle: DesignBundle | null;
  designLeadApproved: boolean;
  techLeadApproved: boolean;
  setSelectedEpic: (epic: EligibleEpic | null) => void;
  setAlternatives: (alternatives: ArchitectureAlternative[]) => void;
  setSelectedAlternativeIndex: (index: number) => void;
  setTechStackDraft: (value: string) => void;
  setDesignBundle: (bundle: DesignBundle | null) => void;
  setDesignLeadApproved: (approved: boolean) => void;
  setTechLeadApproved: (approved: boolean) => void;
  resetDesignApprovals: () => void;
  clearPhase2Draft: () => void;
};

export const usePhase2Store = create<Phase2State>((set) => ({
  selectedEpic: null,
  selectedAlternativeIndex: -1,
  alternatives: [],
  techStackDraft: "",
  designBundle: null,
  designLeadApproved: false,
  techLeadApproved: false,
  setSelectedEpic: (selectedEpic) =>
    set({
      selectedEpic,
      designBundle: null,
      designLeadApproved: false,
      techLeadApproved: false,
    }),
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
  resetDesignApprovals: () => set({ designLeadApproved: false, techLeadApproved: false }),
  clearPhase2Draft: () =>
    set({
      selectedEpic: null,
      selectedAlternativeIndex: -1,
      alternatives: [],
      techStackDraft: "",
      designBundle: null,
      designLeadApproved: false,
      techLeadApproved: false,
    }),
}));
