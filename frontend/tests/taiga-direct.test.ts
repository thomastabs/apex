import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTaigaApiBaseUrl, taigaCreateStory, taigaDeleteEpic, taigaGetBoard } from "@/lib/api/taiga-direct";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("taiga direct API", () => {
  it("derives API URL from Taiga web URL", () => {
    expect(getTaigaApiBaseUrl("https://tree.taiga.io")).toBe("https://api.taiga.io/api/v1");
    expect(getTaigaApiBaseUrl("https://taiga.example.test")).toBe("https://taiga.example.test/api/v1");
    expect(getTaigaApiBaseUrl("https://taiga.example.test/api/v1")).toBe("https://taiga.example.test/api/v1");
  });

  it("links newly created stories through the epic relation endpoint", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { id: 10, ref: 1, subject: "Story", version: 3 }))
      .mockResolvedValueOnce(makeResponse(200, {}))
      .mockResolvedValueOnce(makeResponse(200, {
        id: 10,
        ref: 1,
        subject: "Story",
        version: 4,
        epic: 5,
        epic_extra_info: { id: 5, subject: "Epic" },
      }));

    await taigaCreateStory("tok", 2, 5, "Story", "Desc", ["tag"], undefined, "https://api.taiga.test/api/v1");

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.taiga.test/api/v1/epics/5/related_userstories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ epic: 5, user_story: 10 }),
      }),
    );
  });

  it("hydrates missing board descriptions from detail endpoints", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, [{ id: 5, ref: 1, subject: "Epic" }]))
      .mockResolvedValueOnce(makeResponse(200, [{ id: 10, ref: 2, subject: "Story", epic: 5 }]))
      .mockResolvedValueOnce(makeResponse(200, { id: 5, ref: 1, subject: "Epic", description: "Epic desc" }))
      .mockResolvedValueOnce(makeResponse(200, { id: 10, ref: 2, subject: "Story", description: "Story desc", epic: 5 }));

    const board = await taigaGetBoard("tok", 2, "https://api.taiga.test/api/v1");

    expect(board[0].description).toBe("Epic desc");
    expect(board[0].stories[0].description).toBe("Story desc");
  });

  it("deletes stories before deleting an epic", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, [{ id: 10 }, { id: 11 }]))
      .mockResolvedValueOnce(makeResponse(204, {}))
      .mockResolvedValueOnce(makeResponse(204, {}))
      .mockResolvedValueOnce(makeResponse(204, {}));

    const result = await taigaDeleteEpic("tok", 2, 5, "https://api.taiga.test/api/v1");

    expect(result).toMatchObject({ ok: true, stories_deleted: 2, story_failures: [] });
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      "https://api.taiga.test/api/v1/epics/5",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
