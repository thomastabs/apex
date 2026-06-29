import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import {
  figmaFrameFingerprint,
  deriveFrameFingerprints,
  buildDesignTokensMarkdown,
  buildFigmaContextMarkdown,
  extractDesignTokens,
  type FigmaFile,
  type FigmaDesignTokens,
} from "@/lib/api/figma";

const ctx = { projectId: 1 } as never;

// ---------------------------------------------------------------------------
// #2 frame fingerprint — parity with the Python figma_fetch.frame_fingerprint
// ---------------------------------------------------------------------------

describe("figmaFrameFingerprint", () => {
  const frame = {
    name: "Login",
    absoluteBoundingBox: { width: 375.4, height: 812 },
    children: [{ type: "TEXT", name: "Title" }, { type: "INPUT", name: "Email" }],
  };

  it("is stable across calls", () => {
    expect(figmaFrameFingerprint(frame)).toBe(figmaFrameFingerprint(frame));
  });

  it("matches the known Python/JS parity vector", () => {
    // Same input string the backend test asserts → identical digest cross-language.
    expect(figmaFrameFingerprint(frame)).toBe("8eb67ec51863f2b9");
  });

  it("changes on an added child, rename, or resize", () => {
    const base = figmaFrameFingerprint(frame);
    expect(figmaFrameFingerprint({ ...frame, children: [...frame.children, { type: "BUTTON", name: "Go" }] })).not.toBe(base);
    expect(figmaFrameFingerprint({ ...frame, name: "Sign in" })).not.toBe(base);
    expect(figmaFrameFingerprint({ ...frame, absoluteBoundingBox: { width: 400, height: 812 } })).not.toBe(base);
  });

  it("ignores sub-pixel width noise (rounds)", () => {
    expect(figmaFrameFingerprint({ ...frame, absoluteBoundingBox: { width: 375.0, height: 812 } })).toBe(
      figmaFrameFingerprint(frame),
    );
  });
});

describe("deriveFrameFingerprints", () => {
  it("fingerprints every top-level frame keyed by node id", () => {
    const file = {
      name: "App",
      lastModified: "2026-06-29T00:00:00Z",
      document: {
        id: "0", name: "Doc", type: "DOCUMENT",
        children: [
          {
            id: "p", name: "Page 1", type: "CANVAS",
            children: [
              { id: "1:2", name: "Login", type: "FRAME", children: [{ type: "TEXT", name: "T" }] },
              { id: "1:3", name: "Home", type: "FRAME", children: [] },
              { id: "1:4", name: "Group", type: "GROUP" },
            ],
          },
        ],
      },
    } as unknown as FigmaFile;
    const fps = deriveFrameFingerprints(file);
    expect(Object.keys(fps).sort()).toEqual(["1:2", "1:3"]); // GROUP skipped
    expect(fps["1:2"]).not.toBe(fps["1:3"]);
  });
});

// ---------------------------------------------------------------------------
// #1 design tokens markdown
// ---------------------------------------------------------------------------

describe("buildDesignTokensMarkdown", () => {
  it("renders color hex, text/effect styles, and components", () => {
    const tokens: FigmaDesignTokens = {
      colors: [{ name: "Primary/500", hex: "#1A73E8" }, { name: "Surface", hex: "" }],
      text_styles: ["Heading/H1"],
      effects: ["Shadow/M"],
      components: ["Button", "Card"],
    };
    const md = buildDesignTokensMarkdown(tokens);
    expect(md).toContain("## Design system");
    expect(md).toContain("- Primary/500 — #1A73E8");
    expect(md).toContain("- Surface");
    expect(md).not.toContain("Surface —");
    expect(md).toContain("Button, Card");
  });

  it("returns empty string when there are no tokens", () => {
    expect(buildDesignTokensMarkdown({ colors: [], text_styles: [], effects: [], components: [] })).toBe("");
  });
});

describe("buildFigmaContextMarkdown with tokens", () => {
  it("appends a Design system section when tokens are supplied", () => {
    const file = {
      name: "App", lastModified: "2026-06-29T00:00:00Z",
      document: { id: "0", name: "D", type: "DOCUMENT", children: [
        { id: "p", name: "P", type: "CANVAS", children: [{ id: "1:2", name: "Login", type: "FRAME" }] },
      ] },
    } as unknown as FigmaFile;
    const tokens: FigmaDesignTokens = { colors: [{ name: "Brand", hex: "#000000" }], text_styles: [], effects: [], components: [] };
    const md = buildFigmaContextMarkdown(file, [], tokens);
    expect(md).toContain("## Screens (frames)");
    expect(md).toContain("## Design system");
    expect(md).toContain("- Brand — #000000");
  });

  it("omits the Design system section without tokens (back-compat)", () => {
    const file = {
      name: "App", lastModified: "2026-06-29T00:00:00Z",
      document: { id: "0", name: "D", type: "DOCUMENT", children: [] },
    } as unknown as FigmaFile;
    expect(buildFigmaContextMarkdown(file, [])).not.toContain("## Design system");
  });
});

// ---------------------------------------------------------------------------
// #1 extractDesignTokens — merges published endpoints + local maps, enriches hex
// ---------------------------------------------------------------------------

describe("extractDesignTokens", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("merges published styles/components and resolves color hex via /nodes", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path: unknown) => {
      if (typeof path !== "string") return {} as never;
      if (path.includes("/styles")) {
        return { meta: { styles: [
          { node_id: "c1", name: "Primary/500", style_type: "FILL" },
          { node_id: "t1", name: "Heading/H1", style_type: "TEXT" },
        ] } } as never;
      }
      if (path.includes("/components")) {
        return { meta: { components: [{ name: "Button" }, { name: "Card" }] } } as never;
      }
      if (path.includes("/nodes")) {
        return { nodes: { c1: { document: { fills: [{ type: "SOLID", color: { r: 0.1, g: 0.45, b: 0.91 } }] } } } } as never;
      }
      return {} as never;
    });

    const tokens = await extractDesignTokens("tok", "KEY");
    expect(tokens.colors).toEqual([{ name: "Primary/500", hex: "#1A73E8" }]);
    expect(tokens.text_styles).toEqual(["Heading/H1"]);
    expect(tokens.components).toEqual(["Button", "Card"]);
  });

  it("is advisory: a rejecting endpoint yields empty arrays, never throws", async () => {
    // The published-style/component endpoints 403 (token lacks the scope); each call
    // is individually caught so extraction degrades to empty instead of throwing.
    vi.mocked(apiRequest).mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && (path.includes("/styles") || path.includes("/components"))) {
        return Promise.reject(new Error("403"));
      }
      return {} as never;
    });
    const tokens = await extractDesignTokens("tok", "KEY");
    expect(tokens).toEqual({ colors: [], text_styles: [], effects: [], components: [] });
  });

  it("falls back to local file.styles/components when no library is published", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path: unknown) => {
      if (typeof path !== "string") return {} as never;
      if (path.includes("/styles")) return { meta: { styles: [] } } as never;
      if (path.includes("/components")) return { meta: { components: [] } } as never;
      return {} as never;
    });
    const file = {
      styles: { s1: { name: "Brand", styleType: "FILL" } },
      components: { c1: { name: "Nav" } },
    } as unknown as FigmaFile;
    const tokens = await extractDesignTokens("tok", "KEY", file);
    expect(tokens.colors.map((c) => c.name)).toEqual(["Brand"]);
    expect(tokens.components).toEqual(["Nav"]);
  });
});
