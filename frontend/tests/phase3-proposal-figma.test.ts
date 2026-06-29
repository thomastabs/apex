import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import { generateProposal } from "@/lib/api/phase3";
import type { Phase3GenerateProposalRequest } from "@/lib/api/types";

const CTX = { projectId: 1 } as never;
const BODY: Phase3GenerateProposalRequest = {
  story_id: 10,
  task_id: 1,
  task_subject: "Build login screen",
  task_description: "UI",
  hint: "",
  recent_commits_context: "",
  all_tasks: [],
};

describe("generateProposal — Figma token header (B multimodal)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ proposal_md: "ok" } as never);
  });

  it("sends X-Figma-Token when a token is supplied (linked-frame image grounding)", async () => {
    await generateProposal(CTX, BODY, undefined, "figd_tok");
    const opts = vi.mocked(apiRequest).mock.calls[0][1] as { headers?: Record<string, string> };
    expect(opts.headers).toEqual({ "X-Figma-Token": "figd_tok" });
  });

  it("omits the header when no token (text-only pack)", async () => {
    await generateProposal(CTX, BODY);
    const opts = vi.mocked(apiRequest).mock.calls[0][1] as { headers?: Record<string, string> };
    expect(opts.headers).toBeUndefined();
  });
});
