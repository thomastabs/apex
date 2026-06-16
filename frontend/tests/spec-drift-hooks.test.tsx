import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const PROJECT_ID = 7;
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: PROJECT_ID, pmTool: "taiga", pmToken: "tok" }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/workspace")>();
  return {
    ...actual,
    updateContextFile: vi.fn(),
    acknowledgeSpecDrift: vi.fn().mockResolvedValue({ ok: true }),
  };
});

import { useUpdateContextFile, useAcknowledgeSpecDrift } from "@/lib/hooks/use-workspace";
import { updateContextFile, acknowledgeSpecDrift } from "@/lib/api/workspace";

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

describe("controlled spec co-evolution hooks (roadmap #4)", () => {
  it("warns and refreshes stats when a post-lock edit raises drift", async () => {
    vi.mocked(updateContextFile).mockResolvedValue({
      files: [], total_chars: 0,
      drift: { amended: true, filename: "technical-spec.md", affected_story_ids: [1, 2], note: "" },
    });
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useUpdateContextFile(), { wrapper: wrapper(qc) });
    result.current.mutate({ filename: "technical-spec.md", content: "x", note: "tighten" });
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning.mock.calls[0][0]).toMatch(/2 downstream stories flagged/);
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });

  it("does not warn when the edit is pre-lock (no drift)", async () => {
    vi.mocked(updateContextFile).mockResolvedValue({ files: [], total_chars: 0, drift: null });
    const { qc } = freshClient();
    const { result } = renderHook(() => useUpdateContextFile(), { wrapper: wrapper(qc) });
    result.current.mutate({ filename: "design-bundle.md", content: "x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("acknowledge clears drift and refreshes stats", async () => {
    const { qc, spy } = freshClient();
    const { result } = renderHook(() => useAcknowledgeSpecDrift(), { wrapper: wrapper(qc) });
    result.current.mutate(1);
    await waitFor(() => expect(vi.mocked(acknowledgeSpecDrift)).toHaveBeenCalledWith(expect.anything(), 1));
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["workspace", "story-index-stats", PROJECT_ID]);
  });
});
