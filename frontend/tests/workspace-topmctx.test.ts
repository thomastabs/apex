import { describe, expect, it } from "vitest";
import { toPmCtx } from "@/lib/api/workspace";
import { mintId } from "@/lib/api/plane-direct";
import type { RequestContext } from "@/lib/api/types";

describe("toPmCtx", () => {
  it("Taiga: projectId stringified as-is (numeric id, not a slug)", () => {
    const ctx: RequestContext = { taigaToken: "tok", taigaApiUrl: "https://api.taiga.io/api/v1", projectId: 42, pmTool: "taiga" };
    expect(toPmCtx(ctx)).toEqual({ token: "tok", baseUrl: "https://api.taiga.io/api/v1", workspaceSlug: undefined, projectId: "42" });
  });

  it("Plane: projectId resolved from the minted int back to the real UUID, workspaceSlug passed through", () => {
    const minted = mintId("11111111-2222-3333-4444-555555555555");
    const ctx: RequestContext = {
      taigaToken: "pat", taigaApiUrl: "https://api.plane.so", projectId: minted, pmTool: "plane", workspaceSlug: "my-team",
    };
    const result = toPmCtx(ctx);
    expect(result.projectId).toBe("11111111-2222-3333-4444-555555555555");
    expect(result.workspaceSlug).toBe("my-team");
    expect(result.token).toBe("pat");
  });
});
