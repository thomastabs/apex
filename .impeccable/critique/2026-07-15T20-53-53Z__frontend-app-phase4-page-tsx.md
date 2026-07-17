---
target: frontend/app/phase4/page.tsx
total_score: 29
p0_count: 2
p1_count: 2
timestamp: 2026-07-15T20-53-53Z
slug: frontend-app-phase4-page-tsx
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector/browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Good AI-progress steps; a full draft wipe happens silently on stepper nav |
| 2 | Match System/Real World | 4/4 | "Bug Isolation Wizard", mono US#N fit the mental model well |
| 3 | User Control and Freedom | 2/4 | No undo for Clear Plan, gate-lock, or draft wipe |
| 4 | Consistency and Standards | 1/4 | Callout bypass, emerald semantic collision, off-palette sky, duplicate sign-in messaging |
| 5 | Error Prevention | 1/4 | Zero confirmation on the qa_passed lock; disguised destructive nav |
| 6 | Recognition Rather Than Recall | 4/4 | Gherkin/tasks stay reachable via collapsed detail regions throughout execution |
| 7 | Flexibility and Efficiency | 4/4 | Progressive Guide-the-AI, edge-case exploration, epic filter |
| 8 | Aesthetic and Minimalist Design | 3/4 | Dense/flat per system, undercut by an oversized hero header |
| 9 | Error Recovery | 3/4 | Fail path produces a well-scoped Fix-Bolt artifact |
| 10 | Help and Documentation | 4/4 | Collapsible process diagram, calm inline copy |
| **Total** | | **29/40** | **Good -- strongest emotional design so far, sharpest process gap** |

## Anti-Patterns Verdict

Partial. No template slop. sky-900/40 "Plan ready" badge (fifth unsanctioned hue); emerald used for three contradictory meanings in one file (hover affordance, decorative untested-ID badge, real "passed" signal); hover:shadow-md on a story card (named Flat-by-Default violation); all 5 Callout calls use default info including a real fetch error; text-5xl font-black hero header (confirmed via grep also in phase1/phase3 -- shared app-shell pattern).

Deterministic scan: 6 findings -- 4 gray-on-color (all verified false positives, same hover-only/ternary shape as every prior phase), 2 real 10px font-size advisories.

Live a11y evidence: 8 serious contrast violations. Four are the worst measured in this batch (1.18-1.51:1) -- dark-mode-tuned tokens (bg-violet-950/60, amber accents) rendering on a white light-mode page background, i.e. these elements don't re-adapt for light mode the way the rest of the page does. Distinct bug mechanism from the flat-color pattern seen elsewhere.

## Overall Impression

Best-executed emotional design of the four phases critiqued so far -- pass/fail result screens are genuinely calm and well-composed, Fail->Bug-Isolation handoff treats failure as a normal next step. But it also contains the sharpest process gap in the app: the qa_passed gate (the exact one autopilot once fabricated in production, per project memory) has less friction than the Fail path, which is hard-blocked until a report exists. "Stories" nav silently destroys all test-execution work.

## What's Working

1. Fail -> Bug Isolation Wizard handoff -- amber not red, structured artifact extraction, calm copy.
2. "Explore edge cases" -- explicitly labeled a manual checklist, no AI-magic overclaiming.
3. Progressive disclosure discipline -- Gherkin/tasks default-collapsed, Guide-the-AI summarized when filled.

## Priority Issues

[P0] qa_passed lock has zero friction while the Fail path is hard-gated. handlePass fires on one click; handleFail blocked until a bug report exists. Exact rubber-stamp risk from a real past incident. Command: harden.

[P0] Back-to-Stories nav silently destroys all QA work. clearPhase4Draft() wipes test plan, pass/fail marks, notes, bug drafts with zero warning, labeled as pure navigation. Command: harden.

[P1] Emerald means three contradictory things in one file. Hover affordance, decorative untested-ID badge, real "passed" signal -- direct One-Signal Rule violation. Command: colorize.

[P1] Callout bypassed on a real error, duplicated by hand-rolled divs elsewhere. Fetch-failure Callout uses default info instead of danger; Stage-D result panels and Regression-Bypass banner reinvent colored divs. Command: audit.

[P2] Four of the worst contrast failures in this batch (1.18-1.51:1) come from dark-tuned tokens not re-adapting in light mode -- distinct mechanism, worth its own look. Command: polish.

Mobile overflow (422px @375px) consistent with the shared sidebar issue -- tracked once at shell level.

## Persona Red Flags

Small-team lead auditing AI output: zero-friction Pass path is the sharpest red flag against the app's own core promise.
Solo dev/student: disguised-destructive "Stories" nav is the likeliest real-world accident.
Riley (accessibility): 4 stacked expand/collapse regions before the Generate button, no skip affordance.

## Minor Observations

- Testing Gate stepper label clips at 768px.
- MarkdownPreview re-imports marked/dompurify on every content-keyed re-render -- perf smell, out of scope.
- Oversized hero header exists verbatim in phase1/phase3 too -- shared markup, not independently reinvented.

## Questions to Consider

- If autopilot fabricating this exact gate was a real incident, why does the human UI ship with less friction on Pass than Fail?
- Why does the story picker's hover state use emerald, the color reserved for "done"?
- Is "Stories" nav actually navigation, or a delete action wearing a breadcrumb's clothes?
