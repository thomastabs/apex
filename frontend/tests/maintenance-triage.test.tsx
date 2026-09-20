import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const PROJECT_ID = 7;
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: PROJECT_ID, pmTool: "taiga", taigaToken: "tok", taigaApiUrl: "https://api.taiga.io" }),
  useGithubContext: () => ({ pat: "p", owner: "o", repo: "r" }),
  useFigmaContext: () => null,
}));
vi.mock("@/lib/stores/ui-store", () => ({
  useUiStore: (sel: (s: { theme: string }) => unknown) => sel({ theme: "light" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
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

const PLACEMENT = vi.hoisted(() => ({
  is_new_epic: false,
  matched_epic_title: "Reporting",
  rationale: "Fits the existing reporting epic.",
  suggested_epic_title: null,
  suggested_story_title: "Export report as CSV",
  suggested_story_description: "As a user I want to export a report as CSV.",
}));

vi.mock("@/lib/api/phase6", () => ({
  listMaintenanceItems: vi.fn().mockResolvedValue({ items: ITEMS.list }),
  classifyMaintenanceItem: vi.fn().mockResolvedValue(ITEMS.list[0]),
  classifyPlacement: vi.fn().mockResolvedValue(PLACEMENT),
  diagnoseMaintenanceItem: vi.fn(),
  fixBriefMaintenanceItem: vi.fn(),
  routeMaintenanceItem: vi.fn().mockResolvedValue(ITEMS.list[0]),
  resolveMaintenanceItem: vi.fn(),
  createMaintenanceItem: vi.fn(),
  suggestLane: vi.fn(),
}));

vi.mock("@/lib/api/phase1", () => ({
  listPhase1Epics: vi.fn().mockResolvedValue([
    { id: 9, ref: 9, subject: "Reporting", description: "Reporting epic", tags: [], stories: [] },
  ]),
}));

import { MaintenanceTriage } from "@/components/maintenance-triage";
import { classifyMaintenanceItem, classifyPlacement, resolveMaintenanceItem, routeMaintenanceItem } from "@/lib/api/phase6";
import { usePhase1IntakeStore } from "@/lib/stores/phase1-intake-store";

function renderTriage() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MaintenanceTriage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  push.mockClear();
  vi.stubGlobal("confirm", vi.fn(() => true));
  usePhase1IntakeStore.getState().clearPending();
});

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

  it("Path A change request: AI placement review drives the Phase 1 handoff", async () => {
    renderTriage();
    await waitFor(() => expect(screen.getAllByText(/Add export/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/Add export/)[0]); // list button

    const analyzeBtn = await screen.findByRole("button", { name: /Analyze placement/i });
    fireEvent.click(analyzeBtn);
    await waitFor(() => expect(vi.mocked(classifyPlacement)).toHaveBeenCalledWith(
      expect.anything(), 1, expect.any(Array), expect.anything(), expect.any(Array),
    ));

    // AI verdict rendered as an editable, human-reviewable proposal.
    await screen.findByText(/Add to existing epic: "Reporting"/i);
    await screen.findByDisplayValue("Export report as CSV");

    const continueBtn = await screen.findByRole("button", { name: /Continue to Phase 1/i });
    fireEvent.click(continueBtn);

    expect(push).toHaveBeenCalledWith("/phase1");
    expect(usePhase1IntakeStore.getState().pending).toEqual({
      mode: "load",
      epicId: 9,
      epicTitle: "Reporting",
      nlDraft: expect.stringContaining("Export report as CSV"),
      fromMaintenanceItemId: 1,
    });
  });

  it("Path A change request: skipping AI still seeds a full handoff (dead-link fix)", async () => {
    renderTriage();
    await waitFor(() => expect(screen.getAllByText(/Add export/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/Add export/)[0]);

    const skipBtn = await screen.findByRole("button", { name: /Skip AI/i });
    fireEvent.click(skipBtn);
    expect(vi.mocked(classifyPlacement)).not.toHaveBeenCalled();

    const continueBtn = await screen.findByRole("button", { name: /Continue to Phase 1/i });
    fireEvent.click(continueBtn);

    expect(push).toHaveBeenCalledWith("/phase1");
    const pending = usePhase1IntakeStore.getState().pending;
    expect(pending?.mode).toBe("create");
    expect(pending?.fromMaintenanceItemId).toBe(1);
    // The raw item subject/description must never vanish, even with no AI call.
    expect(pending?.nlDraft).toContain("Add export");
  });

  it("records a change request as resolved next to Delete, confirming Phase 1 progress", async () => {
    renderTriage();
    await waitFor(() => expect(screen.getAllByText(/Add export/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/Add export/)[0]);

    // Available immediately once classified - no diagnose/fix-brief detour
    // required, unlike a bug's path to resolution.
    const recordBtn = await screen.findByRole("button", { name: /Record Change/i });
    expect(screen.getByRole("button", { name: /^Delete$/i })).toBeInTheDocument();

    fireEvent.click(recordBtn);
    await waitFor(() => expect(vi.mocked(resolveMaintenanceItem)).toHaveBeenCalledWith(
      expect.anything(), 1, undefined, "Resolved via Phase 1 discovery.",
    ));
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
