import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import { buildScreenFlowFromFigma } from "@/lib/api/phase2";

const CTX = { projectId: 1, pmTool: "taiga", taigaToken: "tok" } as never;

describe("buildScreenFlowFromFigma api", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ nodes: [], edges: [] } as never);
  });

  it("POSTs frames + flows to the screen-flow-from-figma endpoint", async () => {
    await buildScreenFlowFromFigma(CTX, {
      frames: [{ node_id: "1:1", name: "Login", page: "Auth" }],
      flows: [{ from_name: "Login", to_name: "Dashboard" }],
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/phase2/screen-flow-from-figma",
      expect.objectContaining({
        method: "POST",
        body: {
          frames: [{ node_id: "1:1", name: "Login", page: "Auth" }],
          flows: [{ from_name: "Login", to_name: "Dashboard" }],
        },
      }),
    );
  });
});
