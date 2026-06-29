import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import { setStoryFigmaLink, scanFigmaChanges, scanFigmaChangesMulti } from "@/lib/api/workspace";

const CTX = { projectId: 1, pmTool: "taiga", taigaToken: "tok" } as never;

describe("setStoryFigmaLink api", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ ok: true } as never);
  });

  it("POSTs the node id + file key + frame hash to the story figma-link endpoint", async () => {
    await setStoryFigmaLink(CTX, 42, "12:34", "2026-06-28T00:00:00Z", "FILEKEY", "abc123");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/context-files/story-index/stories/42/figma-link",
      expect.objectContaining({
        method: "POST",
        body: { figma_node_id: "12:34", figma_modified: "2026-06-28T00:00:00Z", figma_file_key: "FILEKEY", figma_frame_hash: "abc123" },
      }),
    );
  });

  it("defaults file key + frame hash to empty (legacy single-file link)", async () => {
    await setStoryFigmaLink(CTX, 42, "12:34");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/context-files/story-index/stories/42/figma-link",
      expect.objectContaining({ body: { figma_node_id: "12:34", figma_modified: "", figma_file_key: "", figma_frame_hash: "" } }),
    );
  });

  it("sends an empty id to unlink", async () => {
    await setStoryFigmaLink(CTX, 42, "");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/context-files/story-index/stories/42/figma-link",
      expect.objectContaining({ body: { figma_node_id: "", figma_modified: "", figma_file_key: "", figma_frame_hash: "" } }),
    );
  });
});

describe("scanFigmaChanges api", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ changed_story_ids: [] } as never);
  });

  it("single-file scan posts current_modified", async () => {
    await scanFigmaChanges(CTX, "2026-06-28T00:00:00Z");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/figma/scan-changes",
      expect.objectContaining({ body: { current_modified: "2026-06-28T00:00:00Z" } }),
    );
  });

  it("per-file scan posts modified_by_file (no hashes → omitted)", async () => {
    await scanFigmaChangesMulti(CTX, { "": "2026-06-01T00:00:00Z", K2: "2026-06-28T00:00:00Z" });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/figma/scan-changes",
      expect.objectContaining({
        body: { modified_by_file: { "": "2026-06-01T00:00:00Z", K2: "2026-06-28T00:00:00Z" } },
      }),
    );
  });

  it("per-frame scan posts hash_by_node when fingerprints are supplied", async () => {
    await scanFigmaChangesMulti(CTX, { A: "2026-06-28T00:00:00Z" }, { "A#1:1": "deadbeef" });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/figma/scan-changes",
      expect.objectContaining({
        body: { modified_by_file: { A: "2026-06-28T00:00:00Z" }, hash_by_node: { "A#1:1": "deadbeef" } },
      }),
    );
  });
});
