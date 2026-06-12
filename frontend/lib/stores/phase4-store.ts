"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScenarioResult = "pass" | "fail" | "pending";

type Phase4State = {
  selectedStoryId: number | null;
  testPlanMd: string | null;
  scenarioResults: Record<string, ScenarioResult>;
  scenarioNotes: Record<string, string>;
  bugReportDrafts: Record<string, string>;    // scenarioName → Fix-Bolt artifact md
  isRegressionBypass: boolean;
  failedScenarioNames: string[];              // persisted from previous gate failure
  currentStoryMeta: { title: string; epicTitle: string };

  setSelectedStoryId: (id: number | null) => void;
  setTestPlanMd: (md: string) => void;
  setScenarioResult: (scenarioName: string, result: ScenarioResult) => void;
  setScenarioNotes: (scenarioName: string, notes: string) => void;
  setBugReportDraft: (scenarioName: string, md: string) => void;
  setCurrentStoryMeta: (title: string, epicTitle: string) => void;
  setRegressionBypass: (isRegression: boolean, failedNames: string[]) => void;
  clearTestPlanDraft: () => void;
  clearPhase4Draft: () => void;
};

export const usePhase4Store = create<Phase4State>()(
  persist(
    (set) => ({
      selectedStoryId: null,
      testPlanMd: null,
      scenarioResults: {},
      scenarioNotes: {},
      bugReportDrafts: {},
      isRegressionBypass: false,
      failedScenarioNames: [],
      currentStoryMeta: { title: "", epicTitle: "" },

      setSelectedStoryId: (id) =>
        set((state) => {
          if (id === state.selectedStoryId) return {};
          return {
            selectedStoryId: id,
            testPlanMd: null,
            scenarioResults: {},
            scenarioNotes: {},
            bugReportDrafts: {},
            isRegressionBypass: false,
            failedScenarioNames: [],
            currentStoryMeta: { title: "", epicTitle: "" },
          };
        }),

      setTestPlanMd: (md) => set({ testPlanMd: md }),

      setScenarioResult: (scenarioName, result) =>
        set((s) => ({ scenarioResults: { ...s.scenarioResults, [scenarioName]: result } })),

      setScenarioNotes: (scenarioName, notes) =>
        set((s) => ({ scenarioNotes: { ...s.scenarioNotes, [scenarioName]: notes } })),

      setBugReportDraft: (scenarioName, md) =>
        set((s) => ({ bugReportDrafts: { ...s.bugReportDrafts, [scenarioName]: md } })),

      setCurrentStoryMeta: (title, epicTitle) =>
        set({ currentStoryMeta: { title, epicTitle } }),

      setRegressionBypass: (isRegressionBypass, failedScenarioNames) =>
        set({ isRegressionBypass, failedScenarioNames }),

      // Wipe plan + execution draft but keep the story selected (Clear Plan)
      clearTestPlanDraft: () =>
        set({
          testPlanMd: null,
          scenarioResults: {},
          scenarioNotes: {},
          bugReportDrafts: {},
        }),

      clearPhase4Draft: () =>
        set({
          selectedStoryId: null,
          testPlanMd: null,
          scenarioResults: {},
          scenarioNotes: {},
          bugReportDrafts: {},
          isRegressionBypass: false,
          failedScenarioNames: [],
          currentStoryMeta: { title: "", epicTitle: "" },
        }),
    }),
    {
      name: "apex-phase4-draft",
      partialize: (state) => ({
        selectedStoryId: state.selectedStoryId,
        testPlanMd: state.testPlanMd,
        scenarioResults: state.scenarioResults,
        scenarioNotes: state.scenarioNotes,
        failedScenarioNames: state.failedScenarioNames,
        isRegressionBypass: state.isRegressionBypass,
        currentStoryMeta: state.currentStoryMeta,
      }),
    },
  ),
);
