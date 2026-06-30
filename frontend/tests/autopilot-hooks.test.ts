import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Pure logic: refetchInterval behaviour
// ---------------------------------------------------------------------------

type AutopilotState = "running" | "paused" | "stopped" | "done" | "error";

const TERMINAL_STATES: AutopilotState[] = ["done", "stopped", "error"];
const POLL_INTERVAL = 1500;

function computeRefetchInterval(state: AutopilotState | undefined): number | false {
  if (!state || TERMINAL_STATES.includes(state)) return false;
  return POLL_INTERVAL;
}

describe("computeRefetchInterval", () => {
  it("returns POLL_INTERVAL when state is running", () => {
    expect(computeRefetchInterval("running")).toBe(1500);
  });

  it("returns POLL_INTERVAL when state is paused", () => {
    expect(computeRefetchInterval("paused")).toBe(1500);
  });

  it("returns false when state is done", () => {
    expect(computeRefetchInterval("done")).toBe(false);
  });

  it("returns false when state is stopped", () => {
    expect(computeRefetchInterval("stopped")).toBe(false);
  });

  it("returns false when state is error", () => {
    expect(computeRefetchInterval("error")).toBe(false);
  });

  it("returns false when state is undefined", () => {
    expect(computeRefetchInterval(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook unit tests via renderHook
// ---------------------------------------------------------------------------

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 1, pmTool: "taiga", pmToken: "tok" }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api/autopilot", () => ({
  startAutopilot: vi.fn(),
  getAutopilotStatus: vi.fn(),
  pauseAutopilot: vi.fn(),
  resumeAutopilot: vi.fn(),
  stopAutopilot: vi.fn(),
  takeOverAutopilot: vi.fn(),
}));

import {
  startAutopilot,
  getAutopilotStatus,
  pauseAutopilot,
  resumeAutopilot,
  stopAutopilot,
  takeOverAutopilot,
} from "@/lib/api/autopilot";
import {
  useStartAutopilot,
  useAutopilotStatus,
  usePauseAutopilot,
  useResumeAutopilot,
  useStopAutopilot,
  useTakeOverAutopilot,
} from "@/lib/hooks/use-autopilot";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: qc }, children)
  );
}

const FAKE_STATUS = {
  job_id: "fake-job-123",
  state: "running" as const,
  current_phase: "phase1" as const,
  current_epic_idx: null,
  current_story_id: null,
  events: [],
  error: null,
  story_count: 0,
  stories_done: 0,
  checkpoint_phase: null,
};

beforeEach(() => {
  vi.mocked(startAutopilot).mockReset();
  vi.mocked(getAutopilotStatus).mockReset();
  vi.mocked(pauseAutopilot).mockReset();
  vi.mocked(resumeAutopilot).mockReset();
  vi.mocked(stopAutopilot).mockReset();
  vi.mocked(takeOverAutopilot).mockReset();
});

// ---------------------------------------------------------------------------
// useStartAutopilot
// ---------------------------------------------------------------------------

