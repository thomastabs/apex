import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

// Fixed project context so we can assert invalidations are scoped to it (M6).
const PROJECT_ID = 7;
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({
    projectId: PROJECT_ID,
    pmTool: "taiga",
    pmToken: "tok",
    pmProjectId: "proj-slug",
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api/phase4", () => ({
  saveTestPlan: vi.fn().mockResolvedValue({ ok: true }),
  deleteTestPlan: vi.fn().mockResolvedValue({ ok: true }),
  passGate: vi.fn().mockResolvedValue({ ok: true }),
  failGate: vi.fn().mockResolvedValue({ ok: true }),
  getEligibleStories: vi.fn(),
  getStoryContext: vi.fn(),
  getTestPlan: vi.fn(),
  generateTestPlan: vi.fn(),
  generateBugReport: vi.fn(),
}));

vi.mock("@/lib/api/phase5", () => ({
  saveInfraDelta: vi.fn().mockResolvedValue({ ok: true }),
  passDeploymentGate: vi.fn().mockResolvedValue({ ok: true }),
  getEligibleStories: vi.fn(),
  getStoryContext: vi.fn(),
  generateInfraDelta: vi.fn(),
  getInfraDelta: vi.fn(),
  generateDeployPack: vi.fn(),
  saveDeployPack: vi.fn(),
  getDeployPack: vi.fn(),
  reviseDeployPack: vi.fn(),
  getQaResults: vi.fn(),
  saveVerification: vi.fn(),
  getVerification: vi.fn(),
}));

vi.mock("@/lib/api/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/workspace")>();
  return {
    ...actual,
    rebuildStoryIndex: vi.fn().mockResolvedValue({ ok: true }),
    logDecision: vi.fn().mockResolvedValue({ ok: true }),
  };
});

vi.mock("@/lib/api/phase1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/phase1")>();
  return {
    ...actual,
    pushPhase1Stories: vi.fn().mockResolvedValue({ epic_id: 10, count: 2, story_ids: [101, 102], push_failures: [] }),
  };
});

vi.mock("@/lib/api/phase2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/phase2")>();
  return {
    ...actual,
    lockTechStack: vi.fn().mockResolvedValue({ defined: true, tech_stack: "x" }),
    refreshStoryIndex: vi.fn().mockResolvedValue({ ok: true }),
  };
});

vi.mock("@/lib/api/phase3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/phase3")>();
  return { ...actual, lockStory: vi.fn().mockResolvedValue({ ok: true }) };
});

import { useSaveTestPlan, usePassGate, useFailGate } from "@/lib/hooks/use-phase4";
import { useSaveInfraDelta } from "@/lib/hooks/use-phase5";
import { useRebuildStoryIndex, useLogDecision } from "@/lib/hooks/use-workspace";
import { usePushPhase1Stories } from "@/lib/hooks/use-phase1";
import { useLockTechStack } from "@/lib/hooks/use-phase2";
import { useLockStory } from "@/lib/hooks/use-phase3";

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function freshClient() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  return { qc, spy };
}

beforeEach(() => vi.clearAllMocks());

describe("phase4 mutation hooks scope invalidations to the active project (M6)", () => {
  it("useSaveTestPlan invalidates eligible-stories, story-index-stats, test-plan with projectId", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useSaveTestPlan(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ storyId: 10, testPlanMd: "plan" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase4", "eligible-stories", PROJECT_ID]);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
    expect(keys).toContainEqual(["phase4", "test-plan", PROJECT_ID, 10]);
  });

  it("usePassGate invalidates project-scoped eligible-stories + story-index-stats", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => usePassGate(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ storyId: 10 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase4", "eligible-stories", PROJECT_ID]);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });

  it("useFailGate reports the error via toast and does not resolve", async () => {
    const { failGate } = await import("@/lib/api/phase4");
    vi.mocked(failGate).mockRejectedValueOnce(new Error("boom"));
    const { qc } = freshClient();
    const { result } = renderHook(() => useFailGate(), { wrapper: wrapper(qc) });

    await expect(
      result.current.mutateAsync({ story_id: 10, bug_report_md: "x", root_cause: "", resolution_summary: "" } as never),
    ).rejects.toThrow("boom");
  });
});

describe("phase5 + workspace mutation hooks scope invalidations (M6)", () => {
  it("useSaveInfraDelta invalidates project-scoped infra-delta + eligible-stories", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useSaveInfraDelta(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ storyId: 10, delta: { needs_infra_change: false, rationale: "", deltas: [] } as never });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase5", "infra-delta", PROJECT_ID, 10]);
    expect(keys).toContainEqual(["phase5", "eligible-stories", PROJECT_ID]);
  });

  it("useRebuildStoryIndex invalidates project-scoped story-index-stats", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useRebuildStoryIndex(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });

  it("useLogDecision posts the decision and invalidates project-scoped context-files", async () => {
    const { logDecision } = await import("@/lib/api/workspace");
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useLogDecision(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ scope: "Phase 3 dev pack · task #5", summary: "Discarded regen", reason: "kept previous" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(logDecision)).toHaveBeenCalledWith(
      expect.anything(),
      { scope: "Phase 3 dev pack · task #5", summary: "Discarded regen", reason: "kept previous" },
    );
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["workspace", "context-files", PROJECT_ID]);
  });
});

describe("phase1/2/3 mutation hooks scope invalidations (M6/M9)", () => {
  it("usePushPhase1Stories invalidates project-scoped epics + story-index-stats", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => usePushPhase1Stories(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ stories: [], epic_title: "Auth" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase1", "epics", PROJECT_ID]);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });

  it("useLockTechStack invalidates project-scoped tech-stack-status + story-index-stats", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useLockTechStack(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ tech_stack: "FastAPI" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase2", "tech-stack-status", PROJECT_ID]);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });

  it("useLockStory invalidates project-scoped eligible-stories + story-index-stats", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useLockStory(), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ story_id: 10 } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase3", "eligible-stories", PROJECT_ID]);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });
});
