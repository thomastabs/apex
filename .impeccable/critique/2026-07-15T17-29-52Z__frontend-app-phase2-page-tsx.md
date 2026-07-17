---
target: frontend/app/phase2/page.tsx
total_score: 28
p0_count: 1
p1_count: 3
timestamp: 2026-07-15T17-29-52Z
slug: frontend-app-phase2-page-tsx
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector/browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Strong AI-progress feedback; disabled buttons barely read as disabled in dark mode (axe + visual confirm) |
| 2 | Match System/Real World | 3/4 | Dev vocabulary (Stage A/B, mono EP-IDs) fits the user's mental model |
| 3 | User Control and Freedom | 3/4 | Good cancel/reopen coverage, but the one destructive "Regenerate All" confirm lives inside an 8s auto-dismissing toast |
| 4 | Consistency and Standards | 2/4 | Indigo/violet split (detector-confirmed), Callout-variant drift, duplicate "Step N" numbering systems on screen at once |
| 5 | Error Prevention | 4/4 | Dependency-gated generation, desync warnings, required-field gating before destructive merge |
| 6 | Recognition Rather Than Recall | 3/4 | Inline "Generate X first" messaging externalizes the section DAG |
| 7 | Flexibility and Efficiency | 3/4 | Presets + direct-edit serve both paths; no keyboard shortcuts |
| 8 | Aesthetic and Minimalist Design | 2/4 | Dense body content is on-brand; the oversized H1 undercuts it |
| 9 | Error Recovery | 2/4 | Raw errMsg() text, no retry affordance |
| 10 | Help and Documentation | 3/4 | "View Process Diagram" + inline copy substitute well for docs |
| **Total** | | **28/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

Partial — mostly on-brand but has two self-inflicted drift violations, both objectively confirmed.

LLM assessment: No hero-metric template, no gradient, no glassmorphism, no cream background, no text overflow at desktop width. But: (1) design-system-panel.tsx and screen-flow-panel.tsx are saturated with indigo (tabs, buttons, badges, node borders, edge colors) while the sibling er-diagram-panel.tsx uses violet correctly for the identical UI pattern — a direct violation of DESIGN.md's One-Signal Rule written this session. (2) phase2-workflow.tsx:589 — text-5xl font-black for the page H1 — roughly 2x DESIGN.md's documented 24px Headline ceiling, reads like the generic-dashboard hero look the anti-references explicitly reject.

