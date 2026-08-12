import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaneApiBaseUrl,
  isPlaneStateClosed,
  mintId,
  planeCreateEpic,
  planeCreateProject,
  planeCreateStory,
  planeCreateTask,
  planeDeleteEpic,
  planeDeleteProject,
  planeGetBoard,
  planeGetMe,
  planeGetProjectTasks,
  planeGetStory,
  planeGetUsers,
  planeInviteUser,
  planeListIssues,
  planeListProjects,
  planeListStoryStatuses,
  planeRemoveMember,
  planeUpdateMemberRole,
  planeUpdateProject,
  planeUpdateStory,
  planeUpdateTask,
  resolveId,
} from "@/lib/api/plane-direct";

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

describe("plane direct API", () => {
  it("normalizes the base URL (strips trailing slash and /api/v1 suffix)", () => {
    expect(getPlaneApiBaseUrl("https://api.plane.so")).toBe("https://api.plane.so");
    expect(getPlaneApiBaseUrl("https://api.plane.so/")).toBe("https://api.plane.so");
    expect(getPlaneApiBaseUrl("https://api.plane.so/api/v1")).toBe("https://api.plane.so");
    expect(getPlaneApiBaseUrl()).toBe("https://api.plane.so");
  });

  it("derives is_closed from the exact 5-value state.group enum", () => {
    expect(isPlaneStateClosed("completed")).toBe(true);
    expect(isPlaneStateClosed("cancelled")).toBe(true);
    expect(isPlaneStateClosed("backlog")).toBe(false);
    expect(isPlaneStateClosed("unstarted")).toBe(false);
    expect(isPlaneStateClosed("started")).toBe(false);
  });

  it("sends X-Api-Key + X-Plane-Url, not Authorization — the whole point of the Plane header shape", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "u1", display_name: "tomas", email: "t@x.com" }));
    await planeGetMe("mykey", "https://plane.example.test");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/pm/plane/users/me/");
    expect(init.headers["X-Api-Key"]).toBe("mykey");
    expect(init.headers["X-Plane-Url"]).toBe("https://plane.example.test");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("mints a stable synthetic int id per UUID, reversible via resolveId", () => {
    const a = mintId("11111111-1111-1111-1111-111111111111");
    const b = mintId("22222222-2222-2222-2222-222222222222");
    const aAgain = mintId("11111111-1111-1111-1111-111111111111");
    expect(a).toBe(aAgain);
    expect(a).not.toBe(b);
    expect(resolveId(a)).toBe("11111111-1111-1111-1111-111111111111");
    expect(resolveId(String(b))).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("resolveId throws a clear error for an id never minted this session", () => {
    expect(() => resolveId(999999)).toThrow(/board must be re-fetched/);
  });

  it("listProjects follows pages using next_page_results, not next_cursor's truthiness", async () => {
    // Real Plane responses always carry a non-null next_cursor string, even on
    // the last page — next_page_results is the actual continuation signal
    // (live-confirmed; see planeFetchAllPages's docstring for the bug this
    // guards against: the old code paginated 20x on a 1-page result).
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "p1", name: "One", identifier: "ONE" }], next_cursor: "cur2", next_page_results: true }))
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "p2", name: "Two", identifier: "TWO" }], next_cursor: "cur2-still-non-null", next_page_results: false }));

    const projects = await planeListProjects("key", "my-team", "https://api.plane.so");

    expect(projects.map((p) => p.name)).toEqual(["One", "Two"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("/workspaces/my-team/projects/");
    expect(mockFetch.mock.calls[1][0]).toContain("cursor=cur2");
  });

  it("uses the plain description field on Projects/Modules — they have no description_stripped at all (live-confirmed)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [{
        id: "p1", name: "One", identifier: "ONE",
        description: "Plain description text.",
        description_html: "<p>Should NOT be used — plain description takes priority.</p>",
      }],
      next_cursor: null,
    }));
    const [project] = await planeListProjects("key", "my-team", "https://api.plane.so");
    expect(project.description).toBe("Plain description text.");
  });

  // -------------------------------------------------------------------------
  // Project CRUD (phase 5h). Field names/shapes per plane-direct.ts's own
  // header comment for this section — asserting the exact request body/URL
  // shape, not just that the promise resolves (mocks alone caught 0 of the 4
  // real API-shape bugs found historically in this module).
  // -------------------------------------------------------------------------

  it("planeCreateProject POSTs {name, identifier, description} to the workspace projects endpoint and normalizes the response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(201, {
      id: "proj-new-uuid", name: "New Project", identifier: "NEWP", description: "a new project",
    }));

    const project = await planeCreateProject("key", "my-team", "New Project", "a new project", "NEWP", "https://api.plane.so");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/workspaces/my-team/projects/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "New Project", identifier: "NEWP", description: "a new project" });
    expect(project.name).toBe("New Project");
    expect(project.slug).toBe("NEWP");
    expect(project.description).toBe("a new project");
    expect(resolveId(project.id)).toBe("proj-new-uuid");
  });

  it("planeUpdateProject resolves the minted id to the real UUID, sends only the provided fields, and re-fetches+normalizes afterward", async () => {
    const minted = String(mintId("proj-update-uuid"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH response (ignored)
      .mockResolvedValueOnce(makeResponse(200, {
        id: "proj-update-uuid", name: "Renamed", identifier: "ORIG", description: "old description",
      }));

    const project = await planeUpdateProject("key", "my-team", minted, { name: "Renamed" }, "https://api.plane.so");

    const [patchUrl, patchInit] = mockFetch.mock.calls[0];
    expect(patchUrl).toContain("/workspaces/my-team/projects/proj-update-uuid/");
    expect(patchInit.method).toBe("PATCH");
    // Only `name` was passed — `description` must NOT appear in the PATCH body.
    expect(JSON.parse(patchInit.body)).toEqual({ name: "Renamed" });
    const [refetchUrl, refetchInit] = mockFetch.mock.calls[1];
    expect(refetchUrl).toContain("/workspaces/my-team/projects/proj-update-uuid/");
    expect(refetchInit.method ?? "GET").toBe("GET");
    expect(project.name).toBe("Renamed");
    expect(project.description).toBe("old description");
  });

  it("planeUpdateProject includes description too when both fields are provided", async () => {
    const minted = String(mintId("proj-update-uuid-2"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, { id: "proj-update-uuid-2", name: "N", identifier: "X", description: "D" }));

    await planeUpdateProject("key", "my-team", minted, { name: "N", description: "D" }, "https://api.plane.so");

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ name: "N", description: "D" });
  });

  it("planeUpdateProject throws the 'Unknown Plane id' resolveId error for an id never minted this session, without ever calling fetch", async () => {
    await expect(
      planeUpdateProject("key", "my-team", "999999999", { name: "x" }, "https://api.plane.so"),
    ).rejects.toThrow(/board must be re-fetched/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("planeDeleteProject resolves the id, DELETEs the right URL, and returns {ok: true}", async () => {
    const minted = String(mintId("proj-delete-uuid"));
    mockFetch.mockResolvedValueOnce(makeResponse(204, {}));

    const result = await planeDeleteProject("key", "my-team", minted, "https://api.plane.so");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/workspaces/my-team/projects/proj-delete-uuid/");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ ok: true });
  });

  it("planeDeleteProject throws the 'Unknown Plane id' resolveId error for a never-minted id, without ever calling fetch", async () => {
    await expect(
      planeDeleteProject("key", "my-team", "888888888", "https://api.plane.so"),
    ).rejects.toThrow(/board must be re-fetched/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retries once on 429 using X-RateLimit-Reset, then succeeds", async () => {
    const resetEpoch = Math.floor(Date.now() / 1000); // already past — near-zero wait
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, { "X-RateLimit-Reset": String(resetEpoch) }))
      .mockResolvedValueOnce(makeResponse(200, { id: "u1", display_name: "tomas", email: "" }));

    const me = await planeGetMe("key", "https://api.plane.so");

    expect(me.username).toBe("tomas");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getBoard falls back to Modules when Epics is gated (402, the real Plane Cloud status — live-confirmed against a free-tier workspace, body {error, error_code}, not {detail})", async () => {
    mockFetch
      // epics probe -> 402 (paid-tier gate, the actual live-confirmed status)
      .mockResolvedValueOnce(makeResponse(402, { error: "Payment required", error_code: 1999 }))
      // modules list
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "mod1", name: "Module One" }], next_cursor: null }))
      // module-issues join
      .mockResolvedValueOnce(makeResponse(200, {
        results: [{ id: "wi1", name: "Work item one", sequence_id: 7, state: "state-uuid" }],
        next_cursor: null,
      }));

    const board = await planeGetBoard("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(board).toHaveLength(1);
    expect(board[0].subject).toBe("Module One");
    expect(board[0].pm_epic_id).toBe("mod1");
    expect(board[0].stories).toHaveLength(1);
    expect(board[0].stories[0].subject).toBe("Work item one");
    expect(board[0].stories[0].ref).toBe(7);
    expect(board[0].stories[0].pm_story_id).toBe("wi1");
    expect(mockFetch.mock.calls[0][0]).toContain("/epics/");
    expect(mockFetch.mock.calls[1][0]).toContain("/modules/");
    expect(mockFetch.mock.calls[2][0]).toContain("/modules/mod1/module-issues/");
  });

  it("getBoard also falls back on 403/404 — defensive, self-hosted Community Edition's exact status for this gate is unconfirmed", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(403, { detail: "not available on this plan" }))
      .mockResolvedValueOnce(makeResponse(200, { results: [], next_cursor: null }));
    const board = await planeGetBoard("key", "my-team", "proj-uuid", "https://api.plane.so");
    expect(board).toEqual([]);
  });

  it("getBoard uses native Epics when available (no fallback)", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "ep1", name: "Epic One", sequence_id: 3 }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(200, { results: [], next_cursor: null }));

    const board = await planeGetBoard("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(board[0].ref).toBe(3);
    expect(mockFetch.mock.calls[1][0]).toContain("/epics/ep1/issues/");
  });

  it("propagates a non-403/404 epics error instead of silently falling back to Modules", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, { detail: "server error" }));
    await expect(planeGetBoard("key", "my-team", "proj-uuid", "https://api.plane.so")).rejects.toMatchObject({ status: 500 });
  });

  it("getStory resolves a previously-minted id back to its UUID for the API call", async () => {
    const minted = mintId("story-uuid-123");
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "story-uuid-123", name: "A story", sequence_id: 5 }));

    const story = await planeGetStory("key", "my-team", "proj-uuid", String(minted), "https://api.plane.so");

    expect(story.subject).toBe("A story");
    expect(mockFetch.mock.calls[0][0]).toContain("/work-items/story-uuid-123/");
  });

  it("listStoryStatuses surfaces the raw state group for is_closed derivation upstream", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [{ id: "s1", name: "Done", color: "#00ff00", group: "completed" }],
      next_cursor: null,
    }));
    const statuses = await planeListStoryStatuses("key", "my-team", "proj-uuid", "https://api.plane.so");
    expect(statuses[0].group).toBe("completed");
  });

  // -------------------------------------------------------------------------
  // Write paths (Phase 3). Field names below are live-confirmed against a
  // real Plane Cloud workspace (create -> verify -> delete, cleaned up) —
  // see plane_integration_plan memory's phase-3 section for the exact probe.
  // -------------------------------------------------------------------------

  it("createEpic posts name/description_html/label_ids to the Epics endpoint when available", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(201, { id: "epic-new", name: "E1", sequence_id: 2 }));
    const epic = await planeCreateEpic("key", "my-team", "proj-uuid", "E1", "desc", [], "https://api.plane.so");
    expect(epic.subject).toBe("E1");
    expect(epic.ref).toBe(2);
    expect(epic.pm_epic_id).toBe("epic-new");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/epics/");
    expect(JSON.parse(init.body)).toEqual({ name: "E1", description_html: "<p>desc</p>", label_ids: [] });
  });

  it("createEpic falls back to Modules (plain description, no label_ids) when Epics is gated", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(402, { error: "Payment required", error_code: 1999 }))
      .mockResolvedValueOnce(makeResponse(201, { id: "mod-new", name: "E1" }));
    const epic = await planeCreateEpic("key", "my-team", "proj-uuid", "E1", "desc", ["tag"], "https://api.plane.so");
    expect(epic.pm_epic_id).toBe("mod-new");
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toContain("/modules/");
    // Modules have no Label concept in Apex's model — tags are dropped on this path.
    expect(JSON.parse(init.body)).toEqual({ name: "E1", description: "desc" });
  });

  it("deleteEpic deletes every joined work item before the epic itself (Taiga-parity cascade)", async () => {
    const epicId = String(mintId("epic-cascade-1"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "wi-a" }, { id: "wi-b" }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(204, {}))
      .mockResolvedValueOnce(makeResponse(204, {}))
      .mockResolvedValueOnce(makeResponse(204, {}));

    const result = await planeDeleteEpic("key", "my-team", "proj-uuid", epicId, "https://api.plane.so");

    expect(result).toEqual({ ok: true, stories_deleted: 2, story_failures: [] });
    expect(mockFetch.mock.calls[0][0]).toContain("/epics/epic-cascade-1/issues/");
    expect(mockFetch.mock.calls[1][0]).toContain("/work-items/wi-a/");
    expect(mockFetch.mock.calls[2][0]).toContain("/work-items/wi-b/");
    expect(mockFetch.mock.calls[3][0]).toContain("/epics/epic-cascade-1/");
    expect(mockFetch.mock.calls[3][1].method).toBe("DELETE");
  });

  it("deleteEpic cascade falls back to Modules when the epics list call itself is gated", async () => {
    const epicId = String(mintId("epic-cascade-2"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(402, { error: "Payment required" }))
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "wi-c" }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(204, {}))
      .mockResolvedValueOnce(makeResponse(204, {}));

    const result = await planeDeleteEpic("key", "my-team", "proj-uuid", epicId, "https://api.plane.so");

    expect(result.stories_deleted).toBe(1);
    expect(mockFetch.mock.calls[1][0]).toContain("/modules/epic-cascade-2/module-issues/");
    expect(mockFetch.mock.calls[3][0]).toContain("/modules/epic-cascade-2/");
  });

  it("createStory creates the work item then joins it to the epic via the epics/{id}/issues/ endpoint", async () => {
    const epicId = String(mintId("epic-join-1"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(201, { id: "wi-new", name: "S1", sequence_id: 5 }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, { id: "wi-new", name: "S1", sequence_id: 5, labels: [], state: null, parent: null }));

    const story = await planeCreateStory("key", "my-team", "proj-uuid", epicId, "S1", "d", [], undefined, "https://api.plane.so");

    expect(story.pm_story_id).toBe("wi-new");
    expect(mockFetch.mock.calls[1][0]).toContain("/epics/epic-join-1/issues/");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ work_item_ids: ["wi-new"] });
  });

  it("createStory falls back to the module-issues join (different body key: `issues`, not `work_item_ids`) when Epics is gated", async () => {
    const epicId = String(mintId("epic-join-2"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(201, { id: "wi-new2", name: "S2", sequence_id: 6 }))
      .mockResolvedValueOnce(makeResponse(403, { detail: "gated" }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, { id: "wi-new2", name: "S2", sequence_id: 6, labels: [], state: null, parent: null }));

    const story = await planeCreateStory("key", "my-team", "proj-uuid", epicId, "S2", "d", [], undefined, "https://api.plane.so");

    expect(story.pm_story_id).toBe("wi-new2");
    expect(mockFetch.mock.calls[2][0]).toContain("/modules/epic-join-2/module-issues/");
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({ issues: ["wi-new2"] });
  });

  it("createStory rolls back the orphaned work item when the epic/module join fails for a real (non-gated) reason", async () => {
    const epicId = String(mintId("epic-join-3"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(201, { id: "wi-new3", name: "S3", sequence_id: 7 }))
      .mockResolvedValueOnce(makeResponse(500, { detail: "server error" }))
      .mockResolvedValueOnce(makeResponse(204, {}));

    await expect(
      planeCreateStory("key", "my-team", "proj-uuid", epicId, "S3", "d", [], undefined, "https://api.plane.so"),
    ).rejects.toMatchObject({ status: 500 });

    expect(mockFetch.mock.calls[2][0]).toContain("/work-items/wi-new3/");
    expect(mockFetch.mock.calls[2][1].method).toBe("DELETE");
  });

  it("updateStory resolves tags to label ids — reuses an existing label by name, creates a missing one", async () => {
    const storyId = String(mintId("story-update-1"));
    mockFetch
      // full label list, paginated once, matched client-side (no server-side name filter — see plan memory §3)
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "lbl-bug", name: "bug" }], next_cursor: null }))
      // "feature" not found -> created
      .mockResolvedValueOnce(makeResponse(201, { id: "lbl-feature", name: "feature" }))
      .mockResolvedValueOnce(makeResponse(200, {})) // PATCH
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-update-1", name: "Updated", sequence_id: 9, state: "st1",
        labels: [{ id: "lbl-bug", name: "bug" }, { id: "lbl-feature", name: "feature" }],
      }));

    const story = await planeUpdateStory(
      "key", "my-team", "proj-uuid", storyId, { tags: ["bug", "feature"] }, "https://api.plane.so",
    );

    expect(story.tags).toEqual(["bug", "feature"]);
    expect(mockFetch.mock.calls[1][0]).toContain("/labels/");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ name: "feature" });
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({ labels: ["lbl-bug", "lbl-feature"] });
  });

  // -------------------------------------------------------------------------
  // Label list caching across calls (planeResolveLabelIds's module-level
  // _labelCache, keyed per-project-UUID with a 2-minute TTL). Each test below
  // uses a project UUID unique to it (not reused from other tests in this
  // file) so the module-level cache from one test can't leak into another.
  // -------------------------------------------------------------------------

  it("resolves the same project's labels twice within the TTL window without re-listing — only one GET on /labels/", async () => {
    const storyId1 = String(mintId("story-labelcache-a1"));
    const storyId2 = String(mintId("story-labelcache-a2"));
    mockFetch
      // call 1: list, PATCH, refetch
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "lbl-bug", name: "bug" }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-labelcache-a1", name: "S1", sequence_id: 1, labels: [{ id: "lbl-bug", name: "bug" }], state: null, parent: null,
      }))
      // call 2: no list this time — PATCH, refetch only
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-labelcache-a2", name: "S2", sequence_id: 2, labels: [{ id: "lbl-bug", name: "bug" }], state: null, parent: null,
      }));

    await planeUpdateStory("key", "my-team", "proj-labelcache-a", storyId1, { tags: ["bug"] }, "https://api.plane.so");
    await planeUpdateStory("key", "my-team", "proj-labelcache-a", storyId2, { tags: ["bug"] }, "https://api.plane.so");

    expect(mockFetch).toHaveBeenCalledTimes(5);
    const labelListCalls = mockFetch.mock.calls.filter(
      ([url, init]) => String(url).includes("/labels/") && (!init?.method || init.method === "GET"),
    );
    expect(labelListCalls).toHaveLength(1);
  });

  it("a newly-created label is picked up by a subsequent call without re-listing or re-creating", async () => {
    const storyId1 = String(mintId("story-labelcache-b1"));
    const storyId2 = String(mintId("story-labelcache-b2"));
    mockFetch
      // call 1: empty list -> "newlabel" not found -> create -> PATCH -> refetch
      .mockResolvedValueOnce(makeResponse(200, { results: [], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(201, { id: "lbl-new", name: "newlabel" }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-labelcache-b1", name: "S1", sequence_id: 1, labels: [{ id: "lbl-new", name: "newlabel" }], state: null, parent: null,
      }))
      // call 2: same tag, same project — no list, no create, just PATCH + refetch
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-labelcache-b2", name: "S2", sequence_id: 2, labels: [{ id: "lbl-new", name: "newlabel" }], state: null, parent: null,
      }));

    await planeUpdateStory("key", "my-team", "proj-labelcache-b", storyId1, { tags: ["newlabel"] }, "https://api.plane.so");
    await planeUpdateStory("key", "my-team", "proj-labelcache-b", storyId2, { tags: ["newlabel"] }, "https://api.plane.so");

    expect(mockFetch).toHaveBeenCalledTimes(6);
    const labelListCalls = mockFetch.mock.calls.filter(
      ([url, init]) => String(url).includes("/labels/") && (!init?.method || init.method === "GET"),
    );
    const labelCreateCalls = mockFetch.mock.calls.filter(
      ([url, init]) => String(url).includes("/labels/") && init?.method === "POST",
    );
    expect(labelListCalls).toHaveLength(1);
    expect(labelCreateCalls).toHaveLength(1);
  });

  it("caches per project UUID — two different projects each trigger their own /labels/ list GET", async () => {
    const storyId1 = String(mintId("story-labelcache-c1"));
    const storyId2 = String(mintId("story-labelcache-c2"));
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "lbl-bug", name: "bug" }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-labelcache-c1", name: "S1", sequence_id: 1, labels: [{ id: "lbl-bug", name: "bug" }], state: null, parent: null,
      }))
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "lbl-bug2", name: "bug" }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: "story-labelcache-c2", name: "S2", sequence_id: 2, labels: [{ id: "lbl-bug2", name: "bug" }], state: null, parent: null,
      }));

    await planeUpdateStory("key", "my-team", "proj-labelcache-c1", storyId1, { tags: ["bug"] }, "https://api.plane.so");
    await planeUpdateStory("key", "my-team", "proj-labelcache-c2", storyId2, { tags: ["bug"] }, "https://api.plane.so");

    const labelListCalls = mockFetch.mock.calls.filter(
      ([url, init]) => String(url).includes("/labels/") && (!init?.method || init.method === "GET"),
    );
    expect(labelListCalls).toHaveLength(2);
    expect(labelListCalls[0][0]).toContain("proj-labelcache-c1");
    expect(labelListCalls[1][0]).toContain("proj-labelcache-c2");
  });

  it("getProjectTasks filters work items to those with a parent set (Plane has no separate Task resource)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [
        { id: "t1", name: "Task 1", parent: "story-uuid-x", sequence_id: 1 },
        { id: "s1", name: "Story 1", parent: null, sequence_id: 2 },
      ],
      next_cursor: null,
    }));
    const tasks = await planeGetProjectTasks("key", "my-team", "proj-uuid", "https://api.plane.so");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subject).toBe("Task 1");
  });

  it("createTask sends parent = the resolved story UUID and points as `point`", async () => {
    const storyId = String(mintId("story-for-task-1"));
    mockFetch.mockResolvedValueOnce(makeResponse(201, { id: "task-new", name: "T1", sequence_id: 4 }));
    const task = await planeCreateTask("key", "my-team", "proj-uuid", storyId, "T1", "d", "https://api.plane.so", 3);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: "T1", description_html: "<p>d</p>", parent: "story-for-task-1", point: 3 });
    expect(task.ref).toBe(4);
  });

  it("updateTask sends only the fields provided, translating description to description_html", async () => {
    const taskId = String(mintId("task-update-1"));
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
    await planeUpdateTask("key", "my-team", "proj-uuid", taskId, { description: "new desc" }, "https://api.plane.so");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/work-items/task-update-1/");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ description_html: "<p>new desc</p>" });
  });

  // -------------------------------------------------------------------------
  // Members/roles (phase 4d). Field shapes live-confirmed against a real
  // workspace: project-members DOES carry a role field (the documented
  // example omitting it was stale/wrong) — role:20 is shared by both Owner
  // and Admin, role_slug is the only field that actually distinguishes them.
  // -------------------------------------------------------------------------

  it("getUsers maps project-members, prefers role_slug for role_name, and hardcodes the assignable-roles list", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [
        { id: "m1", first_name: "Tom", last_name: "T", display_name: "tomtom", email: "tom@x.test", role: 20, role_slug: "owner" },
        { id: "m2", first_name: "Ana", last_name: "", display_name: "ana", email: "ana@x.test", role: 15, role_slug: "member" },
      ],
      next_cursor: null,
    }));

    const { memberships, roles } = await planeGetUsers("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(memberships).toHaveLength(2);
    expect(memberships[0]).toMatchObject({ id: "m1", full_name: "Tom T", email: "tom@x.test", role: 20, role_name: "Owner", is_owner: true });
    expect(memberships[1]).toMatchObject({ id: "m2", role_name: "Member", is_owner: false });
    // No "list roles" endpoint exists on Plane — this is hardcoded, not fetched.
    expect(roles).toEqual([{ id: 5, name: "Guest" }, { id: 15, name: "Member" }, { id: 20, name: "Admin" }]);
    expect(mockFetch.mock.calls[0][0]).toContain("/project-members/");
  });

  it("inviteUser resolves an existing workspace member by email, then adds them to the project", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {
        results: [{ id: "wm1", email: "ana@x.test", display_name: "ana" }],
        next_cursor: null,
      }))
      .mockResolvedValueOnce(makeResponse(201, {}));

    const result = await planeInviteUser("key", "my-team", "proj-uuid", "ana@x.test", 15, "https://api.plane.so");

    expect(result).toEqual({ scope: "project" });
    expect(mockFetch.mock.calls[0][0]).toContain("/workspaces/my-team/members/");
    const [addUrl, addInit] = mockFetch.mock.calls[1];
    expect(addUrl).toContain("/projects/proj-uuid/project-members/");
    expect(JSON.parse(addInit.body)).toEqual({ member: "wm1", role: 15 });
  });

  it("inviteUser matches case-insensitively on display_name too, not just email", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { results: [{ id: "wm2", email: "", display_name: "Ana" }], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(201, {}));
    await planeInviteUser("key", "my-team", "proj-uuid", "ANA", 5, "https://api.plane.so");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ member: "wm2", role: 5 });
  });

  it("inviteUser falls back to a workspace invitation when the email matches no existing workspace member", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { results: [], next_cursor: null }))
      .mockResolvedValueOnce(makeResponse(201, { id: "inv1", email: "nobody@x.test" }));

    const result = await planeInviteUser("key", "my-team", "proj-uuid", "nobody@x.test", 15, "https://api.plane.so");

    expect(result).toEqual({ scope: "workspace" });
    const [inviteUrl, inviteInit] = mockFetch.mock.calls[1];
    expect(inviteUrl).toContain("/workspaces/my-team/invitations/");
    expect(inviteInit.method).toBe("POST");
    expect(JSON.parse(inviteInit.body)).toEqual({ email: "nobody@x.test", role: 15 });
  });

  it("inviteUser throws a clear error for a non-email value that matches no workspace member — can't invite a bare username to the workspace", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { results: [], next_cursor: null }));
    await expect(
      planeInviteUser("key", "my-team", "proj-uuid", "nobody", 15, "https://api.plane.so"),
    ).rejects.toThrow(/isn't an existing member/);
    expect(mockFetch).toHaveBeenCalledTimes(1); // never attempted the invitation call
  });

  it("removeMember DELETEs the project-member", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(204, {}));
    await planeRemoveMember("key", "my-team", "proj-uuid", "m1", "https://api.plane.so");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/project-members/m1/");
    expect(init.method).toBe("DELETE");
  });

  it("updateMemberRole PATCHes just the role field", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
    await planeUpdateMemberRole("key", "my-team", "proj-uuid", "m1", 20, "https://api.plane.so");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/project-members/m1/");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ role: 20 });
  });

  // -------------------------------------------------------------------------
  // listIssues (Phase 6 maintenance triage's "import from PM" source).
  // -------------------------------------------------------------------------

  it("listIssues returns only top-level work items, excluding any with a truthy parent (sub-issues)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [
        { id: "wi-top-1", name: "Top level one", sequence_id: 1, parent: null },
        { id: "wi-sub-1", name: "Sub issue one", sequence_id: 2, parent: "wi-top-1" },
        { id: "wi-top-2", name: "Top level two", sequence_id: 3, parent: "" },
      ],
      next_cursor: null,
    }));

    const issues = await planeListIssues("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(issues.map((i) => i.subject)).toEqual(["Top level one", "Top level two"]);
  });

  it("listIssues uses PLN#<sequence_id> for ext_ref when sequence_id is present", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [{ id: "wi-1", name: "Issue one", sequence_id: 42, parent: null }],
      next_cursor: null,
    }));

    const [issue] = await planeListIssues("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(issue.ext_ref).toBe("PLN#42");
  });

  it("listIssues falls back to the raw id for ext_ref when sequence_id is missing/null", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [{ id: "wi-no-seq", name: "No sequence", sequence_id: null, parent: null }],
      next_cursor: null,
    }));

    const [issue] = await planeListIssues("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(issue.ext_ref).toBe("PLN#wi-no-seq");
  });

  it("listIssues resolves description via the same precedence as planeDescription (description_stripped > description > html-stripped)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {
      results: [{
        id: "wi-desc", name: "Has description", sequence_id: 9, parent: null,
        description_stripped: "Stripped text wins.",
        description: "Should not be used.",
        description_html: "<p>Should NOT be used either.</p>",
      }],
      next_cursor: null,
    }));

    const [issue] = await planeListIssues("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(issue.description).toBe("Stripped text wins.");
  });

  it("listIssues returns an empty array for an empty work-items list", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { results: [], next_cursor: null }));

    const issues = await planeListIssues("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(issues).toEqual([]);
  });

  it("listIssues paginates using next_page_results, following planeFetchAllPages's convention", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, {
        results: [{ id: "wi-p1", name: "Page one item", sequence_id: 1, parent: null }],
        next_cursor: "cur2",
        next_page_results: true,
      }))
      .mockResolvedValueOnce(makeResponse(200, {
        results: [{ id: "wi-p2", name: "Page two item", sequence_id: 2, parent: null }],
        next_cursor: "cur2-still-non-null",
        next_page_results: false,
      }));

    const issues = await planeListIssues("key", "my-team", "proj-uuid", "https://api.plane.so");

    expect(issues.map((i) => i.subject)).toEqual(["Page one item", "Page two item"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("/workspaces/my-team/projects/proj-uuid/work-items/");
    expect(mockFetch.mock.calls[1][0]).toContain("cursor=cur2");
  });
});
