---
target: frontend/app/phase2/page.tsx
total_score: 35
p0_count: 0
p1_count: 2
timestamp: 2026-07-15T20-20-07Z
slug: frontend-app-phase2-page-tsx
---
Method: dual-agent (A: general-purpose design review re-run · B: general-purpose detector/browser evidence re-run, retried once after an initial API failure)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4/4 | Excellent — progress indicator, per-section badges, cancel affordances |
| 2 | Match System/Real World | 3/4 | Dense dev jargon, fine for this audience |
| 3 | User Control and Freedom | 3/4 | Good undo/back coverage, but clearDesign() wipes the whole bundle on one click, no confirm |
| 4 | Consistency and Standards | 3/4 | P0 indigo fix genuinely landed, but stepper now reuses violet for "done" — reopens the same ambiguity one hue over |
| 5 | Error Prevention | 4/4 | Overwrite confirms, downstream-desync warnings |
| 6 | Recognition Rather Than Recall | 4/4 | Generated/Not-generated badges, inline gating copy |
| 7 | Flexibility and Efficiency | 4/4 | Per-section/per-screen regen, presets, cross-check |
| 8 | Aesthetic and Minimalist Design | 3/4 | Endpoint table + ER diagram introduce blue/orange/sky, undermining one-accent identity |
| 9 | Error Recovery | 4/4 | All 4 error paths now unified on Callout variant="danger" |
| 10 | Help and Documentation | 3/4 | Unchanged, adequate for this audience |
| **Total** | | **35/40** | **Good — up from 28/40** |

## Fix Verification (from prior critique)

- P0 indigo->violet drift: FIXED. Zero indigo matches in either file; both agents confirm.
- P1 oversized H1: FIXED. SectionHeading (h2, 24px/700) in place, no text-5xl remains.
- P1 Callout-variant drift: FIXED. Lock success = variant="success", all 4 error divs = variant="danger".
- P1 gray-on-color contrast (stepper label + amber subtitle): FIXED. Live axe-core confirms neither named element appears in the violation list anymore; dark serious violations 9->5, light 6->7.
- P2 mobile breakage (deferred): NOT FIXED, confirmed worse than described. 375px: 398px horizontal overflow, unchanged 773px scrollWidth; sidebar doesn't collapse -- Phase 2 content isn't in the initial viewport at all, not just cramped.

The 3 gray-on-color false positives from last time are unchanged in shape -- same ternary-branch pattern, now firing against violet-600/emerald-600 instead of indigo-600. Still not real (mutually-exclusive branches never co-render); left as-is.

## New Findings (the fixes reopened or exposed)

[P1] Stepper reuses violet for "done," recreating the One-Signal ambiguity one hue over. phase2-workflow.tsx:651-657,670-675 -- done-state uses bg-violet-800/ring-violet-700 (dark), bg-violet-100/ring-violet-300 (light). DESIGN.md's own Cards section specifies emerald for "done," violet for "active" only. Command: colorize.

[P1] endpoint-table.tsx + er-diagram-panel.tsx introduce blue/orange/sky outside the sanctioned ramp. HTTP-method coding and FK-field styling add hues DESIGN.md explicitly bans. Command: harden.

[P2] Untouched text-violet-500 on the "Phase 2" eyebrow label fails contrast in both themes (phase2-workflow.tsx:588, 4.06 dark / 4.23 light, needs 4.5) -- a different instance than the two that got fixed. Command: polish.

[P2] shadow-sm applied unconditionally in dark mode on ScreenNode/EntityNode, violating Flat-by-Default. Command: polish.

[P3] Sparkles icon on every AI-trigger button contradicts PRODUCT.md's "no AI magic framing." Command: quieter.

[P3] Step-1 "already locked" Callout still renders variant="info" instead of variant="success", inconsistent with the newly-fixed Stage-B lock pattern. Command: harden.

Mobile (P2, still open) stays deferred.

## Persona Red Flags

- Riley (mobile): hard fail -- cannot reach Phase 2's content at all at common phone widths without horizontal scrolling.
- Alex (power/keyboard): endpoint method filter pills signal "active" via same-hue ring rather than the app's usual violet selection language.
- Jordan (accessibility): design-lock success/failure Callout has no role="status"/aria-live -- screen-reader users won't get an announcement.
- Solo dev/spec-auditor persona: would immediately flag the stepper's reuse of violet for "done" as exactly the kind of inconsistency this design system is built to prevent.

## Minor Observations

- No h1 anywhere on the page (SectionHeading renders h2) -- axe flags page-has-heading-one (moderate).
- Two different amber "recipes" for what are conceptually the same warning-banner pattern.
- CrossCheckPanel's "alt model" chip uses emerald as a decorative model-identity color, not a status.

## Questions to Consider

- If violet means "active/selected/AI-touched" only, why does the stepper still use it for "done" -- didn't this exact ambiguity just get fixed one hue over?
- Is "one accent color" actually the rule, or is the real rule "one color for chrome, plus whatever a data-viz sub-feature invents for itself" (endpoint table's 6-color method key)?
- Now that mobile is confirmed to be "content isn't reachable without horizontal scroll," not just "cramped" -- is the P2 severity still right?
