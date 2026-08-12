import { beforeEach, describe, expect, it, vi } from "vitest";
import { planeAdapter } from "@/lib/api/plane-adapter";
import {
  mintId,
  PlaneVersionConflictError,
  planeGetEpic,
  planeGetStory,
  planeUpdateEpic,
  planeUpdateStory,
  planeUpdateTask,
} from "@/lib/api/plane-direct";
import type { PmRequestContext } from "@/lib/api/pm-types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("Plane soft optimistic-concurrency (PlaneVersionConflictError)", () => {
  // -------------------------------------------------------------------------
  // planeUpdateStory
  // -------------------------------------------------------------------------

  it("planeUpdateStory succeeds when expectedVersion matches the current updated_at", async () => {
    const storyId = String(mintId("story-conflict-match"));
    mockFetch
      // assertNotStale's pre-write GET
      .mockResolvedValueOnce(makeResponse(200, { id: "story-conflict-match", updated_at: "v1" }))
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-conflict-match", name: "Updated", sequence_id: 9, updated_at: "v2",
        labels: [], state: null, parent: null,
      }));

    const story = await planeUpdateStory(
      "key", "my-team", "proj-uuid", storyId, { subject: "Updated" }, "https://api.plane.so", "v1",
    );

    expect(story.subject).toBe("Updated");
    expect(story.version).toBe("v2");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
  });

  it("planeUpdateStory throws PlaneVersionConflictError when expectedVersion doesn't match, and never PATCHes", async () => {
    const storyId = String(mintId("story-conflict-mismatch"));
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "story-conflict-mismatch", updated_at: "v2" }));

    await expect(
      planeUpdateStory("key", "my-team", "proj-uuid", storyId, { subject: "Updated" }, "https://api.plane.so", "v1"),
    ).rejects.toBeInstanceOf(PlaneVersionConflictError);

    // Only the staleness-check GET happened — no PATCH call at all.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("planeUpdateStory with no expectedVersion skips the staleness GET entirely (backward-compat path)", async () => {
    const storyId = String(mintId("story-conflict-noversion"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH — first call now, no pre-check GET
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-conflict-noversion", name: "Updated", sequence_id: 9, updated_at: "v3",
        labels: [], state: null, parent: null,
      }));

    const story = await planeUpdateStory(
      "key", "my-team", "proj-uuid", storyId, { subject: "Updated" }, "https://api.plane.so",
    );

    expect(story.subject).toBe("Updated");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  // -------------------------------------------------------------------------
  // planeUpdateEpic (native Epics path)
  // -------------------------------------------------------------------------

  it("planeUpdateEpic succeeds when expectedVersion matches", async () => {
    const epicId = String(mintId("epic-conflict-match"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { id: "epic-conflict-match", updated_at: "e1" })) // staleness GET
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH
      .mockResolvedValueOnce(makeResponse(200, { id: "epic-conflict-match", name: "Renamed", sequence_id: 3, updated_at: "e2" }));

    const epic = await planeUpdateEpic(
      "key", "my-team", "proj-uuid", epicId, { subject: "Renamed" }, "https://api.plane.so", "e1",
    );

    expect(epic.subject).toBe("Renamed");
    expect(epic.version).toBe("e2");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("planeUpdateEpic throws PlaneVersionConflictError on mismatch and never PATCHes", async () => {
    const epicId = String(mintId("epic-conflict-mismatch"));
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "epic-conflict-mismatch", updated_at: "e-current" }));

    await expect(
      planeUpdateEpic("key", "my-team", "proj-uuid", epicId, { subject: "Renamed" }, "https://api.plane.so", "e-stale"),
    ).rejects.toBeInstanceOf(PlaneVersionConflictError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("planeUpdateEpic with no expectedVersion skips the staleness GET", async () => {
    const epicId = String(mintId("epic-conflict-noversion"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH
      .mockResolvedValueOnce(makeResponse(200, { id: "epic-conflict-noversion", name: "Renamed", sequence_id: 3, updated_at: "e3" }));

    await planeUpdateEpic("key", "my-team", "proj-uuid", epicId, { subject: "Renamed" }, "https://api.plane.so");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  // -------------------------------------------------------------------------
  // planeUpdateTask
  // -------------------------------------------------------------------------

  it("planeUpdateTask succeeds when expectedVersion matches", async () => {
    const taskId = String(mintId("task-conflict-match"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { id: "task-conflict-match", updated_at: "t1" })) // staleness GET
      .mockResolvedValueOnce(makeResponse(200, {})); // PATCH

    await planeUpdateTask(
      "key", "my-team", "proj-uuid", taskId, { subject: "Renamed" }, "https://api.plane.so", "t1",
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
  });

  it("planeUpdateTask throws PlaneVersionConflictError on mismatch and never PATCHes", async () => {
    const taskId = String(mintId("task-conflict-mismatch"));
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "task-conflict-mismatch", updated_at: "t-current" }));

    await expect(
      planeUpdateTask("key", "my-team", "proj-uuid", taskId, { subject: "Renamed" }, "https://api.plane.so", "t-stale"),
    ).rejects.toBeInstanceOf(PlaneVersionConflictError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("planeUpdateTask with no expectedVersion skips the staleness GET", async () => {
    const taskId = String(mintId("task-conflict-noversion"));
    mockFetch.mockResolvedValueOnce(makeResponse(200, {})); // PATCH only

    await planeUpdateTask("key", "my-team", "proj-uuid", taskId, { subject: "Renamed" }, "https://api.plane.so");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  // -------------------------------------------------------------------------
  // version normalization on reads
  // -------------------------------------------------------------------------

  it("planeGetStory's normalized Story carries updated_at as version", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      id: "story-version-read", name: "A story", sequence_id: 5, updated_at: "2026-08-01T00:00:00Z",
    }));

    const story = await planeGetStory("key", "my-team", "proj-uuid", String(mintId("story-version-read")), "https://api.plane.so");

    expect(story.version).toBe("2026-08-01T00:00:00Z");
  });

  it("planeGetStory's normalized Story falls back to '' when updated_at is absent", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      id: "story-version-missing", name: "A story", sequence_id: 5,
    }));

    const story = await planeGetStory("key", "my-team", "proj-uuid", String(mintId("story-version-missing")), "https://api.plane.so");

    expect(story.version).toBe("");
  });

  it("planeGetEpic's normalized Epic carries updated_at as version", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      id: "epic-version-read", name: "An epic", sequence_id: 2, updated_at: "2026-08-02T00:00:00Z",
    }));

    const epic = await planeGetEpic("key", "my-team", "proj-uuid", String(mintId("epic-version-read")), "https://api.plane.so");

    expect(epic.version).toBe("2026-08-02T00:00:00Z");
  });

  it("planeGetEpic's normalized Epic falls back to '' when updated_at is absent", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      id: "epic-version-missing", name: "An epic", sequence_id: 2,
    }));

    const epic = await planeGetEpic("key", "my-team", "proj-uuid", String(mintId("epic-version-missing")), "https://api.plane.so");

    expect(epic.version).toBe("");
  });
});

