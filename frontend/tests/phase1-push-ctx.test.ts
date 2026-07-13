import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the adapter factory so we can capture the PM context the push builds.
const createEpic = vi.fn().mockResolvedValue({ id: 99, subject: "Core", description: "", version: 1 });
const createStory = vi.fn().mockResolvedValue({ id: 5, ref: 1, version: 1 });
const updateStory = vi.fn().mockResolvedValue({ id: 5, ref: 1, version: 2 });
const updateEpic = vi.fn().mockResolvedValue({ id: 99, subject: "Core", description: "updated", version: 2 });
const listStoryStatuses = vi.fn().mockResolvedValue([]);
const getEpic = vi.fn();

vi.mock("@/lib/api/pm-factory", () => ({
  getPmAdapter: () => ({ createEpic, createStory, updateStory, updateEpic, listStoryStatuses, getEpic }),
}));
vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("@/lib/api/taiga-direct", () => ({ taigaGetProject: vi.fn().mockResolvedValue({ slug: "phase5" }) }));

import { pushPhase1Stories } from "@/lib/api/phase1";

const CONTEXT = {
  pmTool: "taiga",
  taigaToken: "tok",
  taigaApiUrl: "https://api.taiga.io/api/v1",
  projectId: 7,
  // The slug — Taiga must NOT use this as the REST project id.
  pmProjectId: "phase5",
} as never;

beforeEach(() => vi.clearAllMocks());

describe("phase1 push PM context", () => {
  it("sends the numeric Taiga project id to createEpic, not the slug", async () => {
    await pushPhase1Stories(CONTEXT, {
      epic_subject: "Core Text Editor Interface",
      epic_description: "desc",
      stories: [{ title: "Story A", gherkin: "Feature: X", size: "XS" }],
    } as never);

    expect(createEpic).toHaveBeenCalledTimes(1);
    const ctx = createEpic.mock.calls[0][0];
    // The regression: pmProjectId (slug) leaked here, so n(projectId) was
    // NaN → serialized as project:null → Taiga 400 on epic create.
    expect(ctx.projectId).toBe("7");
    expect(Number(ctx.projectId)).toBe(7);
    expect(ctx.projectId).not.toBe("phase5");
  });

  it("writes answered clarifications to the epic description via updateEpic", async () => {
    await pushPhase1Stories(CONTEXT, {
      epic_subject: "Core Text Editor Interface",
      epic_description: "desc",
      stories: [{ title: "Story A", gherkin: "Feature: X", size: "XS" }],
      clarifications: [{ question: "What happens on timeout?", answer: "Session expires after 30s" }],
    } as never);

    expect(updateEpic).toHaveBeenCalledTimes(1);
    const [, epicId, version, fields] = updateEpic.mock.calls[0];
    expect(epicId).toBe("99");
    expect(version).toBe(1);
    expect(fields.description).toContain("What happens on timeout?");
    expect(fields.description).toContain("Session expires after 30s");
  });

  it("skips updateEpic when there are no clarifications", async () => {
    await pushPhase1Stories(CONTEXT, {
      epic_subject: "Core Text Editor Interface",
      epic_description: "desc",
      stories: [{ title: "Story A", gherkin: "Feature: X", size: "XS" }],
    } as never);

    expect(updateEpic).not.toHaveBeenCalled();
  });

  it("still succeeds if the clarifications write-back rejects (best-effort)", async () => {
    updateEpic.mockRejectedValueOnce(new Error("Taiga 500"));

    await expect(
      pushPhase1Stories(CONTEXT, {
        epic_subject: "Core Text Editor Interface",
        epic_description: "desc",
        stories: [{ title: "Story A", gherkin: "Feature: X", size: "XS" }],
        clarifications: [{ question: "Q", answer: "A" }],
      } as never),
    ).resolves.toBeDefined();
  });
});
