import { describe, expect, it } from "vitest";
import { buildOnboardingProjectConcept, hasMeaningfulProjectConcept, shouldShowPhase1Onboarding } from "@/lib/phase1-onboarding";
import type { ContextFile, EpicWithStories } from "@/lib/api/types";

const conceptFile = (content: string): ContextFile => ({
  filename: "project-concept.md",
  label: "Project Concept",
  content,
  chars: content.length,
});

describe("phase1 onboarding helpers", () => {
  it("treats blank template concepts as empty", () => {
    expect(hasMeaningfulProjectConcept("# Project Concept\n\n<!-- fill me -->")).toBe(false);
    expect(hasMeaningfulProjectConcept("# Project Concept\n\nBuild a quoting tool.")).toBe(true);
  });

  it("shows onboarding only for empty projects with no concept or PM backlog", () => {
    expect(shouldShowPhase1Onboarding([conceptFile("# Project Concept\n\n<!-- fill me -->")], [])).toBe(true);
    expect(shouldShowPhase1Onboarding([conceptFile("# Project Concept\n\nExisting concept")], [])).toBe(false);

    const epics = [{ id: 1, ref: 1, subject: "Auth", description: "", tags: [], stories: [] }] as unknown as EpicWithStories[];
    expect(shouldShowPhase1Onboarding([conceptFile("")], epics)).toBe(false);
  });

  it("builds a structured project concept from the intake draft", () => {
    const md = buildOnboardingProjectConcept({
      purpose: "Coordinate incident response.",
      actors: "SRE, support lead",
      constraints: "No PII in alerts.",
      pmContext: "Taiga backlog starts empty.",
      seedDocs: "Existing runbook sections.",
    });

    expect(md).toContain("## Purpose");
    expect(md).toContain("Coordinate incident response.");
    expect(md).toContain("## Primary Actors");
    expect(md).toContain("## Optional Seed Notes");
  });
});
