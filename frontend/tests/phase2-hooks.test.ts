import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DesignSectionKey } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// activeBundle merge logic (pure, no React needed)
// ---------------------------------------------------------------------------

type DesignBundle = {
  wireframes: string;
  user_flow: string;
  component_tree: string;
  tech_spec: string;
  story_ids: number[];
};

function computeActiveBundle(
  isPending: boolean,
  partial: Partial<Record<DesignSectionKey, string>>,
  partialStoryIds: number[],
  designBundle: DesignBundle | null,
): DesignBundle | null {
  if (isPending && Object.keys(partial).length > 0) {
    return {
      wireframes:     partial.wireframes      ?? designBundle?.wireframes      ?? "",
      user_flow:      partial.user_flow        ?? designBundle?.user_flow       ?? "",
      component_tree: partial.component_tree   ?? designBundle?.component_tree  ?? "",
      tech_spec:      partial.tech_spec        ?? designBundle?.tech_spec       ?? "",
      story_ids:      partialStoryIds.length   ? partialStoryIds : (designBundle?.story_ids ?? []),
    };
  }
  return designBundle;
}

const FULL_BUNDLE: DesignBundle = {
  wireframes:     "w",
  user_flow:      "f",
  component_tree: "c",
  tech_spec:      "t",
  story_ids:      [1, 2],
};

describe("computeActiveBundle — merge logic", () => {
  it("returns designBundle when not pending", () => {
    const result = computeActiveBundle(false, {}, [], FULL_BUNDLE);
    expect(result).toBe(FULL_BUNDLE);
  });

  it("returns null when not pending and no bundle", () => {
    expect(computeActiveBundle(false, {}, [], null)).toBeNull();
  });

  it("returns designBundle when pending but partial is empty", () => {
    const result = computeActiveBundle(true, {}, [], FULL_BUNDLE);
    expect(result).toBe(FULL_BUNDLE);
  });

  it("merges single partial section with existing bundle", () => {
    const result = computeActiveBundle(true, { wireframes: "w2" }, [3], FULL_BUNDLE);
    expect(result).toEqual({
      wireframes:     "w2",
      user_flow:      "f",
      component_tree: "c",
      tech_spec:      "t",
      story_ids:      [3],
    });
  });

  it("falls back to empty strings when no existing bundle", () => {
    const result = computeActiveBundle(true, { wireframes: "w2" }, [], null);
    expect(result).toEqual({
      wireframes:     "w2",
      user_flow:      "",
      component_tree: "",
      tech_spec:      "",
      story_ids:      [],
    });
  });

  it("uses partialStoryIds when available", () => {
    const result = computeActiveBundle(true, { tech_spec: "ts" }, [5, 6], FULL_BUNDLE);
    expect(result?.story_ids).toEqual([5, 6]);
  });

  it("falls back to bundle story_ids when partialStoryIds is empty", () => {
    const result = computeActiveBundle(true, { tech_spec: "ts" }, [], FULL_BUNDLE);
    expect(result?.story_ids).toEqual([1, 2]);
  });

  it("merges all four partial sections simultaneously", () => {
    const result = computeActiveBundle(
      true,
      { wireframes: "W", user_flow: "F", component_tree: "C", tech_spec: "T" },
      [7],
      FULL_BUNDLE,
    );
    expect(result).toEqual({
      wireframes: "W", user_flow: "F", component_tree: "C", tech_spec: "T", story_ids: [7],
    });
  });
});

// ---------------------------------------------------------------------------
// canSave guard — allSectionsPopulated
// ---------------------------------------------------------------------------

function allSectionsPopulated(bundle: DesignBundle | null): boolean {
  return Boolean(bundle?.wireframes && bundle?.user_flow && bundle?.component_tree && bundle?.tech_spec);
}

