import { describe, expect, it } from "vitest";
import { pmTaskWebUrl } from "@/lib/hooks/use-phase3";
import type { RequestContext } from "@/lib/api/types";

const taigaCtx = {
  taigaToken: "tok",
  taigaApiUrl: "https://api.taiga.io/api/v1",
  projectId: 7,
  pmTool: "taiga",
  pmProjectId: "my-project",
} as unknown as RequestContext;

describe("pmTaskWebUrl", () => {
  it("builds the tree.taiga.io task URL from the API base + slug + ref", () => {
    expect(pmTaskWebUrl(taigaCtx, 42)).toBe("https://tree.taiga.io/project/my-project/task/42");
  });

  it("works for a private Taiga instance (keeps host, drops /api/v1)", () => {
    const ctx = { ...taigaCtx, taigaApiUrl: "https://taiga.example.com/api/v1" } as unknown as RequestContext;
    expect(pmTaskWebUrl(ctx, 5)).toBe("https://taiga.example.com/project/my-project/task/5");
  });

  it("returns null without a ref, slug, context, or for non-Taiga tools", () => {
    expect(pmTaskWebUrl(taigaCtx, undefined)).toBeNull();
    expect(pmTaskWebUrl(null, 1)).toBeNull();
    expect(pmTaskWebUrl({ ...taigaCtx, pmProjectId: undefined } as unknown as RequestContext, 1)).toBeNull();
    expect(pmTaskWebUrl({ ...taigaCtx, pmTool: "jira" } as unknown as RequestContext, 1)).toBeNull();
  });
});
