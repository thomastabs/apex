import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DesignSectionKey } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// activeBundle merge logic (pure, no React needed)
// ---------------------------------------------------------------------------

type DesignBundle = {
  ux_brief: string;
  api_surface: string;
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
      ux_brief:    partial.ux_brief    ?? designBundle?.ux_brief    ?? "",
      api_surface: partial.api_surface ?? designBundle?.api_surface ?? "",
      story_ids:   partialStoryIds.length ? partialStoryIds : (designBundle?.story_ids ?? []),
    };
  }
  return designBundle;
}

const FULL_BUNDLE: DesignBundle = {
  ux_brief:    "## Screens\n- Login",
  api_surface: "## Endpoints\n- POST /auth",
  story_ids:   [1, 2],
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
    const result = computeActiveBundle(true, { ux_brief: "updated UX" }, [3], FULL_BUNDLE);
    expect(result).toEqual({
      ux_brief:    "updated UX",
      api_surface: "## Endpoints\n- POST /auth",
      story_ids:   [3],
    });
  });

  it("falls back to empty strings when no existing bundle", () => {
    const result = computeActiveBundle(true, { ux_brief: "UX" }, [], null);
    expect(result).toEqual({
      ux_brief:    "UX",
      api_surface: "",
      story_ids:   [],
    });
  });

  it("uses partialStoryIds when available", () => {
    const result = computeActiveBundle(true, { api_surface: "API" }, [5, 6], FULL_BUNDLE);
    expect(result?.story_ids).toEqual([5, 6]);
  });

  it("falls back to bundle story_ids when partialStoryIds is empty", () => {
    const result = computeActiveBundle(true, { api_surface: "API" }, [], FULL_BUNDLE);
    expect(result?.story_ids).toEqual([1, 2]);
  });

  it("merges both partial sections simultaneously", () => {
    const result = computeActiveBundle(
      true,
      { ux_brief: "UX", api_surface: "API" },
      [7],
      FULL_BUNDLE,
    );
    expect(result).toEqual({ ux_brief: "UX", api_surface: "API", story_ids: [7] });
  });
});

// ---------------------------------------------------------------------------
// canSave guard — allSectionsPopulated
// ---------------------------------------------------------------------------

function allSectionsPopulated(bundle: DesignBundle | null): boolean {
  return Boolean(bundle?.ux_brief && bundle?.api_surface);
}

describe("allSectionsPopulated", () => {
  it("returns true when both sections have content", () => {
    expect(allSectionsPopulated(FULL_BUNDLE)).toBe(true);
  });

  it("returns false when any section is empty", () => {
    expect(allSectionsPopulated({ ...FULL_BUNDLE, ux_brief: "" })).toBe(false);
    expect(allSectionsPopulated({ ...FULL_BUNDLE, api_surface: "" })).toBe(false);
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

const SECTION_ORDER: DesignSectionKey[] = ["ux_brief", "api_surface"];
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
    expect(onSection).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("passes prior sections to each subsequent call", async () => {
    const priorsReceived: Array<Record<string, string>> = [];
    await runGenerate(SECTION_ORDER, async (_ctx, section, prior) => {
      priorsReceived.push({ ...prior });
      return { content: `c-${section}`, story_ids: [] };
    });

    expect(priorsReceived[0]).toEqual({});
    expect(priorsReceived[1]).toHaveProperty("ux_brief", "c-ux_brief");
  });

  it("propagates section content to onSection callbacks", async () => {
    const { onSection } = await runGenerate(SECTION_ORDER, async (_ctx, section) => ({
      content: `result-${section}`,
      story_ids: [42],
    }));

    expect(onSection).toHaveBeenCalledWith("ux_brief", "result-ux_brief", [42]);
    expect(onSection).toHaveBeenCalledWith("api_surface", "result-api_surface", [42]);
  });
});

describe("single-section regeneration prior building", () => {
  it("builds prior from ux_brief when regenerating api_surface", () => {
    const existingBundle: DesignBundle = {
      ux_brief: "UX", api_surface: "API", story_ids: [1],
    };
    const targetSection: DesignSectionKey = "api_surface";
    const sectionsBefore = SECTION_ORDER.slice(0, SECTION_ORDER.indexOf(targetSection));

    const prior: Record<string, string> = {};
    for (const s of sectionsBefore) {
      prior[s] = existingBundle[s as keyof DesignBundle] as string;
    }

    expect(prior).toEqual({ ux_brief: "UX" });
    expect(prior).not.toHaveProperty("api_surface");
  });

  it("prior is empty when regenerating the first section", () => {
    const existingBundle: DesignBundle = {
      ux_brief: "UX", api_surface: "API", story_ids: [1],
    };
    const targetSection: DesignSectionKey = "ux_brief";
    const sectionsBefore = SECTION_ORDER.slice(0, SECTION_ORDER.indexOf(targetSection));

    const prior: Record<string, string> = {};
    for (const s of sectionsBefore) {
      prior[s] = existingBundle[s as keyof DesignBundle] as string;
    }

    expect(prior).toEqual({});
  });
});
