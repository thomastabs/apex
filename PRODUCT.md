# Product

## Register

product

## Platform

web

## Users

Two primary shapes, same underlying workflow: a **solo developer or student** running the full Phases 1-6 SDLC pipeline themselves end-to-end, and a **small dev team** collaborating on a shared project/instance with work synced through Taiga or Jira. Neither shape uses role-gated approval steps — the recent removal of the Phase 2 sign-off gate confirms the tool is built for "anyone with a dev background," not for a hierarchy of Design Lead / Tech Lead reviewers. The job to be done in both cases is the same: move a PM-tool epic through requirements, design, implementation-assist, testing, deployment, and maintenance without losing the thread back to the original spec.

## Product Purpose

Apex keeps a team's SDLC artifacts — Gherkin scenarios, design bundles, task breakdowns, test plans, deploy packs, fix logs — anchored to stable spec IDs so that AI-generated work stays traceable and human-reviewable at every gate. Success looks like: no artifact drifts silently out of sync with its source epic, every AI-generated step has a clear human checkpoint, and the traceability graph can answer "what code implements this requirement, and does it still match?" at any point in the project's life.

## Positioning

Spec-anchored traceability: every artifact the AI generates — from Gherkin scenario to deployed code — carries a stable ID back to its originating requirement, so nothing drifts out of sync without being flagged. Other AI dev tools generate code; Apex generates and *keeps track of* the whole chain.

**Why this over a raw coding agent.** A coding agent session optimizes one exchange: prompt in, diff out. Nothing in that loop stops a change from skipping the spec, losing its link back to the requirement it satisfies, or drifting from an already-locked design once the session ends. That's fine for a single change; it breaks down across many sessions, many contributors, and months of a project's life, once nobody but the code itself remembers why a line exists or whether it still satisfies what was agreed.

Apex is a process layer that sits on top of any model and adds what a bare agent loop doesn't have:

- **Stable spec IDs** (epics, scenarios, entities) link every artifact — spec, design, code, tests, PM ticket — back to one source of truth, instead of prose that can silently diverge.
- **Phase gates enforced on content, not a checklist**: a story cannot reach implementation without a locked Gherkin spec, and cannot reach `deployed` without a passed QA sign-off (or, on the stricter path, a green CI/CD run) — enforced server-side.
- **Drift detection after the fact**: deployed code is compared against the locked spec and runtime contract; findings are classified (implementation bug vs. business change vs. spec gap) and routed back to the phase that should own the fix, rather than patched forward in place.
- **State that outlives any one session**: the story index and context files, not a chat transcript, are the source of truth — whoever (or whatever agent) picks up a story later inherits the same grounding.

The short version: a coding agent accelerates writing code; Apex governs whether that code is still answering the right question.

## Brand Personality

Precise, rigorous, calm. The interface should read like a spec tool, not a hype tool — exacting under scrutiny, low-drama, the kind of surface that earns trust from someone auditing its output line by line. No urgency theater, no gamification, no "AI magic" framing. Confidence comes from visible structure (IDs, statuses, gates) rather than from persuasive copy.

## Anti-references

Not a generic SaaS marketing dashboard — no cream/gradient-hero/hero-metric-template aesthetic; this is a working tool, not a surface selling itself. Not an enterprise PM-tool skin either (no Jira-clone density-for-its-own-sake) — Apex sits *above* Taiga/Jira as the AI+traceability layer, and should feel visibly distinct from the ticket-tracker it talks to, not like another one.

## Design Principles

- **Traceability over persuasion.** Every screen should make it obvious what spec ID an artifact traces to, not sell the artifact's value.
- **Structure is the confidence signal.** Precision and calm come from visible IDs, statuses, and gates — not from marketing language or animation flourish.
- **No role theater.** The app assumes one competent technical user per action; don't reintroduce gated hierarchy in UI affordances (confirmed by the Phase 2 sign-off removal).
- **Distinct from the PM tool underneath.** Never let Apex's own UI converge toward looking like Taiga/Jira — it's the layer that reasons about the PM tool, not a reskin of it.
- **Solo and team scale the same way.** Don't design flows that assume a team exists (no forced multi-role approval); a solo user must be able to complete every phase alone.

## Accessibility & Inclusion

WCAG AA as the standard bar: contrast, keyboard navigation, and ARIA coverage on custom dialogs/dropdowns/menus held to AA, no known special user accommodations beyond that. Reduced-motion alternatives on any added animation.
