# Context for Codex working on Outfolio

Save this file as `AGENTS.md` in the root of the Outfolio repository (named
differently here only because Apex's own repo, where this thesis lives,
gitignores that exact filename repo-wide for an unrelated reason). It is
grounding for whatever AI coding tool works on this project — currently
Codex — not documentation for human contributors, though a human reading it
should understand the project the same way.

## What this project actually is, and why it matters that you read this file

Outfolio is a real product with a real problem behind it (below), and it is
also the field site for a Master's thesis demonstration. The thesis is about
a process framework for governing how a human and an AI collaborate across a
software development lifecycle — phases, gates, and a human decision at the
end of each one. Building Outfolio *is* the demonstration: the author is
applying that framework's phases and gates to this project by hand, using
you as the AI counterpart the framework's phase table assigns a role to at
each stage. What you produce, what gets accepted or changed, and where a gate
passes or sends work back, all become data in that thesis chapter.

This has one concrete consequence for how you should behave: **do not treat
a phase boundary as something to move past on your own.** Produce what the
current phase asks for, then stop and let the human decide what to do with
it, even if you're confident it's correct or if continuing would be faster.
The evidentiary value of this project depends on a visible human decision at
each boundary, not on you shipping working code as fast as possible. If
you're ever unsure whether you're still inside the phase you were asked to
work in, ask rather than proceed.

## The product problem

Outfolio exists because a developer who builds professionally on OutSystems,
a low-code platform, cannot show his own portfolio of work to anyone outside
that platform. OutSystems' project export preserves an application's logic
and data model but no visual record of what the application actually looks
or behaves like, so a portfolio built from that export shows structure
without ever showing a result. This generalises beyond OutSystems to any
developer whose substantial work lives inside a platform that does not treat
"what this looked like to a user" as an exportable artefact.

Outfolio is a portfolio and project-documentation platform that closes that
gap: a developer documents a project as a case study, screenshots,
architecture notes, the problem it solved and the outcome, independently of
whatever platform the underlying project was built in or whether that
platform still exists.

## Scope: 6 epics, ~18 stories, nothing more

This is deliberately small. It exists to exercise the framework properly,
not to become the original larger product vision. Do not propose expanding
scope, adding epics, or gold-plating a story beyond what it asks for — if
something looks genuinely missing, say so and let the human decide whether
it becomes a new story, rather than building it unasked.

1. **Authentication & Session** — Register account; Log in; Maintain
   authenticated session; Redirect/protect authenticated pages.
2. **Developer Profile** — View own profile; Edit profile details; Manage
   profile visibility; View public developer profile.
3. **Project Case Studies** — Create project case study; Edit project case
   study; Delete draft project; Publish/unpublish project.
4. **Public Portfolio Experience** — Show published projects on public
   profile; View public project page; Hide private/unpublished projects
   from public visitors.
5. **Discovery / Browse** — Browse published projects; filter or search
   published projects by simple criteria, if time allows.
6. **Quality, Deployment & Demo Readiness** — Backend tests for
   auth/profile/project visibility; frontend tests for key forms and public
   pages; deployment configuration; validate the production demo flow.

Target: fully implemented, tested and deployed by end of September 2026.

## The lifecycle phases, and what you are and are not asked to do in each

The framework defines six phases plus a pre-lifecycle Strategic Alignment
step (already done — the epics above are the result of it). For each phase
below: what you're expected to produce, and what stays a human decision.

**Discovery & Requirements.** Draft User Stories in plain natural language
first, sized small enough that a story is a single day or two of work, not a
whole epic in one sentence. Do not jump straight to formal Gherkin — draft in
prose, let the human critique, add, delete, or modify what you drafted, and
only compile to Gherkin acceptance criteria after that critique is done.
Give every scenario a stable identifier once locked. If a story looks bigger
than XS/S, say so rather than writing a large story and hoping it's fine —
oversized stories get split before they proceed, not after.

**Design, Prototyping & Architecture.** Propose architectural options and a
UI structure; do not just pick one and build it. Produce a technical
specification (interface contract, data model, runtime contract) precise
enough that someone could implement against it without you. Usability and
technical feasibility are both explicitly reviewed before anything moves to
implementation — expect that review to happen and don't skip ahead of it.

**Implementation.** Before generating code for a task, a test set should
exist that constrains what you produce — write or confirm the tests first,
then generate against them, not the reverse. You are expected to be able to
explain the logic you generated if asked; if you can't articulate why a piece
of generated code is correct, that's a signal to slow down, not to move on.

**Testing.** Draft end-to-end BDD scripts derived from the locked Gherkin
from Discovery. These get reviewed and refined by a human before execution,
and edge cases get probed manually on top of what you draft — your scripts
are a starting point for validation, not the validation itself.

**Deployment.** Generate configuration, infrastructure-as-code, or migrations
only when a real infrastructure delta requires them — do not generate
deployment config speculatively. Every release is explicitly approved and
its security implications reviewed by whoever performs the deployment before
it goes out.

**Maintenance.** If a post-deployment issue comes up, the framework wants the
context you're given narrowed to the specific report, its test evidence, and
the isolated fragment implicated — not full-project context — and it wants
the signal classified (business change vs. specification gap vs. genuine
defect) before anything gets changed. If this comes up, flag it explicitly
rather than silently patching around it.

## What to record as you go

A contemporaneous log is being kept alongside this project
(`demonstration-log.local.md` in the thesis repo, not this one) recording,
per story: what you drafted first, what got accepted or changed and why, the
gate outcome, and anywhere the process felt awkward or got bypassed. You
don't need to maintain that file yourself, but you should make it easy for
the human to fill in accurately — when you produce a draft artefact (a
scenario, a spec, a test script), say so plainly and distinctly from your
final, revised output, so "what the AI produced first" and "what it looks
like after review" stay distinguishable in the conversation history even if
they're not both saved as separate files.

## What not to do

- Don't skip the natural-language draft step in Discovery and go straight to
  formal Gherkin, even if you're confident about the requirement.
- Don't generate implementation code before a test set for that task exists.
- Don't generate deployment/infrastructure config unless a real delta
  requires it.
- Don't expand scope beyond the 6 epics / ~18 stories above.
- Don't treat "I could keep going and finish the next phase too" as a reason
  to do so. Stop at the phase boundary.
