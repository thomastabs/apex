---
target: frontend/components/right-sidebar.tsx
total_score: 27
p0_count: 1
p1_count: 3
timestamp: 2026-07-16T15-56-27Z
slug: frontend-components-right-sidebar-tsx
---
# Critique: frontend/components/right-sidebar.tsx

**Target:** `frontend/components/right-sidebar.tsx` (+ 8 composed sections: project/context/board/tasks/packs/test-plans/deploy-packs/users, plus shared.tsx)
**Method:** Dual-agent (Assessment A design review + Assessment B detector/browser evidence), both completed
**Register/Platform:** product / web (per PRODUCT.md)

## Design Health Score (Nielsen's 10 Heuristics, 0-4 each)

| Heuristic | Score | Note |
|---|---|---|
| 1. Visibility of system status | 3/4 | Loaders/skeletons/toasts used consistently; undercut by query failures rendering identically to empty state |
| 2. Match between system and real world | 4/4 | Precise domain language (semver, phase-status transitions), correct spec-tool register |
| 3. User control and freedom | 2/4 | Only 3 of 8 sections wire `useEscapeKey` on their dialogs; shared `ConfirmDialog` and `PanelHeader` (used 8x each) have no Escape/focus-trap/ARIA; resize handle is pointer-only |
| 4. Consistency and standards | 1/4 | ID-mono applied inconsistently even within one file (`US#` mono, adjacent `Task #` not); `context-section.tsx` forks its own status-color palette instead of DESIGN.md tokens; several buttons hardcode a color with no `dark ?` branch while sibling buttons in the same file do branch |
| 5. Error prevention | 3/4 | Every destructive action found is confirm-gated — no regression here, unlike every other file in this batch |
| 6. Recognition rather than recall | 3/4 | Active AI-model badge, semver badges, relative timestamps keep state visible |
| 7. Flexibility and efficiency of use | 2/4 | Drag-reorder, resize, collapse-to-rail all pointer-only, no keyboard path |
| 8. Aesthetic and minimalist design | 4/4 | Correctly flat-by-default — shadows only on true overlays, dense ledger-style rows match the North Star |
| 9. Help users recognize/diagnose/recover from errors | 2/4 | Global `QueryCache.onError` only toasts on HTTP 401; every other list query (board/packs/test-plans/tasks/users/projects) swallows fetch failures silently with no `isError` branch — a genuinely-empty list and a broken fetch look identical |
| 10. Help and documentation | 3/4 | Context-guide dialog, semver tooltip, risk/regression `aria-label`+`title` explanations present |

**Total: 27/40**

## Anti-Patterns Verdict

**Deterministic scan** (`detect.mjs --json` on right-sidebar.tsx + all 8 imported sections) — exit 2, 11 findings:
- `gray-on-color` (7×): project-section.tsx:329,339; context-section.tsx:222; board-section.tsx:927,985 — **verified false positive**, same theme-ternary shape confirmed repeatedly across this entire batch.
- `design-system-font-size` (4×, advisory): context-section.tsx:357, board-section.tsx:857, tasks-section.tsx:541,551 — real, minor, off-ramp `10px` literals.
- right-sidebar.tsx, packs/test-plans/deploy-packs-section.tsx: clean.

**Visual/browser evidence** (axe-core + live DOM measurement, both themes, 375px/768px):
- Confirmed `right-sidebar.tsx:157` (`style={{ width }}`) + `ui-store.ts` `rightSidebarWidth: 420` default, clamped 280-900, zero breakpoint awareness — same defect shape as the left sidebar.
- **Combined-sidebar measurement (new, more severe than either sidebar critique alone):** at 375px, left sidebar (450px) + right sidebar (420px) = 870px combined, both fixed-width. Right sidebar renders starting at x=450 — entirely past the 375px viewport edge — and `<main>` is squeezed to **exactly 0px width**. At 768px tablet width, 870px combined still exceeds the viewport and `<main>` is still 0px. This isn't degraded layout, it's total content inaccessibility below ~870px viewport width whenever both sidebars are open.
- axe-core: `color-contrast` (serious) — Filter button idle state (dark 2.41:1, light 2.35:1) in both Board and Tasks sections (shared `PanelHeader` actions slot); "Create New"/"Delete Project" buttons hardcode `text-violet-400`/`text-red-400` with no dark-mode branch (2.4:1, 2.42:1 in light mode); **`shared.tsx:104`'s `PanelHeader` badge span hardcodes `text-violet-400` with zero theme branching (2.22:1 in light mode) — a single shared-component bug propagating to every section using the `badge` prop** (context char-count, board epic-count, etc.).
- axe-core: `select-name` (critical) — the project-switcher `<select>` (`project-section.tsx` ~line 72) has no accessible name at all (no label/aria-label/aria-labelledby/title), theme-independent.
- Zero frontend-origin console errors/React warnings/hydration mismatches (all console noise was expected `ERR_CONNECTION_REFUSED` against a deliberately-stopped backend).

