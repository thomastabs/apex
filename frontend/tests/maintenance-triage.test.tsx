import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const PROJECT_ID = 7;
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: PROJECT_ID, pmTool: "taiga", taigaToken: "tok", taigaApiUrl: "https://api.taiga.io" }),
  useGithubContext: () => ({ pat: "p", owner: "o", repo: "r" }),
}));
vi.mock("@/lib/stores/ui-store", () => ({
  useUiStore: (sel: (s: { theme: string }) => unknown) => sel({ theme: "light" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const ITEMS = vi.hoisted(() => ({
  list: [
    { id: 2, source: "manual", ext_ref: "", subject: "Login 500", description: "boom",
      evidence: "", linked_story_id: 5, classification: "unclassified", status: "new",
      diagnosis_md: "", fix_brief_md: "", lane: null, ai_rationale: {}, created_at: "", updated_at: "" },
    { id: 1, source: "manual", ext_ref: "", subject: "Add export", description: "",
      evidence: "", linked_story_id: null, classification: "change_request", status: "routed_to_discovery",
      diagnosis_md: "", fix_brief_md: "", lane: null, ai_rationale: { classify: "wants new feature" }, created_at: "", updated_at: "" },
  ],
}));

vi.mock("@/lib/api/phase6", () => ({
  listMaintenanceItems: vi.fn().mockResolvedValue({ items: ITEMS.list }),
  classifyMaintenanceItem: vi.fn().mockResolvedValue(ITEMS.list[0]),
  diagnoseMaintenanceItem: vi.fn(),
  fixBriefMaintenanceItem: vi.fn(),
  routeMaintenanceItem: vi.fn().mockResolvedValue(ITEMS.list[0]),
  resolveMaintenanceItem: vi.fn(),
  createMaintenanceItem: vi.fn(),
  suggestLane: vi.fn(),
}));

import { MaintenanceTriage } from "@/components/maintenance-triage";
import { classifyMaintenanceItem, routeMaintenanceItem } from "@/lib/api/phase6";

function renderTriage() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MaintenanceTriage /></QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); push.mockClear(); });

describe("MaintenanceTriage", () => {
  it("lists maintenance items", async () => {
    renderTriage();
    await waitFor(() => expect(screen.getAllByText(/Login 500/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Add export/).length).toBeGreaterThan(0);
  });

  it("classifies the selected bug item", async () => {
    renderTriage();
    // item 2 auto-selected (first), unclassified → Classify button shown
    const btn = await screen.findByRole("button", { name: /Classify/i });
    fireEvent.click(btn);
    await waitFor(() => expect(vi.mocked(classifyMaintenanceItem)).toHaveBeenCalledWith(expect.anything(), 2, expect.anything()));
  });

  it("Path A change request offers Open in Phase 1", async () => {
    renderTriage();
    await waitFor(() => expect(screen.getAllByText(/Add export/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/Add export/)[0]); // list button
    const link = await screen.findByText(/Open in Phase 1/i);
    fireEvent.click(link);
    expect(push).toHaveBeenCalledWith("/phase1");
  });

  it("routes a fix-ready item down the Secure Lane", async () => {
    // make item 2 fix_ready with a brief
    ITEMS.list[0].status = "fix_ready";
    ITEMS.list[0].fix_brief_md = "## Fix-Bolt Brief\nx";
    ITEMS.list[0].diagnosis_md = "## Root Cause\nx";
    renderTriage();
    const btn = await screen.findByRole("button", { name: /Secure Lane/i });
    fireEvent.click(btn);
    await waitFor(() => expect(vi.mocked(routeMaintenanceItem)).toHaveBeenCalledWith(expect.anything(), 2, "secure"));
  });
});
