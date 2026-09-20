import type { ContextFile, EpicWithStories } from "@/lib/api/types";

export type Phase1OnboardingDraft = {
  purpose: string;
  actors: string;
  constraints: string;
  pmContext: string;
  seedDocs: string;
};

export function hasMeaningfulProjectConcept(content = "") {
  const text = content.replace(/^#[^\n]*\n/, "").trim();
  return Boolean(text) && !text.startsWith("<!--");
}

export function shouldShowPhase1Onboarding(
  contextFiles: ContextFile[] | undefined,
  epics: EpicWithStories[] | undefined,
) {
  if (!contextFiles || !epics) return false;
  const concept = contextFiles.find((f) => f.filename === "project-concept.md")?.content ?? "";
  const storyCount = epics.reduce((count, epic) => count + epic.stories.length, 0);
  return !hasMeaningfulProjectConcept(concept) && epics.length === 0 && storyCount === 0;
}

function section(title: string, value: string) {
  return [`## ${title}`, "", value.trim() || "_Not specified yet._"].join("\n");
}

export function buildOnboardingProjectConcept(draft: Phase1OnboardingDraft) {
  return [
    "# Project Concept",
    "",
    section("Purpose", draft.purpose),
    "",
    section("Primary Actors", draft.actors),
    "",
    section("Constraints and Non-Goals", draft.constraints),
    "",
    section("PM Context", draft.pmContext),
    "",
    section("Optional Seed Notes", draft.seedDocs),
  ].join("\n");
}

// Maintenance -> Phase 1 handoff: format the (possibly user-edited) placement
// review as an NL draft in the same "[SIZE] Title" shape generate-nl-stories
// emits (see format_nl_draft in ai_engine.py), so it reads naturally in the
// same textarea and compiles the same way through /api/phase1/compile-gherkin.
// The change request's own subject/description are always folded in as a
// Scenario line so nothing from the original signal is lost, even when the
// AI placement step failed or was skipped entirely.
export function buildMaintenanceIntakeNlDraft(input: {
  storyTitle: string;
  storyDescription: string;
  subject: string;
  description: string;
}) {
  const lines = [`[M] ${input.storyTitle.trim() || input.subject.trim()}`, ""];
  if (input.storyDescription.trim()) {
    lines.push(input.storyDescription.trim(), "");
  }
  lines.push(`Scenario: ${input.subject.trim()}`);
  if (input.description.trim()) lines.push(input.description.trim());
  lines.push("", "---");
  return lines.join("\n").trim();
}
