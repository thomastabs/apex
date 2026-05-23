"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArchitectureAlternative, DesignBundle, WireframeMode } from "@/lib/api/types";

type Phase2State = {
  selectedAlternativeIndex: number;
  alternatives: ArchitectureAlternative[];
  techStackDraft: string;
  designBundle: DesignBundle | null;
  designLeadApproved: boolean;
  techLeadApproved: boolean;
  wireframeMode: WireframeMode;
  setAlternatives: (alternatives: ArchitectureAlternative[]) => void;
  setSelectedAlternativeIndex: (index: number) => void;
  setTechStackDraft: (value: string) => void;
  setDesignBundle: (bundle: DesignBundle | null) => void;
  setDesignLeadApproved: (approved: boolean) => void;
  setTechLeadApproved: (approved: boolean) => void;
  setWireframeMode: (mode: WireframeMode) => void;
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
      wireframeMode: "screen_inventory",
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
      setWireframeMode: (wireframeMode) => set({ wireframeMode }),
      clearPhase2Draft: () =>
        set({
          selectedAlternativeIndex: -1,
          alternatives: [],
          techStackDraft: "",
          designBundle: null,
          designLeadApproved: false,
          techLeadApproved: false,
          wireframeMode: "screen_inventory",
        }),
    }),
    {
      name: "apex-phase2-draft",
      partialize: (state) => ({
        alternatives: state.alternatives,
        selectedAlternativeIndex: state.selectedAlternativeIndex,
        techStackDraft: state.techStackDraft,
        wireframeMode: state.wireframeMode,
      }),
    },
  ),
);