describe("allSectionsPopulated", () => {
  it("returns true when all four sections have content", () => {
    expect(allSectionsPopulated(FULL_BUNDLE)).toBe(true);
  });

  it("returns false when any section is empty", () => {
    expect(allSectionsPopulated({ ...FULL_BUNDLE, wireframes: "" })).toBe(false);
    expect(allSectionsPopulated({ ...FULL_BUNDLE, user_flow: "" })).toBe(false);
    expect(allSectionsPopulated({ ...FULL_BUNDLE, component_tree: "" })).toBe(false);
    expect(allSectionsPopulated({ ...FULL_BUNDLE, tech_spec: "" })).toBe(false);
  });

  it("returns false when bundle is null", () => {
    expect(allSectionsPopulated(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateDesignSection API call sequencing (mock-level)
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/phase2", () => ({
  generateDesignSection: vi.fn(),
}));

import { generateDesignSection } from "@/lib/api/phase2";

const SECTION_ORDER: DesignSectionKey[] = ["wireframes", "user_flow", "component_tree", "tech_spec"];
const CONTEXT = { taigaToken: "tok", projectId: 1 };

async function runGenerate(
  sections: DesignSectionKey[],
  mockImpl: (ctx: unknown, section: DesignSectionKey, prior: Record<string, string>) => Promise<{ content: string; story_ids: number[] }>,
) {
  const onSection = vi.fn();
  const onDone = vi.fn();
  const mockFn = vi.mocked(generateDesignSection);
  mockFn.mockImplementation(mockImpl as unknown as typeof generateDesignSection);

  const prior: Record<string, string> = {};
  for (const section of sections) {
    const result = await generateDesignSection(CONTEXT, section, prior, new AbortController().signal);
    prior[section] = result.content;
    onSection(section, result.content, result.story_ids);
  }
  onDone();
  return { onSection, onDone };
}

beforeEach(() => {
  vi.mocked(generateDesignSection).mockReset();
});

describe("sequential generation sequencing", () => {
  it("calls generateDesignSection once per section in order", async () => {
    const calls: DesignSectionKey[] = [];
    const { onSection, onDone } = await runGenerate(SECTION_ORDER, async (_ctx, section, _prior) => {
      calls.push(section);
      return { content: `content-${section}`, story_ids: [1] };
    });

    expect(calls).toEqual(SECTION_ORDER);
    expect(onSection).toHaveBeenCalledTimes(4);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("passes prior sections to each subsequent call", async () => {
    const priorsReceived: Array<Record<string, string>> = [];
    await runGenerate(SECTION_ORDER, async (_ctx, section, prior) => {
      priorsReceived.push({ ...prior });
      return { content: `c-${section}`, story_ids: [] };
    });

    expect(priorsReceived[0]).toEqual({});
    expect(priorsReceived[1]).toHaveProperty("wireframes", "c-wireframes");
    expect(priorsReceived[2]).toHaveProperty("user_flow", "c-user_flow");
    expect(priorsReceived[3]).toHaveProperty("component_tree", "c-component_tree");
  });

  it("propagates section content to onSection callbacks", async () => {
    const { onSection } = await runGenerate(SECTION_ORDER, async (_ctx, section) => ({
      content: `result-${section}`,
      story_ids: [42],
    }));

    expect(onSection).toHaveBeenCalledWith("wireframes", "result-wireframes", [42]);
    expect(onSection).toHaveBeenCalledWith("tech_spec", "result-tech_spec", [42]);
  });
});

describe("single-section regeneration prior building", () => {
  it("builds prior from existing bundle sections before target", () => {
    const existingBundle: DesignBundle = {
      wireframes: "W", user_flow: "F", component_tree: "C", tech_spec: "T", story_ids: [1],
    };
    const targetSection: DesignSectionKey = "component_tree";
    const sectionsBefore = SECTION_ORDER.slice(0, SECTION_ORDER.indexOf(targetSection));

    const prior: Record<string, string> = {};
    for (const s of sectionsBefore) {
      prior[s] = existingBundle[s as keyof DesignBundle] as string;
    }

    expect(prior).toEqual({ wireframes: "W", user_flow: "F" });
    expect(prior).not.toHaveProperty("component_tree");
    expect(prior).not.toHaveProperty("tech_spec");
  });

  it("prior is empty when regenerating the first section", () => {
    const existingBundle: DesignBundle = {
      wireframes: "W", user_flow: "F", component_tree: "C", tech_spec: "T", story_ids: [1],
    };
    const targetSection: DesignSectionKey = "wireframes";
    const sectionsBefore = SECTION_ORDER.slice(0, SECTION_ORDER.indexOf(targetSection));

    const prior: Record<string, string> = {};
    for (const s of sectionsBefore) {
      prior[s] = existingBundle[s as keyof DesignBundle] as string;
    }

    expect(prior).toEqual({});
  });
});
