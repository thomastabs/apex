import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaneApiBaseUrl,
  isPlaneStateClosed,
  mintId,
  planeGetBoard,
  planeGetMe,
  planeGetStory,
  planeListProjects,
  planeListStoryStatuses,
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
});
