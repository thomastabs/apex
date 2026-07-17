import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/stores/session-store", () => ({
  useApiContext: () => ({ projectId: 7, pmTool: "taiga", pmToken: "tok" }),
}));
vi.mock("@/lib/hooks/use-workspace", () => ({ useAutoSyncStoryIndex: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/phase3", () => ({
  listPacks: vi.fn().mockResolvedValue({
    packs: [
      { story_id: 10, story_title: "User Login", task_id: 1, chars: 1500 },
      { story_id: 10, story_title: "User Login", task_id: 2, chars: 800 },
      { story_id: 11, story_title: "Logout", task_id: 3, chars: 400 },
    ],
  }),
  getProposals: vi.fn().mockResolvedValue({
    story_id: 10,
    proposals: [{ task_id: 1, proposal_md: "## Pack\nstep 1" }],
  }),
  deleteProposal: vi.fn().mockResolvedValue({ ok: true }),
  saveProposal: vi.fn().mockResolvedValue({ ok: true }),
}));

import { PacksSection } from "@/components/sidebar/packs-section";
import { deleteProposal, saveProposal } from "@/lib/api/phase3";

const DRAG_PROPS = {
  shellClass: "",
  onDragStart: () => {},
  dragHandlers: { onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {}, onDragEnd: () => {} },
};

function renderPacks() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  // confirm() immediately runs the callback so destructive flows execute.
  const confirm = vi.fn((_msg: string, cb: () => void) => cb());
  render(
    <QueryClientProvider client={qc}>
      <PacksSection dark={false} confirm={confirm} {...DRAG_PROPS} />
    </QueryClientProvider>,
  );
  return { invalidateSpy, confirm };
}

beforeEach(() => vi.clearAllMocks());

const taskRow = (taskId: number) =>
  screen
    .getAllByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim().startsWith(`Task ${taskId}`) ?? false)
    .find((element) => element.tagName === "SPAN" && element.className.includes("flex-1"));

describe("PacksSection", () => {
  it("groups developer packs by story when expanded", async () => {
    renderPacks();
    fireEvent.click(screen.getByRole("button", { name: /Developer Packs/i }));

    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    // Two stories grouped; US#10 has two task rows, US#11 one.
    expect(screen.getByText("Logout")).toBeInTheDocument();
    expect(taskRow(1)).toBeInTheDocument();
    expect(taskRow(2)).toBeInTheDocument();
    expect(taskRow(3)).toBeInTheDocument();
  });

  it("deleting a pack scopes the packs-cache invalidation to the project", async () => {
    const { invalidateSpy } = renderPacks();
    fireEvent.click(screen.getByRole("button", { name: /Developer Packs/i }));
    await waitFor(() => expect(taskRow(1)).toBeInTheDocument());

    // The per-row delete button (title "Delete pack").
    fireEvent.click(screen.getAllByTitle("Delete pack")[0]);

    await waitFor(() => expect(vi.mocked(deleteProposal)).toHaveBeenCalledWith(expect.anything(), 10, 1));
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["phase3", "packs", 7]);
  });

  it("edits a pack in the view modal and saves it", async () => {
    renderPacks();
    fireEvent.click(screen.getByRole("button", { name: /Developer Packs/i }));
    await waitFor(() => expect(taskRow(1)).toBeInTheDocument());

    fireEvent.click(screen.getAllByTitle("View pack")[0]);
    await waitFor(() => expect(screen.getByTitle("Edit")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Edit"));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "## Pack\nedited" } });
    fireEvent.click(screen.getByTitle("Save changes"));

    await waitFor(() =>
      expect(vi.mocked(saveProposal)).toHaveBeenCalledWith(expect.anything(), {
        story_id: 10,
        task_id: 1,
        proposal_md: "## Pack\nedited",
      }),
    );
  });

  it("shows an empty state when there are no packs", async () => {
    const { listPacks } = await import("@/lib/api/phase3");
    vi.mocked(listPacks).mockResolvedValueOnce({ packs: [] });
    renderPacks();
    fireEvent.click(screen.getByRole("button", { name: /Developer Packs/i }));
    await waitFor(() => expect(screen.getByText(/No developer packs saved/i)).toBeInTheDocument());
  });
});
