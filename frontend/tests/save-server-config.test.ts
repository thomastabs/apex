import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api/client";
import { saveServerConfig } from "@/lib/api/workspace";
import { mintId } from "@/lib/api/plane-direct";
import type { AuthContext } from "@/lib/api/types";

describe("saveServerConfig", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ ok: true } as never);
  });

  it("Plane: resolves the minted session-local int to the real UUID in the request body", async () => {
    const minted = mintId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const context: AuthContext = {
      taigaToken: "pat", taigaApiUrl: "https://api.plane.so", pmTool: "plane", workspaceSlug: "my-team",
    };

    await saveServerConfig(context, minted);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [path, opts] = vi.mocked(apiRequest).mock.calls[0];
    expect(path).toBe("/api/workspace/config");
    expect(opts).toMatchObject({
      method: "POST",
      body: { project_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    });
    // The minted int must never leak onto the wire — this is the exact bug
    // that broke Plane's session-restart project restore.
    expect((opts as { body: { project_id: unknown } }).body.project_id).not.toBe(minted);
  });

  it("Taiga: sends the numeric project id unchanged (regression guard)", async () => {
    const context: AuthContext = { taigaToken: "tok", taigaApiUrl: "https://api.taiga.io/api/v1", pmTool: "taiga" };

    await saveServerConfig(context, 42);

    expect(apiRequest).toHaveBeenCalledWith("/api/workspace/config", {
      method: "POST",
      context,
      body: { project_id: 42 },
    });
  });

  it("Plane: throws (never sends the request) for an int never minted this session", () => {
    const context: AuthContext = { taigaToken: "pat", taigaApiUrl: "https://api.plane.so", pmTool: "plane" };

    // A large, session-local-looking int that this test never minted via
    // mintId() — resolveId() must reject it rather than silently forwarding
    // the wrong value. resolvePmProjectId() runs synchronously before the
    // apiRequest() call, so the throw happens on the call itself, not via a
    // rejected promise.
    expect(() => saveServerConfig(context, 999_999)).toThrow(/Unknown Plane id/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