Deterministic scan: 40 findings (exit code 2), all advisory/warning, no crashes. 28x design-system-font-size (9-10px text across design-system-panel.tsx, er-diagram-panel.tsx, screen-flow-panel.tsx, endpoint-table.tsx, guide-the-ai.tsx, phase2-workflow.tsx — under both the 12px Label and 11px Mono floor DESIGN.md documents). 6x gray-on-color (gray text on bg-indigo-600/bg-emerald-600 in design-system-panel.tsx:351,361,691 — DESIGN.md's own general rule, "gray text on a colored background looks washed out," violated in its own codebase). 6x design-system-color (raw hex #d4d4d4/#374151 in er-diagram-panel.tsx:173 and screen-flow-panel.tsx:194 — missing-token drift). The detector's gray-on-color hits land on the exact same lines Assessment A flagged manually for the indigo violation — strong independent confirmation. No false positives identified.

Visual overlays: no in-browser overlay was injected (axe-core was run directly instead of the detect.js overlay flow) — nothing is currently visible in a [Human] tab. Evidence is from screenshots + axe-core + console capture, not a live overlay.

Additional a11y evidence (axe-core, not part of Nielsen scoring but load-bearing): 6 serious color-contrast violations in light mode, 9 in dark mode, on the same signed-out view — dark mode is measurably worse.

## Overall Impression

Phase 2 gets the hard part right — dependency-gated generation, a named-step AI progress indicator, and collapsed-by-default sub-panels genuinely tame what should be an overwhelming amount of surface area (4 macro sections x up to 4 sub-panels). The failures are narrower than they look: two sub-panels (design-system-panel.tsx, screen-flow-panel.tsx) shipped with default Tailwind indigo instead of being harmonized to the app's own violet system, and the page's own H1 overshoots the type scale the rest of the file respects. Fix those two plus the Callout-variant adoption gap at the lock moment, and this scores solidly above 32.

## What's Working

1. AIProgressIndicator — rotating named step labels ("Writing UX Brief...") + easing progress bar + omnipresent cancel button. Answers "AI magic with no feedback" directly, and reads as visible work rather than persuasion — exactly PRODUCT.md's "structure is the confidence signal" principle in practice.
2. Dependency-gated section generation (phase2-workflow.tsx:414-480) — the ux_brief -> endpoints -> data_model -> runtime DAG is encoded into the UI (disabled states + "Generate X first" copy) instead of relying on the user to remember it.
3. Progressive disclosure via collapsed-by-default panels — ScreenFlowPanel, ERDiagramPanel, EndpointTable, GuideTheAI all start closed even after data exists, keeping a dense page scannable.

## Priority Issues

[P0] Second brand hue (indigo) violates the One-Signal Rule
Why it matters: DESIGN.md names this exact rule as what keeps Apex from reading as a generic AI-generated dashboard — two panels quietly ship the un-reskinned Tailwind default instead of the app's actual accent, and the detector independently flags the same lines via gray-on-color.
Fix: replace every indigo-* class and the #4f46e5/#6366f1 edge hexes in design-system-panel.tsx and screen-flow-panel.tsx with violet-* equivalents, using er-diagram-panel.tsx as the reference implementation.
Suggested command: /impeccable colorize

[P1] Gray text on colored backgrounds fails contrast
Why it matters: 6 detector gray-on-color warnings plus 6 (light) / 9 (dark) axe-core "serious" contrast violations on the same page — DESIGN.md's own stated rule broken in its own codebase.
Fix: swap gray text for a shade of the background's own hue at sufficient contrast, per the rule already written down.
Suggested command: /impeccable polish

[P1] Page H1 breaks the documented type scale
Why it matters: text-5xl font-black (~48px) vs. DESIGN.md's Headline spec (700/24px, deliberately rare) — contradicts "precise, rigorous, calm, not a hype tool" on the first thing every user sees.
Fix: use the existing SectionHeading primitive (text-2xl font-bold) instead of a bespoke oversized h1.
Suggested command: /impeccable typeset

[P1] Callout-variant drift lands on the highest-stakes moment
Why it matters: the design-lock success message (phase2-workflow.tsx:1042) renders the default violet/info Callout instead of variant="success"; 4 error states hand-roll red divs instead of variant="danger". This is the exact adoption gap flagged after the primitives.tsx polish, and it's landed on the one irreversible-feeling action in the file.
Fix: <Callout variant="success"> at the lock confirmation; replace the 4 hand-rolled red blocks with <Callout variant="danger">.
Suggested command: /impeccable harden

[P2] Mobile layout breaks below 768px (quantitatively confirmed)
Why it matters: at 375px, scrollWidth is 773px against a 375px viewport — the fixed sign-in sidebar consumes the whole screen with no collapse, pushing all Phase 2 content off-screen; at 768px there's still 5px of overflow clipping the "Technical Design" stepper label.
Fix: collapse the sidebar behind a breakpoint-gated toggle below ~768px, or document that mobile is explicitly out of scope.
Suggested command: /impeccable adapt

## Persona Red Flags

Alex (Power User): the "Regenerate All" destructive confirmation lives entirely inside a sonner toast with an 8000ms auto-dismiss (phase2-workflow.tsx:866-874). Glance away, lose the confirmation silently — no modal, no persistent state.

Sam (Accessibility-dependent): 6-9 serious contrast violations per axe-core; the visual mockup value-add (ReactFlow ER/Screen-Flow diagrams, ScreenBlockView) has no text-alternative for a screen-reader user. Also: the first Tab stop lands on the main-panel stepper button before any sidebar element — DOM/tab order doesn't match the visual left-to-right reading order.

Solo dev/student (PRODUCT.md's primary persona): no visible unlock/undo path for a completed Stage B lock — only Stage A has "Reopen." The only recovery path (DesignDeltaPanel) is explicitly additive-only per its own code comment. A one-person team who locks and then needs a structural rewrite has no visible way out, with nobody else to ask.

## Minor Observations

- endpoint-table.tsx's HTTP-method palette (blue/amber/orange/red/emerald/slate) introduces two hues not in DESIGN.md's four-color status vocabulary — defensible as a verb legend, but undocumented.
- screen-flow-panel.tsx:187-194 repurposes Caution Amber for "cross-file (inferred)" edges — a plausible stretch, not written down anywhere.
- Two independent "Step N" numbering systems are visible on screen simultaneously (outer stepper + per-card SECTION_CONFIG badges).
- AIProgressIndicator's progress bar is a fabricated asymptotic percentage with no real backend signal — harmless, but in mild tension with "precise, not persuasive" if scrutinized.
- A stray favicon.ico 404 from port 3001 suggests a leftover reference somewhere — not confirmed further, low stakes.

## Questions to Consider

- If violet is supposed to be the only active/AI-touched signal, would a shared color-token file (rather than ad hoc Tailwind classes typed per file) prevent this exact class of drift the next time a panel is added?
- The Save & Lock button carries the same visual weight as every "Generate" button — should Apex define a distinct (still flat, still restrained) "commit gate" treatment for irreversible actions?
- dark ? x : y is retyped by hand hundreds of times across this file and its sub-components — would migrating further toward the CSS-variable theming DESIGN.md already partially describes eliminate this whole category of drift at the source?