describe("planeAdapter.isPmVersionConflict", () => {
  it("returns true for a PlaneVersionConflictError", () => {
    expect(planeAdapter.isPmVersionConflict(new PlaneVersionConflictError())).toBe(true);
  });

  it("returns false for any other error", () => {
    expect(planeAdapter.isPmVersionConflict(new Error("other"))).toBe(false);
  });
});

describe("planeAdapter version wiring", () => {
  const ctx: PmRequestContext = { token: "key", baseUrl: "https://api.plane.so", workspaceSlug: "my-team", projectId: "proj-uuid" };

  it("updateStory called with version '' (falsy) passes expectedVersion=undefined through — no staleness-check GET", async () => {
    const storyId = String(mintId("story-adapter-falsy-version"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH — first call, no pre-check GET
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-adapter-falsy-version", name: "Updated", sequence_id: 1, updated_at: "v9",
        labels: [], state: null, parent: null,
      }));

    await planeAdapter.updateStory(ctx, storyId, "", { subject: "Updated" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("updateStory called with a real version string wires it through as expectedVersion", async () => {
    const storyId = String(mintId("story-adapter-real-version"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { id: "story-adapter-real-version", updated_at: "v-stale" }));

    await expect(
      planeAdapter.updateStory(ctx, storyId, "v-current-mismatch", { subject: "Updated" }),
    ).rejects.toBeInstanceOf(PlaneVersionConflictError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
