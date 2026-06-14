import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the adapter factory so we can capture the PM context the push builds.
const createEpic = vi.fn().mockResolvedValue({ id: 99, subject: "Core", version: 1 });
const createStory = vi.fn().mockResolvedValue({ id: 5, ref: 1, version: 1 });
const updateStory = vi.fn().mockResolvedValue({ id: 5, ref: 1, version: 2 });
const listStoryStatuses = vi.fn().mockResolvedValue([]);
const getEpic = vi.fn();

vi.mock("@/lib/api/pm-factory", () => ({
  getPmAdapter: () => ({ createEpic, createStory, updateStory, listStoryStatuses, getEpic }),
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
});
