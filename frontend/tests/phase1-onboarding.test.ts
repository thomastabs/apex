import { describe, expect, it } from "vitest";
import {
  buildMaintenanceIntakeNlDraft,
  buildOnboardingProjectConcept,
  hasMeaningfulProjectConcept,
  shouldShowPhase1Onboarding,
} from "@/lib/phase1-onboarding";
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

  it("formats a Maintenance change request as a Phase 1 NL draft, never dropping the raw subject/description", () => {
    const nlDraft = buildMaintenanceIntakeNlDraft({
      storyTitle: "Export report as CSV",
      storyDescription: "As a user I want to export a report as CSV.",
      subject: "Add CSV export",
      description: "Users keep asking for a way to export reports.",
    });
    expect(nlDraft).toContain("[M] Export report as CSV");
    expect(nlDraft).toContain("As a user I want to export a report as CSV.");
    expect(nlDraft).toContain("Scenario: Add CSV export");
    expect(nlDraft).toContain("Users keep asking for a way to export reports.");
  });

  it("falls back to the raw subject as the title when no story title is given", () => {
    const nlDraft = buildMaintenanceIntakeNlDraft({
      storyTitle: "",
      storyDescription: "",
      subject: "General slowness",
      description: "",
    });
    expect(nlDraft).toContain("[M] General slowness");
    expect(nlDraft).toContain("Scenario: General slowness");
  });
});
