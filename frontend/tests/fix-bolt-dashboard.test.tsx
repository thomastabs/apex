import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const PROJECT_ID = 7;
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: PROJECT_ID, pmTool: "taiga", taigaToken: "tok", taigaApiUrl: "https://api.taiga.io" }),
}));
vi.mock("@/lib/stores/ui-store", () => ({
  useUiStore: (sel: (s: { theme: string }) => unknown) => sel({ theme: "light" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

vi.mock("@/lib/api/phase4", () => ({
  listBugReports: vi.fn().mockResolvedValue({ bug_reports: [{ story_id: 5, title: "Login", chars: 120 }] }),
  getFixLog: vi.fn().mockResolvedValue({ fix_log_md: "" }),
  getBugReport: vi.fn(),
  saveBugReport: vi.fn(),
  deleteBugReport: vi.fn(),
  failGate: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/api/analytics", () => ({
  getAnalyticsSummary: vi.fn().mockResolvedValue({
    stories: [
      { story_id: 5, title: "Login", epic_title: "Auth", phase_status: "implementation", fix_bolt_count: 0, total_cycle_hours: null, chain_resolved: false, risk: { level: "none", score: 0, reasons: [] } },
      { story_id: 9, title: "Deploy config", epic_title: "Deployment", phase_status: "implementation", fix_bolt_count: 0, total_cycle_hours: null, chain_resolved: false, risk: { level: "none", score: 0, reasons: [] } },
    ],
  }),
}));

import { FixBoltDashboard } from "@/components/fix-bolt-dashboard";
import { failGate } from "@/lib/api/phase4";

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><FixBoltDashboard /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FixBoltDashboard — manual bug report", () => {
  it("lists existing bug reports", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/US#5/)).toBeInTheDocument());
  });

  it("opens the report form and disables submit until a story and description are given", async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /Report Bug/i }));

    const submit = await screen.findByRole("button", { name: /Create Fix-Bolt/i });
    expect(submit).toBeDisabled();

    const select = screen.getByRole("combobox");
    await waitFor(() => expect(screen.getByText(/US#9 Deploy config/)).toBeInTheDocument());
    fireEvent.change(select, { target: { value: "9" } });
    expect(submit).toBeDisabled(); // still no description

    fireEvent.change(screen.getByPlaceholderText(/What's wrong/i), { target: { value: "Deploy 404s on cold start" } });
    expect(submit).not.toBeDisabled();
  });

  it("submits a manual bug report without any failed QA scenario, via fail-gate", async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /Report Bug/i }));

    await waitFor(() => expect(screen.getByText(/US#9 Deploy config/)).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9" } });
    fireEvent.change(screen.getByPlaceholderText(/What's wrong/i), { target: { value: "Deploy 404s on cold start" } });
    fireEvent.change(screen.getByPlaceholderText(/Root cause/i), { target: { value: "Missing route mount" } });

    fireEvent.click(screen.getByRole("button", { name: /Create Fix-Bolt/i }));

    await waitFor(() =>
      expect(vi.mocked(failGate)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          story_id: 9,
          bug_report_md: "Deploy 404s on cold start",
          root_cause: "Missing route mount",
        }),
      ),
    );
    // no scenario_results were passed — this path never requires a failed QA scenario
    const [, body] = vi.mocked(failGate).mock.calls[0];
    expect(body.scenario_results).toBeUndefined();

    // form resets and closes on success
    await waitFor(() => expect(screen.queryByRole("combobox")).not.toBeInTheDocument());
  });
});
