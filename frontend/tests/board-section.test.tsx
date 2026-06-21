import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const STORY = { id: 101, ref: 1, subject: "User Login", description: "", status: 1, version: 1, tags: [] };
const EPIC = { id: 10, ref: 1, subject: "Authentication", description: "", version: 1, tags: [], stories: [STORY] };

const getStory = vi.fn().mockResolvedValue({
  id: 101, ref: 1, subject: "User Login", description: "HYDRATED FROM DETAIL", status: 1, version: 2, tags: [],
});

vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 7, pmTool: "taiga", pmToken: "tok", pmProjectId: "slug" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/pm-factory", () => ({ getPmAdapter: () => ({ getStory, getEpic: vi.fn() }) }));
vi.mock("@/lib/api/workspace", () => ({ toPmCtx: () => ({ projectId: "7" }) }));

const idleMut = { mutate: vi.fn(), isPending: false };
vi.mock("@/lib/hooks/use-workspace", () => ({
  useBoard: () => ({ data: [EPIC], isLoading: false }),
  useDeleteEpic: () => idleMut,
  useDeleteStory: () => idleMut,
  useRebuildStoryIndex: () => idleMut,
  useUpdateEpic: () => idleMut,
  useUpdateStory: () => idleMut,
  useCreateEpic: () => idleMut,
  useCreateStory: () => idleMut,
  useStoryStatuses: () => ({ data: [{ id: 1, name: "New" }, { id: 2, name: "Done" }] }),
  useStoryPhaseStatus: () => ({ data: { phase_status: "implementation" }, isLoading: false }),
  useSetStoryPhaseStatus: () => idleMut,
  useAcknowledgeSpecDrift: () => idleMut,
  useStoryIndexStats: () => ({
    data: {
      total: 1, phase2_designed: 0, phase3_proposed: 0, phase4_tested: 0, phase4_passed: 0,
      phase5_deployed: 0, spec_drift: 0, drifted_story_ids: [],
      conformance_regressed: 1, regressed_story_ids: [101],
    },
  }),
}));
vi.mock("@/lib/hooks/use-phase6", () => ({ useAcknowledgeRegression: () => idleMut }));

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
});
