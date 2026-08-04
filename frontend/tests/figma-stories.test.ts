import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createAppQueryClient } from "@/app/providers";
import { resetErrorToastThrottle } from "@/lib/error-toast";

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: vi.fn(),
}));
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 1, pmTool: "taiga", taigaToken: "tok" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { apiRequest } from "@/lib/api/client";
import { generateStoriesFromFigma } from "@/lib/api/phase1";
import { useGenerateStoriesFromFigma } from "@/lib/hooks/use-phase1";

const CTX = { projectId: 1, pmTool: "taiga", taigaToken: "tok" } as never;

function makeWrapper() {
  const qc = createAppQueryClient({ retryQueries: false });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  resetErrorToastThrottle();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ nl_draft: "[S] Login", story_count: 1 } as never);
});

describe("generateStoriesFromFigma api", () => {
  it("POSTs frames + flows to the figma-stories endpoint", async () => {
    await generateStoriesFromFigma(CTX, {
      frames: [{ name: "Login" }],
      flows: [{ from_name: "Login", to_name: "Dashboard" }],
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/phase1/generate-stories-from-figma",
      expect.objectContaining({
        method: "POST",
        body: { frames: [{ name: "Login" }], flows: [{ from_name: "Login", to_name: "Dashboard" }] },
      }),
    );
  });

  it("sends the X-Figma-Token header when a token is given (image grounding)", async () => {
    // Multi-file union keeps file-namespaced node ids and sends the token (no file_key)
    // so the backend renders each frame against its own file.
    await generateStoriesFromFigma(
      CTX,
      { frames: [{ name: "Home", node_id: "FILEA:1:1" }, { name: "Cfg", node_id: "FILEB:2:2" }], flows: [] },
      "figtok",
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/phase1/generate-stories-from-figma",
      expect.objectContaining({ headers: { "X-Figma-Token": "figtok" } }),
    );
  });

  it("omits the token header when none is given", async () => {
    await generateStoriesFromFigma(CTX, { frames: [{ name: "Login" }], flows: [] });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/phase1/generate-stories-from-figma",
      expect.objectContaining({ headers: undefined }),
    );
  });
});

describe("useGenerateStoriesFromFigma", () => {
  it("returns the generated draft", async () => {
    const { result } = renderHook(() => useGenerateStoriesFromFigma(), { wrapper: makeWrapper() });

    let returned: { nl_draft: string; story_count: number } | undefined;
    await act(async () => {
      returned = (await result.current.mutateAsync({ frames: [{ name: "Login" }], flows: [] })) as typeof returned;
    });

    expect(returned?.nl_draft).toBe("[S] Login");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/phase1/generate-stories-from-figma",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces an error toast on failure", async () => {
    const { toast } = await import("sonner");
    vi.mocked(apiRequest).mockRejectedValue(new Error("AI busy"));

    const { result } = renderHook(() => useGenerateStoriesFromFigma(), { wrapper: makeWrapper() });
    await act(async () => {
      result.current.mutate({ frames: [{ name: "Login" }], flows: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
