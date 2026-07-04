import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock the lowest layer only (HTTP client + PM adapter): the api functions and
// hooks run for real on top, so one file covers URL building + hook behaviour.
vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 1, pmTool: "taiga", pmToken: "tok" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/api/pm-factory", () => ({
  getPmAdapter: () => ({
    listStoryStatuses: vi.fn().mockResolvedValue([{ id: "9", name: "design_locked" }]),
    getStory: vi.fn().mockResolvedValue({ version: 1, tags: [] }),
    updateStory: vi.fn().mockResolvedValue({}),
  }),
}));

import { apiRequest } from "@/lib/api/client";
import { generateDesignDelta, getDesignDeltaStatus, persistDesignDelta } from "@/lib/api/phase2";
import { useDesignDeltaStatus, usePersistDesignDelta } from "@/lib/hooks/use-phase2";

const CTX = { projectId: 7, pmTool: "taiga", pmToken: "tok" } as never;

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({
    ok: true, story_ids: [20], versions: { "technical-spec.md": "1.1.0" },
    amended: false, affected_story_ids: [],
  } as never);
});

describe("design delta api layer", () => {
  it("getDesignDeltaStatus GETs the status endpoint", async () => {
    await getDesignDeltaStatus(CTX);
    expect(apiRequest).toHaveBeenCalledWith("/api/phase2/design-delta-status", { context: CTX });
  });

  it("generateDesignDelta POSTs story ids + instructions", async () => {
    await generateDesignDelta(CTX, [20, 21], "reuse auth");
    expect(apiRequest).toHaveBeenCalledWith("/api/phase2/generate-design-delta", expect.objectContaining({
      method: "POST",
      context: CTX,
      body: { story_ids: [20, 21], instructions: "reuse auth" },
    }));
  });

  it("persistDesignDelta persists to the backend BEFORE touching the PM", async () => {
    const result = await persistDesignDelta(CTX, {
      story_ids: [20],
      ux_brief_addendum: "",
      endpoints_delta: "- `GET /r`",
      data_model_delta: "",
      touches_existing: [],
    });
    expect(apiRequest).toHaveBeenCalledWith("/api/phase2/persist-design-delta", expect.objectContaining({
      method: "POST",
    }));
    expect(result.versions["technical-spec.md"]).toBe("1.1.0");
    expect(result.taiga_failures).toEqual([]);
  });
});

describe("design delta hooks", () => {
  it("useDesignDeltaStatus queries the endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ design_locked: true, pending: [] } as never);
    const { result } = renderHook(() => useDesignDeltaStatus(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ design_locked: true, pending: [] });
  });

  it("usePersistDesignDelta resolves with versions + amendment flag", async () => {
    const { result } = renderHook(() => usePersistDesignDelta(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        story_ids: [20],
        ux_brief_addendum: "",
        endpoints_delta: "- `GET /r`",
        data_model_delta: "",
        touches_existing: [],
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.amended).toBe(false);
    expect(result.current.data?.story_ids).toEqual([20]);
  });
});
