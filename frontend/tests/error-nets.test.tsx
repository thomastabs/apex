import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from "sonner";
import { createAppQueryClient } from "@/app/providers";
import { ApiError } from "@/lib/api/client";
import { resetErrorToastThrottle } from "@/lib/error-toast";

function makeWrapper() {
  const qc = createAppQueryClient({ retryQueries: false });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

beforeEach(() => {
  vi.mocked(toast.error).mockReset();
  resetErrorToastThrottle();
});

/**
 * These cover the actual regression this work targets: a mutation or query that
 * nobody wrote an error handler for must still tell the user it failed. Before,
 * 48 mutations and 32 queries failed in complete silence.
 */
describe("global mutation error net", () => {
  it("reports a mutation with no onError of its own", async () => {
    const { result } = renderHook(
      () => useMutation({ mutationFn: async () => { throw new ApiError(500, "boom"); } }),
      { wrapper: makeWrapper() },
    );
    await act(async () => { result.current.mutate(undefined); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("names the operation from meta.errorLabel", async () => {
    const { result } = renderHook(
      () => useMutation({
        mutationFn: async () => { throw new ApiError(500, "boom"); },
        meta: { errorLabel: "op.generateTasks" },
      }),
      { wrapper: makeWrapper() },
    );
    await act(async () => { result.current.mutate(undefined); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe("Task generation failed");
  });

  it("stays silent when meta.toastSilent is set", async () => {
    const { result } = renderHook(
      () => useMutation({
        mutationFn: async () => { throw new ApiError(500, "boom"); },
        meta: { toastSilent: true },
      }),
      { wrapper: makeWrapper() },
    );
    await act(async () => { result.current.mutate(undefined); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("global query error net", () => {
  it("reports a failing query even though nothing renders isError", async () => {
    const { result } = renderHook(
      () => useQuery({
        queryKey: ["net-test", "fails"],
        queryFn: async () => { throw new ApiError(502, "Failed to reach Taiga instance."); },
        retry: false,
      }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0][1]?.description).toContain("Failed to reach Taiga instance.");
  });

  it("stays silent for an opt-out query", async () => {
    const { result } = renderHook(
      () => useQuery({
        queryKey: ["net-test", "silent"],
        queryFn: async () => { throw new ApiError(404, "nope"); },
        retry: false,
        meta: { toastSilent: true },
      }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