describe("useStartAutopilot", () => {
  it("calls startAutopilot with correct body and returns job_id", async () => {
    vi.mocked(startAutopilot).mockResolvedValue({ job_id: "new-job-id" });

    const { result } = renderHook(() => useStartAutopilot(), { wrapper: makeWrapper() });

    let returnValue: { job_id: string } | undefined;
    await act(async () => {
      returnValue = await result.current.mutateAsync({
        concept: "Auth",
        epics: [{ title: "Login", description: "" }],
        tech_stack_hint: "",
        settings: { pause_at_checkpoints: true, create_epics_in_taiga: false, auto_epics: false },
      });
    });

    expect(startAutopilot).toHaveBeenCalledOnce();
    expect(returnValue?.job_id).toBe("new-job-id");
  });

  it("shows error toast on failure", async () => {
    const { toast } = await import("sonner");
    vi.mocked(startAutopilot).mockRejectedValue(new Error("server error"));

    const { result } = renderHook(() => useStartAutopilot(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({
        concept: "Auth",
        epics: [{ title: "Login", description: "" }],
        tech_stack_hint: "",
        settings: { pause_at_checkpoints: false, create_epics_in_taiga: false, auto_epics: false },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("server error"));
  });
});

// ---------------------------------------------------------------------------
// useAutopilotStatus
// ---------------------------------------------------------------------------

describe("useAutopilotStatus", () => {
  it("fetches status for a given job id", async () => {
    vi.mocked(getAutopilotStatus).mockResolvedValue(FAKE_STATUS);

    const { result } = renderHook(() => useAutopilotStatus("fake-job-123"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.job_id).toBe("fake-job-123");
    expect(result.current.data?.state).toBe("running");
  });

  it("is disabled when jobId is null", () => {
    const { result } = renderHook(() => useAutopilotStatus(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(getAutopilotStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// usePauseAutopilot
// ---------------------------------------------------------------------------

describe("usePauseAutopilot", () => {
  it("calls pauseAutopilot with the job id", async () => {
    vi.mocked(pauseAutopilot).mockResolvedValue({ ok: true, state: "paused" });

    const { result } = renderHook(() => usePauseAutopilot("job-abc"), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(pauseAutopilot).toHaveBeenCalledOnce();
    expect(vi.mocked(pauseAutopilot).mock.calls[0][1]).toBe("job-abc");
  });

  it("shows error toast on failure", async () => {
    const { toast } = await import("sonner");
    vi.mocked(pauseAutopilot).mockRejectedValue(new Error("pause failed"));

    const { result } = renderHook(() => usePauseAutopilot("job-abc"), { wrapper: makeWrapper() });

    await act(async () => { result.current.mutate(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("pause failed"));
  });
});

// ---------------------------------------------------------------------------
// useResumeAutopilot
// ---------------------------------------------------------------------------

describe("useResumeAutopilot", () => {
  it("calls resumeAutopilot with the job id", async () => {
    vi.mocked(resumeAutopilot).mockResolvedValue({ ok: true, state: "running" });

    const { result } = renderHook(() => useResumeAutopilot("job-xyz"), { wrapper: makeWrapper() });

    await act(async () => { await result.current.mutateAsync(); });

    expect(resumeAutopilot).toHaveBeenCalledOnce();
    expect(vi.mocked(resumeAutopilot).mock.calls[0][1]).toBe("job-xyz");
  });
});

// ---------------------------------------------------------------------------
// useStopAutopilot
// ---------------------------------------------------------------------------

describe("useStopAutopilot", () => {
  it("calls stopAutopilot with the job id", async () => {
    vi.mocked(stopAutopilot).mockResolvedValue({ ok: true, state: "stopped" });

    const { result } = renderHook(() => useStopAutopilot("job-stop"), { wrapper: makeWrapper() });

    await act(async () => { await result.current.mutateAsync(); });

    expect(stopAutopilot).toHaveBeenCalledOnce();
    expect(vi.mocked(stopAutopilot).mock.calls[0][1]).toBe("job-stop");
  });

  it("shows error toast on failure", async () => {
    const { toast } = await import("sonner");
    vi.mocked(stopAutopilot).mockRejectedValue(new Error("stop failed"));

    const { result } = renderHook(() => useStopAutopilot("job-stop"), { wrapper: makeWrapper() });

    await act(async () => { result.current.mutate(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("stop failed"));
  });
});

// ---------------------------------------------------------------------------
// useTakeOverAutopilot
// ---------------------------------------------------------------------------

describe("useTakeOverAutopilot", () => {
  it("calls takeOverAutopilot with the job id", async () => {
    vi.mocked(takeOverAutopilot).mockResolvedValue({ ok: true, state: "stopped" });

    const { result } = renderHook(() => useTakeOverAutopilot("job-take"), { wrapper: makeWrapper() });

    await act(async () => { await result.current.mutateAsync(); });

    expect(takeOverAutopilot).toHaveBeenCalledOnce();
    expect(vi.mocked(takeOverAutopilot).mock.calls[0][1]).toBe("job-take");
  });
});
