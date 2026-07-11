import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { toast } from "sonner";

const STORY = { id: 101, ref: 1, subject: "User Login", description: "", status: 1, version: 1, tags: [] };
const EPIC = { id: 10, ref: 1, subject: "Authentication", description: "", version: 1, tags: [], stories: [STORY] };

const getStory = vi.fn().mockResolvedValue({
  id: 101, ref: 1, subject: "User Login", description: "HYDRATED FROM DETAIL", status: 1, version: 2, tags: [],
});

vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 7, pmTool: "taiga", pmToken: "tok", pmProjectId: "slug" }),
  useFigmaContext: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/pm-factory", () => ({ getPmAdapter: () => ({ getStory, getEpic: vi.fn() }) }));
vi.mock("@/lib/api/workspace", () => ({ toPmCtx: () => ({ projectId: "7" }) }));
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const idleMut = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const updateStoryMut = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
const setApexStatusMut = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
vi.mock("@/lib/hooks/use-workspace", () => ({
  useBoard: () => ({ data: [EPIC], isLoading: false, refetch: vi.fn() }),
  useDeleteEpic: () => idleMut,
  useDeleteStory: () => idleMut,
  useRebuildStoryIndex: () => idleMut,
  useUpdateEpic: () => idleMut,
  useUpdateStory: () => updateStoryMut,
  useCreateEpic: () => idleMut,
  useCreateStory: () => idleMut,
  useStoryStatuses: () => ({ data: [{ id: 1, name: "New" }, { id: 2, name: "Done" }] }),
  useStoryPhaseStatus: () => ({ data: { phase_status: "implementation" }, isLoading: false }),
  useSetStoryPhaseStatus: () => setApexStatusMut,
  useAcknowledgeBacktrace: () => idleMut,
  useSetStoryFigmaLink: () => idleMut,
  useAcknowledgeFigmaChange: () => idleMut,
  useStoryIndexStats: () => ({
    refetch: vi.fn(),
    data: {
      total: 1, phase2_designed: 0, phase3_proposed: 0, phase4_tested: 0, phase4_passed: 0,
      phase5_deployed: 0,
      conformance_regressed: 1, regressed_story_ids: [101],
      trace_flagged: 1, trace_story_ids: [101],
      trace_flags: [{ story_id: 101, phase: "gherkin_locked", phase_label: "Phase 1", reason: "scenario untested — re-examine its Gherkin" }],
    },
  }),
}));
vi.mock("@/lib/hooks/use-phase6", () => ({ useAcknowledgeRegression: () => idleMut }));
vi.mock("@/lib/api/analytics", () => ({ getAnalyticsSummary: vi.fn().mockResolvedValue({ stories: [] }) }));

import { BoardSection } from "@/components/sidebar/board-section";

const DRAG_PROPS = {
  shellClass: "",
  onDragStart: () => {},
  dragHandlers: { onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {}, onDragEnd: () => {} },
};

function renderBoard() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <BoardSection dark={false} projectId={7} confirm={(_m, cb) => cb()} {...DRAG_PROPS} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("BoardSection edit dialog", () => {
  it("hydrates the story description from the detail endpoint (no silent wipe)", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Epics & Stories/i }));   // open board
    fireEvent.click(screen.getByRole("button", { name: /Authentication/i }));      // expand epic
    fireEvent.click(screen.getByTitle("Edit story"));                              // open StoryDialog

    // The list payload had an empty description; the dialog must replace it with
    // the detail-endpoint value so a save doesn't blank the real description.
    const textarea = await screen.findByPlaceholderText(/Describe the story/i);
    await waitFor(() => expect(textarea).toHaveValue("HYDRATED FROM DETAIL"));
    expect(getStory).toHaveBeenCalledWith(expect.anything(), "101");
  });

  it("shows a regression badge for a story in regressed_story_ids", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Epics & Stories/i }));
    fireEvent.click(screen.getByRole("button", { name: /Authentication/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Conformance regressed/i)).toBeInTheDocument(),
    );
  });

  it("shows a backward-trace badge and the dialog re-opens the source phase", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Epics & Stories/i }));
    fireEvent.click(screen.getByRole("button", { name: /Authentication/i }));
    await waitFor(() => expect(screen.getByLabelText(/Backward trace/i)).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Edit story"));
    const reopen = await screen.findByRole("button", { name: /^Re-open Phase 1$/i });
    expect(screen.getByText(/scenario untested/i)).toBeInTheDocument();
    fireEvent.click(reopen);
    expect(pushMock).toHaveBeenCalledWith("/phase1");
  });

  it("updates Apex status independently even when the PM story save fails (no more silent no-op)", async () => {
    updateStoryMut.mutateAsync.mockRejectedValueOnce(new Error("network down"));
    setApexStatusMut.mutateAsync.mockResolvedValueOnce(undefined);

    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Epics & Stories/i }));
    fireEvent.click(screen.getByRole("button", { name: /Authentication/i }));
    fireEvent.click(screen.getByTitle("Edit story"));
    await screen.findByPlaceholderText(/Describe the story/i);

    const apexSelect = screen.getByText("Deployed").closest("select") as HTMLSelectElement;
    fireEvent.change(apexSelect, { target: { value: "deployed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(setApexStatusMut.mutateAsync).toHaveBeenCalledWith({ storyId: 101, phaseStatus: "deployed" });
    await waitFor(() => expect(updateStoryMut.mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Apex status updated."));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save story."));
  });
});
