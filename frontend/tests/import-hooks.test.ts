import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock the lowest layer only (the HTTP client). The api functions and the
// hooks both run for real on top of it, so one file covers URL building +
// hook behaviour without the vi.mock-hoisting clash of mocking the api module.
vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 1, pmTool: "taiga", pmToken: "tok" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { apiRequest } from "@/lib/api/client";
import { importBootstrap, importReconstructEpic } from "@/lib/api/import";
import { useImportBootstrap, useImportReconstructEpic } from "@/lib/hooks/use-import";

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
  vi.mocked(apiRequest).mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------
// API layer — request URLs / methods
// ---------------------------------------------------------------------------

describe("import api layer", () => {
  it("importBootstrap POSTs to the bootstrap endpoint with the context", async () => {
    await importBootstrap(CTX);
    expect(apiRequest).toHaveBeenCalledWith("/api/workspace/import-from-pm", {
      method: "POST",
      context: CTX,
    });
  });

  it("importReconstructEpic puts the epic id in the path", async () => {
    await importReconstructEpic(CTX, 42);
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/import-from-pm/reconstruct-epic/42",
      { method: "POST", context: CTX },
    );
  });

  it("importReconstructEpic handles the synthetic General epic (id 0)", async () => {
    await importReconstructEpic(CTX, 0);
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/import-from-pm/reconstruct-epic/0",
      { method: "POST", context: CTX },
    );
  });
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

describe("useImportBootstrap", () => {
  it("calls the bootstrap endpoint and returns the report", async () => {
    const report = { imported: 3, skipped: 1, epics: [], status_mapping: [] };
    vi.mocked(apiRequest).mockResolvedValue(report as never);

    const { result } = renderHook(() => useImportBootstrap(), { wrapper: makeWrapper() });

    let returned: typeof report | undefined;
    await act(async () => {
      returned = (await result.current.mutateAsync()) as typeof report;
    });

    expect(apiRequest).toHaveBeenCalledWith("/api/workspace/import-from-pm", expect.objectContaining({ method: "POST" }));
    expect(returned?.imported).toBe(3);
  });

  it("shows an error toast on failure", async () => {
    const { toast } = await import("sonner");
    vi.mocked(apiRequest).mockRejectedValue(new Error("taiga down"));

    const { result } = renderHook(() => useImportBootstrap(), { wrapper: makeWrapper() });
    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("taiga down"));
  });
});

describe("useImportReconstructEpic", () => {
  it("calls the per-epic endpoint with the epic id argument", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      epic_id: 10,
      epic_title: "Auth",
      results: [{ story_id: 100, status: "ok" }],
    } as never);

    const { result } = renderHook(() => useImportReconstructEpic(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync(10);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/import-from-pm/reconstruct-epic/10",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error toast on failure", async () => {
    const { toast } = await import("sonner");
    vi.mocked(apiRequest).mockRejectedValue(new Error("AI failed"));

    const { result } = renderHook(() => useImportReconstructEpic(), { wrapper: makeWrapper() });
    await act(async () => {
      result.current.mutate(10);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("AI failed"));
  });
});