## Overall Impression

This file is the most visually disciplined of the batch — correct flat-by-default surfaces, correct violet-as-sole-signal in the large majority of cases, precise domain language, and (uniquely in this batch) zero confirmation-gating regressions. Its problems are structural, not aesthetic: the same fixed-width defect found in the left sidebar, compounded — with both sidebars open the app's main content column collapses to literally zero width below ~870px, which is a stricter and more complete failure than either sidebar critique found alone. Its two most-reused shared components (`ConfirmDialog`, `PanelHeader`, each used across all 8 sections) lack basic ARIA/keyboard coverage that three of the eight sections already prove the team knows how to build, and one of `PanelHeader`'s own hardcoded colors fails contrast in light mode everywhere the `badge` prop is used. Most consequential for a tool whose entire pitch is "nothing drifts silently": query failures are indistinguishable from empty state everywhere except the 401 path.

## What's Working

- Confirmation-gating is complete and correct across every destructive action in all 8 sections — no regression here, the one file in the batch to get this fully right.
- Flat-by-default and One-Signal are followed correctly in the overwhelming majority of surfaces.
- Genuine in-context help exists (context-guide dialog, semver tooltip, risk/regression tooltips) — not just decoration.
- `packs-section.tsx`, `test-plans-section.tsx`, `deploy-packs-section.tsx` already demonstrate the right pattern (`useEscapeKey`, `role="dialog"`, `aria-modal`) — the fix for the rest of the batch is to extend an existing, proven pattern, not invent one.

## Priority Issues

### P0 — Combined sidebar widths collapse main content to 0px below ~870px viewport
**What:** `right-sidebar.tsx:157` (`style={{ width }}`, default 420px, `ui-store.ts`) has the identical no-breakpoint defect as the left sidebar (450px). With both open, confirmed via live DOM measurement: `<main>` renders at **exactly 0px width** at both 375px and 768px viewports — the right sidebar itself renders off-screen (starting past the viewport edge) at 375px.
**Why:** This is strictly worse than the mobile-overflow finding in the `sidebar.tsx` critique alone — it's not degraded layout, it's total inaccessibility of page content on any viewport under ~870px whenever both panels are open.
**Fix:** Same fix as `sidebar.tsx`'s P0 — matchMedia force-collapse (or off-canvas) below a shared breakpoint, applied to both sidebars together so they can't simultaneously claim more width than the viewport has.
**Suggested command:** `/impeccable polish frontend/components/right-sidebar.tsx frontend/components/sidebar.tsx`

### P1 — Shared `ConfirmDialog` and `PanelHeader` lack ARIA/keyboard coverage (used 8x each)
**What:** `frontend/components/sidebar/shared.tsx`'s `ConfirmDialog` (lines 7-27, gates every destructive action in the file) and `PanelHeader` (line 94, the collapsible-section toggle used by all 8 sections) have no `role="dialog"`/`aria-modal`/Escape handling and no `aria-expanded`/`aria-controls` respectively. Meanwhile `packs-section.tsx:262-263`, `test-plans-section.tsx:244-245`, `deploy-packs-section.tsx:207-208` already correctly wire `useEscapeKey` + dialog roles for their own local dialogs.
**Why:** Since both are shared components reused across every section, fixing them once fixes the gap everywhere at once — and the pattern to copy already exists three times over in the same codebase.
**Fix:** Add `role="dialog"`+`aria-modal="true"`+Escape handling to `ConfirmDialog`; add `aria-expanded`+`aria-controls` to `PanelHeader`'s disclosure button.
**Suggested command:** `/impeccable polish frontend/components/sidebar/shared.tsx`

### P1 — `select-name` critical: project-switcher has no accessible name
**What:** The project-switcher `<select>` (`project-section.tsx` ~line 72) has no label, `aria-label`, `aria-labelledby`, or `title` — confirmed by axe-core as `critical` severity, theme-independent.
**Why:** This is the one `select-name` critical finding across the entire 8-target batch — a screen-reader user has no way to know what this control does.
**Fix:** Add `aria-label="Switch project"` (or a visually-hidden `<label>`).
**Suggested command:** `/impeccable polish frontend/components/sidebar/project-section.tsx`

### P1 — Unbranched hardcoded colors fail light-mode contrast, one instance propagates via a shared component
**What:** `shared.tsx:104` (`PanelHeader` badge span) hardcodes `text-violet-400` with zero `dark ?` branch (2.22:1 in light mode) — propagates to every section using the `badge` prop. `project-section.tsx:135,148` ("Create New"/"Delete Project" buttons) hardcode `text-violet-400`/`text-red-400` the same way (2.4:1, 2.42:1), inconsistent with the adjacent Refresh button in the same file which does branch correctly.
**Why:** These are the same One-Signal/theme-awareness class of bug fixed in `phase2-workflow.tsx` earlier this batch (Session 5) — same shape, different files, still unfixed here.
**Fix:** Add the missing `dark ? "text-violet-400" : "text-violet-700"` (and equivalent for red) branches, matching the pattern already used correctly elsewhere in the same files.
**Suggested command:** `/impeccable polish frontend/components/sidebar/shared.tsx frontend/components/sidebar/project-section.tsx`

