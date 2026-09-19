import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Minimal shared plumbing, same pattern as tests/phase6-workflow.test.tsx.
vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 7, pmTool: "taiga", pmToken: "tok", taigaToken: "t", taigaApiUrl: "u" }),
  useGithubContext: () => null,
  useFigmaContext: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/stores/ui-store", () => ({
  useUiStore: (sel: (s: { theme: string }) => unknown) => sel({ theme: "light" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/components/ai-progress-indicator", () => ({
  AIProgressIndicator: () => <div data-testid="ai-progress" />,
}));
vi.mock("@/lib/api/pm-factory", () => ({
  getPmAdapter: () => ({ getProjectTasks: vi.fn().mockResolvedValue([]) }),
}));
vi.mock("@/lib/api/workspace", () => ({ toPmCtx: () => ({ projectId: "7" }) }));
vi.mock("@/lib/api/phase3", () => ({
  getProposals: vi.fn().mockResolvedValue({ proposals: [] }),
}));

// vi.mock factories below are hoisted above these declarations, so anything
// they reference must itself be created inside vi.hoisted.
const { STORY_PREVIEW, storyContext } = vi.hoisted(() => ({
  STORY_PREVIEW: {
    story_id: 10,
    title: "User Login",
    epic_title: "Authentication",
    gherkin_preview: "Feature: Login",
    has_infra_delta: true,
    has_deploy_pack: true,
    deploy_bypass: false,
    fix_bolt_count: 0,
  },
  // One mutable object the test flips between "still qa_passed" and
  // "deployed via GitHub Actions" without needing two separate render trees.
  storyContext: {
    story_id: 10,
    title: "User Login",
    epic_title: "Authentication",
    gherkin: "Feature: Login\n  Scenario: Successful login\n    Given a user",
    technical_spec: "",
    tech_stack: "",
    github_context_synced: true,
    is_first_deployment: false,
    pipeline_detected: true,
    has_bug_report: false,
    fix_bolt_count: 0,
    phase_status: "qa_passed",
    deployed: false,
  },
}));

vi.mock("@/lib/api/phase5", () => ({
  getEligibleStories: vi.fn().mockResolvedValue({ stories: [STORY_PREVIEW] }),
  getStoryContext: vi.fn(() => Promise.resolve({ ...storyContext })),
  getInfraDelta: vi.fn().mockRejectedValue(new Error("no delta saved")),
  getDeployPack: vi.fn().mockResolvedValue({ story_id: 10, deploy_pack_md: "" }),
  getQaResults: vi.fn().mockResolvedValue({ story_id: 10, qa_results: null }),
  getGithubDeploymentStatus: vi.fn(() => Promise.resolve({
    github_connected: true,
    repo: "acme/widgets",
    config: { workflow_id: "deploy.yml" },
    workflow_configured: true,
    workflow_exists: true,
    workflow: { id: 1, name: "deploy.yml" },
    workflows: [],
    latest_run: { run_id: 555, status: "in_progress", conclusion: "", run_url: "https://github.com/x/y/actions/runs/555" },
    error: "",
  })),
  saveGithubDeploymentConfig: vi.fn(),
  dispatchGithubDeployment: vi.fn(),
  // Simulates the real backend: syncing is what learns a dispatched run
  // finished and marks the story deployed server-side. The mock flips the
  // same storyContext object getStoryContext reads, so this test can prove
  // the mutation's own query invalidation is what surfaces it — not just
  // that StageD renders correctly given an already-deployed prop.
  syncGithubDeployment: vi.fn(() => {
    storyContext.phase_status = "deployed";
    storyContext.deployed = true;
    return Promise.resolve({ matched: true, run_id: 555 });
  }),
  saveVerification: vi.fn().mockResolvedValue({ story_id: 10, matrix: null }),
  passDeploymentGate: vi.fn(),
  generateInfraDelta: vi.fn(),
  generateDeployPack: vi.fn(),
  reviseDeployPack: vi.fn(),
  saveInfraDelta: vi.fn(),
  saveDeployPack: vi.fn(),
}));

import { Phase5Workflow } from "@/components/phase5-workflow";
import { usePhase5Store } from "@/lib/stores/phase5-store";

function renderWorkflow() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Phase5Workflow />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePhase5Store.setState({
    selectedStoryId: null,
    currentStoryMeta: { title: "", epicTitle: "" },
    infraDelta: null,
    aiRecommendation: null,
    deltaSaved: false,
    deltaCleared: false,
    deployPackMd: null,
    packSaved: false,
    techLeadApproved: false,
    devopsApproved: false,
    rejectionFeedback: "",
  });
  storyContext.phase_status = "qa_passed";
  storyContext.deployed = false;
});

// Select the one eligible story from Stage A, then jump straight to Stage D
// via the stepper (unlocked once a story is selected) — the mechanism under
// test lives entirely in Stage D and does not depend on Stage B/C state.
async function goToStageD() {
  renderWorkflow();
  await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
  fireEvent.click(screen.getByText("User Login"));
  await waitFor(() => expect(screen.getByRole("button", { name: /Deployment Gate/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Deployment Gate/i }));
}

describe("Phase5Workflow Stage D — GitHub Actions deployed terminal state", () => {
  it("shows the normal Deployment Gate form while the story is still qa_passed", async () => {
    await goToStageD();
    await waitFor(() => expect(screen.getByText(/Human gatekeeper sign-offs/i)).toBeInTheDocument());
    expect(screen.queryByText("Deployment Gate Passed")).not.toBeInTheDocument();
  });

  it("shows the Deployment Gate Passed terminal screen once get_story_context reports deployed, with no manual gate mutation involved", async () => {
    storyContext.phase_status = "deployed";
    storyContext.deployed = true;
    await goToStageD();
    await waitFor(() => expect(screen.getByText("Deployment Gate Passed")).toBeInTheDocument());
    // The form that gateMut.isSuccess would otherwise gate is gone.
    expect(screen.queryByText(/Human gatekeeper sign-offs/i)).not.toBeInTheDocument();
  });

  it("transitions to the terminal screen after clicking Sync run, without a page reload", async () => {
    // Regression test for a real bug (found 2026-09-19, right after the
    // fields above were added): get_story_context correctly reported
    // `deployed` once the backend marked the story deployed, but nothing
    // ever told the frontend's own story-context query to refetch after a
    // sync succeeded — so a user who clicked "Sync run" saw the success
    // banner elsewhere on the page, and the toast saying it synced, but
    // stayed stuck on the same input form indefinitely, since the cached
    // story-context data (fetched once, before the sync) was never
    // invalidated and React Query had no reason to ask again.
    await goToStageD();
    await waitFor(() => expect(screen.getByText(/Human gatekeeper sign-offs/i)).toBeInTheDocument());
    expect(screen.queryByText("Deployment Gate Passed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Sync run/i }));

    await waitFor(() => expect(screen.getByText("Deployment Gate Passed")).toBeInTheDocument());
    expect(screen.queryByText(/Human gatekeeper sign-offs/i)).not.toBeInTheDocument();
  });
});
