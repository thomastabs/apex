import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import {
  parseFigmaUrl,
  figmaNodeUrl,
  deriveFramesAndFlows,
  buildFigmaContextMarkdown,
  figmaVerifyFile,
  figmaGetFile,
  figmaThumbnails,
  type FigmaFile,
} from "@/lib/api/figma";

// ---------------------------------------------------------------------------
// parseFigmaUrl / figmaNodeUrl
// ---------------------------------------------------------------------------

describe("parseFigmaUrl", () => {
  it("parses a /design URL with node-id (dash → colon)", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/ABC123/My-App?node-id=12-34")).toEqual({
      fileKey: "ABC123",
      nodeId: "12:34",
    });
  });

  it("parses a legacy /file URL", () => {
    expect(parseFigmaUrl("https://www.figma.com/file/KEY999/Proj").fileKey).toBe("KEY999");
  });

  it("accepts a bare file key", () => {
    expect(parseFigmaUrl("ABC123")).toEqual({ fileKey: "ABC123", nodeId: null });
  });

  it("returns empty fileKey for an unrelated URL", () => {
    expect(parseFigmaUrl("https://example.com/x").fileKey).toBe("");
  });

  it("round-trips a node id into a deep link", () => {
    expect(figmaNodeUrl("ABC123", "12:34")).toBe("https://www.figma.com/design/ABC123?node-id=12-34");
  });
});

// ---------------------------------------------------------------------------
// deriveFramesAndFlows
// ---------------------------------------------------------------------------

const FILE: FigmaFile = {
  name: "My App",
  lastModified: "2026-06-27T10:00:00Z",
  document: {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: [
      {
        id: "1:0",
        name: "Page 1",
        type: "CANVAS",
        children: [
          { id: "1:1", name: "Login", type: "FRAME", transitionNodeID: "1:2" },
          { id: "1:2", name: "Dashboard", type: "FRAME" },
          { id: "1:3", name: "BG", type: "RECTANGLE" }, // not a frame → ignored
        ],
      },
    ],
  },
};

describe("deriveFramesAndFlows", () => {
  it("collects top-level FRAME nodes per page and skips non-frames", () => {
    const { frames } = deriveFramesAndFlows(FILE);
    expect(frames.map((f) => f.name)).toEqual(["Login", "Dashboard"]);
    expect(frames[0].page).toBe("Page 1");
  });

  it("derives prototype flow edges from transitionNodeID", () => {
    const { flows } = deriveFramesAndFlows(FILE);
    expect(flows).toEqual([{ from_name: "Login", to_name: "Dashboard" }]);
  });
});

// ---------------------------------------------------------------------------
// buildFigmaContextMarkdown
// ---------------------------------------------------------------------------

describe("buildFigmaContextMarkdown", () => {
  it("includes file name, screens, and flows", () => {
    const md = buildFigmaContextMarkdown(FILE, []);
    expect(md).toContain("**File:** My App");
    expect(md).toContain("### Page 1");
    expect(md).toContain("- Login");
    expect(md).toContain("Login → Dashboard");
  });

  it("includes comments when present", () => {
    const md = buildFigmaContextMarkdown(FILE, [{ message: "Use brand blue", user: { handle: "tom" } }]);
    expect(md).toContain("## Comments");
    expect(md).toContain("Use brand blue");
  });
});

// ---------------------------------------------------------------------------
// API layer (client mocked)
// ---------------------------------------------------------------------------

describe("figma api layer", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({} as never);
  });

  it("figmaGetFile requests files/:key with depth + token header", async () => {
    vi.mocked(apiRequest).mockResolvedValue(FILE as never);
    await figmaGetFile("figd_tok", "ABC123", 2);
    expect(apiRequest).toHaveBeenCalledWith("/api/design/figma/files/ABC123?depth=2", {
      headers: { "X-Figma-Token": "figd_tok" },
    });
  });

  it("figmaVerifyFile uses depth=1", async () => {
    vi.mocked(apiRequest).mockResolvedValue(FILE as never);
    await figmaVerifyFile("figd_tok", "ABC123");
    expect(apiRequest).toHaveBeenCalledWith("/api/design/figma/files/ABC123?depth=1", {
      headers: { "X-Figma-Token": "figd_tok" },
    });
  });

  it("figmaThumbnails encodes ids and filters null urls", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ images: { "1:1": "https://s3/x.png", "1:2": null } } as never);
    const out = await figmaThumbnails("figd_tok", "ABC123", ["1:1", "1:2"]);
    expect(out).toEqual({ "1:1": "https://s3/x.png" });
    const path = vi.mocked(apiRequest).mock.calls[0][0] as string;
    expect(path).toContain("/api/design/figma/images/ABC123?ids=1%3A1%2C1%3A2");
    expect(path).toContain("format=png");
  });

  it("figmaThumbnails short-circuits on empty ids (no request)", async () => {
    const out = await figmaThumbnails("figd_tok", "ABC123", []);
    expect(out).toEqual({});
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
