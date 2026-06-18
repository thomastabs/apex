import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 7, pmTool: "taiga", pmToken: "tok", taigaToken: "t", taigaApiUrl: "u" }),
  useGithubContext: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/stores/ui-store", () => ({
  useUiStore: (sel: (s: { theme: string }) => unknown) => sel({ theme: "light" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ai-progress-indicator", () => ({
  AIProgressIndicator: () => <div data-testid="ai-progress" />,
}));

const REPORT = vi.hoisted(() => ({
  story_id: 10,
  title: "Login",
  epic_title: "Auth",
  layer: "ai",
  score: 67,
  summary: "1 endpoint missing, 1 scenario untested.",
  endpoints: [
    { contract: "POST /api/v1/auth/login", status: "present", location: "api/auth.py", notes: "" },
    { contract: "DELETE /api/v1/sessions", status: "missing", location: "", notes: "" },
  ],
  scenarios: [
    { scenario: "User signs in", status: "tested", test_location: "tests/test_auth.py", notes: "" },
  ],
  constraints: [
    { constraint_id: "NFR-1", status: "addressed", evidence: "rate-limit" },
  ],
  generated_at: "2026-06-16T10:00:00Z",
}));

vi.mock("@/lib/api/phase6", () => ({
  getConformanceEligibleStories: vi.fn().mockResolvedValue({
    stories: [
      { story_id: 10, title: "Login", epic_title: "Auth", phase_status: "implementation", has_conformance: true, score: 67 },
    ],
  }),
  getConformanceReport: vi.fn().mockResolvedValue(REPORT),
  verifyConformance: vi.fn().mockResolvedValue(REPORT),
  // Maintenance tab is the default; stub its data fetch so the tab mounts cleanly.
  listMaintenanceItems: vi.fn().mockResolvedValue({ items: [] }),
  PHASE6_AI_TIMEOUT_MS: 1000,
}));

import { Phase6Workflow } from "@/components/phase6-workflow";
import { verifyConformance } from "@/lib/api/phase6";

function renderWorkflow() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Phase6Workflow />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

// Phase 6 is tabbed (Maintenance default). Switch to the Traceability tab.
function openTraceability() {
  fireEvent.click(screen.getByRole("tab", { name: /Traceability/i }));
}

describe("Phase6Workflow", () => {
  it("auto-selects the first story and renders its report tables", async () => {
    renderWorkflow();
    openTraceability();
    await waitFor(() => expect(screen.getByText("POST /api/v1/auth/login")).toBeInTheDocument());
    // score badge rendered from the report
    expect(screen.getByText("DELETE /api/v1/sessions")).toBeInTheDocument();
    expect(screen.getByText("User signs in")).toBeInTheDocument();
    expect(screen.getByText("NFR-1")).toBeInTheDocument();
    expect(screen.getByText(/1 endpoint missing/)).toBeInTheDocument();
  });

  it("Layer A button runs a deterministic (ai=false) check", async () => {
    renderWorkflow();
    openTraceability();
    await waitFor(() => expect(screen.getByText("POST /api/v1/auth/login")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Layer A/i }));
    await waitFor(() =>
      expect(vi.mocked(verifyConformance)).toHaveBeenCalledWith(expect.anything(), 10, false, []),
    );
  });

  it("Verify button runs the AI (ai=true) check", async () => {
    renderWorkflow();
    openTraceability();
    await waitFor(() => expect(screen.getByText("POST /api/v1/auth/login")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Re-verify|Verify/i }));
    await waitFor(() =>
      expect(vi.mocked(verifyConformance)).toHaveBeenCalledWith(expect.anything(), 10, true, []),
    );
  });
});
