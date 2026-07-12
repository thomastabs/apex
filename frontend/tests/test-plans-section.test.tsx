import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 7, pmTool: "taiga", pmToken: "tok" }),
}));
vi.mock("@/lib/hooks/use-workspace", () => ({ useAutoSyncStoryIndex: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/phase4", () => ({
  listTestPlans: vi.fn().mockResolvedValue({
    test_plans: [
      { story_id: 10, title: "User Login", chars: 1500 },
      { story_id: 11, title: "Logout", chars: 400 },
    ],
  }),
  getTestPlan: vi.fn().mockResolvedValue({ story_id: 10, test_plan_md: "## Plan\nstep 1" }),
  saveTestPlan: vi.fn().mockResolvedValue({ ok: true }),
  deleteTestPlan: vi.fn().mockResolvedValue({ ok: true }),
}));

import { TestPlansSection } from "@/components/sidebar/test-plans-section";
import { deleteTestPlan, getTestPlan, saveTestPlan } from "@/lib/api/phase4";

const DRAG_PROPS = {
  shellClass: "",
  onDragStart: () => {},
  dragHandlers: { onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {}, onDragEnd: () => {} },
};

function renderPlans() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  // confirm() immediately runs the callback so destructive flows execute.
  const confirm = vi.fn((_msg: string, cb: () => void) => cb());
  render(
    <QueryClientProvider client={qc}>
      <TestPlansSection dark={false} confirm={confirm} {...DRAG_PROPS} />
    </QueryClientProvider>,
  );
  return { invalidateSpy, confirm };
}

beforeEach(() => vi.clearAllMocks());

describe("TestPlansSection", () => {
  it("lists test plans per story when expanded", async () => {
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: /Test Plans/i }));

    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    expect(screen.getByText("Logout")).toBeInTheDocument();
    expect(screen.getByText("US#10")).toBeInTheDocument();
    expect(screen.getByText("US#11")).toBeInTheDocument();
  });

  it("deleting a plan scopes the cache invalidation to the project", async () => {
    const { invalidateSpy } = renderPlans();
    fireEvent.click(screen.getByRole("button", { name: /Test Plans/i }));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());

    fireEvent.click(screen.getAllByTitle("Delete test plan")[0]);

    await waitFor(() => expect(vi.mocked(deleteTestPlan)).toHaveBeenCalledWith(expect.anything(), 10));
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase4", "test-plans", 7]);
  });

  it("edits a plan in the view modal and saves it", async () => {
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: /Test Plans/i }));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());

    fireEvent.click(screen.getAllByTitle("View / edit test plan")[0]);
    await waitFor(() => expect(vi.mocked(getTestPlan)).toHaveBeenCalledWith(expect.anything(), 10));

    fireEvent.click(screen.getByTitle("Edit"));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "## Plan\nedited" } });
    fireEvent.click(screen.getByTitle("Save changes"));

    await waitFor(() =>
      expect(vi.mocked(saveTestPlan)).toHaveBeenCalledWith(expect.anything(), 10, "## Plan\nedited"),
    );
  });

  it("deleting all plans calls delete for every story and invalidates the cache", async () => {
    const { invalidateSpy, confirm } = renderPlans();
    fireEvent.click(screen.getByRole("button", { name: /Test Plans/i }));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Delete all/i }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Delete all 2"), expect.any(Function));
    await waitFor(() => expect(vi.mocked(deleteTestPlan)).toHaveBeenCalledWith(expect.anything(), 10));
    await waitFor(() => expect(vi.mocked(deleteTestPlan)).toHaveBeenCalledWith(expect.anything(), 11));
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase4", "test-plans", 7]);
  });

  it("shows an empty state when there are no test plans", async () => {
    const { listTestPlans } = await import("@/lib/api/phase4");
    vi.mocked(listTestPlans).mockResolvedValueOnce({ test_plans: [] });
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: /Test Plans/i }));
    await waitFor(() => expect(screen.getByText(/No test plans saved/i)).toBeInTheDocument());
  });
});
