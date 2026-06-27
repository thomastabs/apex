import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import { setStoryFigmaLink } from "@/lib/api/workspace";

const CTX = { projectId: 1, pmTool: "taiga", taigaToken: "tok" } as never;

describe("setStoryFigmaLink api", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ ok: true } as never);
  });

  it("POSTs the node id to the story figma-link endpoint", async () => {
    await setStoryFigmaLink(CTX, 42, "12:34");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/context-files/story-index/stories/42/figma-link",
      expect.objectContaining({ method: "POST", body: { figma_node_id: "12:34" } }),
    );
  });

  it("sends an empty id to unlink", async () => {
    await setStoryFigmaLink(CTX, 42, "");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/workspace/context-files/story-index/stories/42/figma-link",
      expect.objectContaining({ body: { figma_node_id: "" } }),
    );
  });
});