### P2 — Query failures are indistinguishable from empty state
**What:** `frontend/app/providers.tsx:18-24`'s global `QueryCache.onError` only toasts on HTTP 401. Board/packs/test-plans/tasks/users/project list queries never destructure `isError`, so a failed fetch renders the same "No epics yet." empty state as a genuinely empty board (`board-section.tsx:719,1005` and equivalents elsewhere).
**Why:** Directly at odds with PRODUCT.md's "precise, rigorous" personality and the app's core traceability pitch — a broken network call should never look identical to "there's nothing here."
**Fix:** Destructure `isError`/`error` from each list query and render a distinct error state with a retry action, or broaden the global `onError` toast beyond 401.
**Suggested command:** `/impeccable polish frontend/components/right-sidebar.tsx`

### P2 — Identifier-Is-Mono Rule applied inconsistently
**What:** `project-section.tsx:116` ("ID {id} · {slug}"), `board-section.tsx:924,952,106,389` (`#{ref}`) render plain text; `packs-section.tsx` renders `Task {p.task_id}` in plain text two lines below a correctly-mono `US#{storyId}` (`packs-section.tsx:174-176`).
**Why:** DESIGN.md's rule is unconditional — any ID must be monospace; the inconsistency is visible within single files, not just across the codebase.
**Fix:** Apply `font-mono` to all identifier renders found above.
**Suggested command:** `/impeccable polish frontend/components/sidebar/project-section.tsx frontend/components/sidebar/board-section.tsx frontend/components/sidebar/packs-section.tsx`

### P2 — Filter button idle-state contrast fails in both themes
**What:** axe-confirmed `color-contrast` serious on the Filter toggle (idle) in both Board and Tasks sections: dark 2.41:1, light 2.35:1 (both need 4.5:1).
**Why:** Same shared-affordance repeated in two sections — one fix, two places.
**Fix:** Raise idle-state Filter text color a step in both themes.
**Suggested command:** `/impeccable polish frontend/components/sidebar/board-section.tsx frontend/components/sidebar/tasks-section.tsx`

### P3 — `context-section.tsx` forks its own status-color palette
**What:** `context-section.tsx:23-27` hardcodes `#4ade80`/`#facc15`/`#f87171` via inline `style={{ color }}` instead of DESIGN.md's canonical `#10b981`/`#f59e0b`/`#dc2626` tokens (or the Tailwind classes used two lines away in the same file).
**Why:** Parallel undocumented palette drifts from the single design-token source of truth.
**Fix:** Replace with the canonical tokens/Tailwind classes.
**Suggested command:** `/impeccable polish frontend/components/sidebar/context-section.tsx`

### P3 — 4 instances of off-ramp font size + missing icon-button labels
**What:** `text-[10px]` at context-section.tsx:357, board-section.tsx:857, tasks-section.tsx:541,551. Icon-only buttons with no `aria-label`/`title`: right-sidebar.tsx:135-141 (collapsed-rail icons), board-section.tsx:826 (clear-filter), :841 (refresh).
**Fix:** Snap to the type ramp; add `aria-label` to the listed icon buttons.
**Suggested command:** `/impeccable polish frontend/components/right-sidebar.tsx frontend/components/sidebar/board-section.tsx`

## Persona Red Flags

- Anyone on a tablet or narrow laptop window with both sidebars open literally cannot see or interact with the main workspace content — not degraded, gone (0px width, confirmed at 768px).
- A screen-reader user encountering the unlabeled project-switcher has no way to know what the control does or does what.
- A user whose network drops mid-session sees "No epics yet." instead of any indication something failed — directly contradicts the "precise, rigorous, nothing drifts silently" personality this app is built on.

## Minor Observations

- The right sidebar is entirely absent (not even collapsed) when unauthenticated (`right-sidebar.tsx:111`, `if (!taigaToken) return null`) — correct behavior, noted only because it required a session-token workaround to test, not a defect.
- `packs-section.tsx`/`test-plans-section.tsx`/`deploy-packs-section.tsx` already show the correct dialog-accessibility pattern — worth using as the internal reference implementation when fixing the P1 above.

## Questions to Consider

- Should the two sidebars share one `useUiStore` responsive policy (e.g. a single "compact mode" flag that force-collapses both together below a breakpoint) rather than each independently clamping its own width?
- Given `packs/test-plans/deploy-packs-section.tsx` already have the correct accessible-dialog pattern, would it be worth extracting a single `AccessibleDialog` wrapper so the other 5 sections (and `ConfirmDialog`) inherit it automatically instead of needing individual fixes?

---
*Design Health Score: 27/40 · P0: 1 · P1: 3 · P2: 3 · P3: 2*
