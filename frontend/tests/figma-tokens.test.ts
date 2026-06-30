import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import {
  buildDesignTokensMarkdown,
  buildFigmaContextMarkdown,
  extractDesignTokens,
  type FigmaFile,
  type FigmaDesignTokens,
} from "@/lib/api/figma";

const ctx = { projectId: 1 } as never;

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
