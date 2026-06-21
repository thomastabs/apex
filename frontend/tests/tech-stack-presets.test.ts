import { describe, it, expect } from "vitest";
import { TECH_STACK_PRESETS } from "@/lib/tech-stack-presets";

describe("TECH_STACK_PRESETS", () => {
  it("offers several presets with unique labels", () => {
    expect(TECH_STACK_PRESETS.length).toBeGreaterThanOrEqual(4);
    const labels = TECH_STACK_PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("each preset has a non-trivial markdown body the draft can be seeded with", () => {
    for (const p of TECH_STACK_PRESETS) {
      expect(p.body.trim().length).toBeGreaterThan(40);
      // body is the verbatim tech-stack.md seed — must mention a backend + a database
      expect(p.body).toMatch(/backend/i);
      expect(p.body.toLowerCase()).toMatch(/postgres|mongo|sqlite|database/);
    }
  });
});
