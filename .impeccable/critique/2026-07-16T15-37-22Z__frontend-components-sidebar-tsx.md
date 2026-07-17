---
target: frontend/components/sidebar.tsx
total_score: 22
p0_count: 2
p1_count: 3
timestamp: 2026-07-16T15-37-22Z
slug: frontend-components-sidebar-tsx
---
# Critique: frontend/components/sidebar.tsx

**Target:** `frontend/components/sidebar.tsx` (+ `right-sidebar.tsx` width defect noted, full critique deferred)
**Method:** Dual-agent (Assessment A design review + Assessment B detector/browser evidence), both completed
**Register/Platform:** product / web (per PRODUCT.md)

## Design Health Score (Nielsen's 10 Heuristics, 0-4 each)

| Heuristic | Score | Note |
|---|---|---|
| 1. Visibility of system status | 2/4 | Collapse button doesn't reset horizontal scroll (viewport stays shifted left after collapsing at narrow widths); drag-resize gives no live feedback that it's an interactive handle |
| 2. Match between system and real world | 3/4 | Dead Jira sign-in branch is disabled but not a real-world mismatch since it's unreachable, not misleadingly shown |
| 3. User control and freedom | 1/4 | Settings modal has no Escape-to-close and no focus trap; sign-out silently discards 4 in-progress phase drafts with zero confirmation |
| 4. Consistency and standards | 1/4 | Off-palette blue used for Jira/PM badge (violates One-Signal Rule — violet is the only accent); raw Unicode icons (`✕`, `↤`) instead of the icon library used everywhere else; sign-out has no `confirm()` gate while 9+ other destructive actions across sidebar sections do |
| 5. Error prevention | 1/4 | Sign-out and project-switch are one-click destructive (clear 4 phase-draft stores) with no confirmation, inconsistent with the rest of the app's own convention |
| 6. Recognition rather than recall | 3/4 | Nothing notable beyond standard nav affordances |
| 7. Flexibility and efficiency of use | 2/4 | Resize handle (`role="separator"`) has `tabIndex={-1}`, no keydown handler, no `aria-valuenow` — completely unreachable by keyboard; collapse is all-or-nothing (no partial/auto-responsive state) |
| 8. Aesthetic and minimalist design | 3/4 | 6 instances of `text-[10px]` off the DESIGN.md type ramp across sidebar.tsx + github-section.tsx; otherwise clean |
| 9. Help users recognize/diagnose/recover from errors | 3/4 | No error states surfaced in this component; nothing to dock here |
| 10. Help and documentation | 3/4 | N/A for this component type |

**Total: 22/40**

## Anti-Patterns Verdict

**Deterministic scan** (`detect.mjs --json` on sidebar.tsx, right-sidebar.tsx, github-section.tsx, project-section.tsx, admin-section.tsx) — exit 2, 11 findings:
- `gray-on-color`: sidebar.tsx:78 (×2 — `text-neutral-100`/`text-slate-900` on `bg-violet-500`), project-section.tsx:329,339 (×4 — `text-neutral-400`/`text-slate-500` on `bg-violet-500`) — **verified false positive**, same shape as every prior phase critique: these are theme-ternary branches (`dark ? "..." : "..."`) that never co-render, not simultaneous gray-on-violet text.
- `design-system-font-size`: 6 instances of `text-[10px]` off the type ramp (sidebar.tsx:101,118,290,294; github-section.tsx:405,411) — **real, minor**, folded into Minor Observations below.
- right-sidebar.tsx, admin-section.tsx: clean.

**Visual/browser evidence** (axe-core, live DOM measurement, both themes, 375px/768px):
- Confirmed root-cause mobile/tablet overflow: fixed inline `style={{width: sidebarWidth}}` (line ~525), `sidebarWidth` from `ui-store.ts` (default 450, clamped 280-900), zero breakpoint awareness. Measured overflow: **+309px at 375px on `/`**, **+398px at 375px on `/phase2`** (matches the 388-514px range every phase critique independently measured). At 768px, overflow is smaller on unauthenticated/empty-state pages (0-5px) but still present — confirms the defect also reaches tablet width, not just phone, though the severity is content-dependent.
- Collapse button **does** resolve the overflow when clicked (450px → 48px rail) but strips the sidebar to icon-only — an opt-in escape hatch, not a responsive fix — and leaves `window.scrollX` stuck at a stale non-zero value afterward (new bug: horizontal scroll not reset post-collapse).
- axe-core: `color-contrast` (serious), 4 nodes in light mode + 2 in dark mode, all inside the `<aside>`.
- 3 contrast failures independently confirmed via relative-luminance computation (not axe-only):
  - "Apex" logo (`#a78bfa` on `#f5f5f7`, 20px/700 → large-text 3:1 rule applies): **2.499:1** — fails even the relaxed large-text threshold.
  - "Settings" label (`#94a3b8` on `#f5f5f7`, 12px/400 → 4.5:1 rule): **2.355:1** — fails badly.
  - "Create account" link (`#64748b` on `#f5f5f7`, 4.5:1 rule): **4.371:1** — fails marginally.
- Zero React/hydration/runtime console errors from the sidebar itself across navigation, resize, theme toggle, collapse, and settings open/close.

## Overall Impression

This is the highest-leverage file in the whole batch: every one of the six phase critiques traced its mobile-overflow symptom back to this single component, and its shared chrome (logo, Settings, Create-account) fails contrast identically on every page that mounts it. Fixing `sidebar.tsx` (and its sibling `right-sidebar.tsx`, which hardcodes its own fixed 420px width the same way) resolves that entire class of previously-reported bugs in one place instead of six. Beyond the width defect, the component has real interaction-model gaps — a non-dismissible-by-keyboard Settings modal, an inaccessible resize handle, and a destructive sign-out action with no confirmation despite the app's own established convention (9+ other `confirm()` gates elsewhere in these same sidebar sections) — that make this the most consequential single target in the batch.

## What's Working

- Collapse-to-rail affordance exists and functions correctly as a manual overflow workaround, even though it isn't a substitute for real responsive behavior.
- No console/runtime errors — the component is structurally stable.
- The rest of the sidebar-section family (right-sidebar.tsx, admin-section.tsx) is clean on the deterministic scan.
- Confirmation-gating convention is already established and used consistently everywhere except sign-out — the fix is to extend an existing pattern, not invent one.

## Priority Issues

### P0 — Fixed-width sidebar breaks mobile and tablet app-wide
**What:** `<aside style={{width: sidebarWidth}}}>` (sidebar.tsx ~525) and the equivalent hardcoded 420px in `right-sidebar.tsx` have no breakpoint/matchMedia responsiveness. Confirmed overflow at 375px (+309 to +398px depending on page) and non-zero overflow at 768px.
**Why:** This is the root cause independently rediscovered by all 6 phase critiques — it's not a per-phase bug, it's a single shared-chrome defect blocking the entire app below ~1440px.
**Fix:** Either (a) force-collapse both sidebars below a matchMedia breakpoint (e.g. `md:` 768px) with the collapsed rail as the enforced default, or (b) convert both to an off-canvas drawer pattern below that breakpoint. Also fix the newly-found bug where collapsing doesn't reset `window.scrollX`.
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx frontend/components/right-sidebar.tsx`

### P0 — Settings modal has no dialog semantics, focus trap, or Escape-to-close
**What:** The Settings modal overlay (sidebar.tsx ~128-184) has no `role="dialog"`, focus never moves into it on open, and Escape does not close it — confirmed via `document.activeElement` staying on the trigger button and Escape keypress leaving the overlay present. Close only works via the raw-Unicode `✕` button.
**Why:** This is a baseline modal-accessibility requirement (WCAG 2.4.3, 4.1.2) and this app's own PRODUCT.md accessibility bar is WCAG AA — a modal that traps nothing and can't be dismissed by keyboard fails a core interaction pattern used across the app.
**Fix:** Add `role="dialog"` + `aria-modal="true"`, move focus to the first focusable element on open, restore focus to the trigger on close, and add an Escape keydown handler.
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx`

### P1 — Sign-out and project-switch discard in-progress work with zero confirmation
**What:** `signOut` (sidebar.tsx ~204-206) calls `clearSession()` + all 4 phase-draft clears with no gate, while 9+ other destructive actions across sidebar sections (`project-section.tsx`, `board-section.tsx`, `deploy-packs-section.tsx`, `users-section.tsx`, `packs-section.tsx`, `test-plans-section.tsx`, `admin-section.tsx`) all use `confirm()`.
**Why:** This is the same confirmation-inversion pattern flagged in every phase critique in this batch (high-stakes/hard-to-reverse actions with less friction than low-stakes ones) — sign-out silently destroying unsaved phase drafts is the sidebar's own instance of it, and it breaks the app's own established convention.
**Fix:** Add a `confirm()` (or proper dialog) gate to sign-out matching the existing pattern.
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx`

### P1 — Shared-chrome contrast failures on every phase page
**What:** 3 confirmed WCAG AA failures rendered on every single page in the app: "Apex" logo text (2.499:1, needs 3:1), "Settings" label (2.355:1, needs 4.5:1), "Create account" link (4.371:1, needs 4.5:1).
**Why:** Every phase critique in this batch (1 through 6) independently flagged these exact same three elements since they're the same rendered component — this is the one place to fix all six at once.
**Fix:** Raise logo/label/link colors to pass AA against both light and dark backgrounds — e.g. darken `#a78bfa`→closer to `violet-600`/`700` for light-mode logo, and lift the two slate/neutral text colors a step (`slate-500`→`slate-600`+ or equivalent per-theme).
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx`

### P1 — Off-palette blue Jira badge/branch violates the One-Signal Rule
**What:** The live Jira PM badge (~279-281) and the dead Jira sign-in branch (~349-372) both use `bg-blue-700`/`text-blue-300`/`border-blue-500/20` — a second accent color alongside violet.
**Why:** DESIGN.md's One-Signal Rule is explicit: violet is the only color allowed to carry meaning (active/selected/AI-touched); blue-as-PM-tool-indicator is a second signal channel the design system doesn't sanction.
**Fix:** Re-skin the Jira badge to use violet + a non-color differentiator (icon or label text) instead of a distinct hue.
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx`

### P2 — Resize handle is not keyboard-operable
**What:** The `role="separator"` resize handle (~530-536) has `tabIndex={-1}`, no keydown handler, no `aria-valuenow/min/max`.
**Why:** A component with an ARIA separator role implies a resizable-by-keyboard widget per the ARIA APG; as built it's mouse-only.
**Fix:** Add `tabIndex={0}`, arrow-key handlers adjusting `sidebarWidth` within its existing 280-900 clamp, and `aria-valuenow/min/max`.
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx`

### P2 — 6 instances of off-ramp font size
**What:** `text-[10px]` used 6 times (sidebar.tsx:101,118,290,294; github-section.tsx:405,411) instead of a DESIGN.md type-ramp step.
**Why:** Ad-hoc pixel values fragment the type system DESIGN.md establishes.
**Fix:** Replace with the nearest ramp step (likely `text-xs` if 10px isn't an intentional micro-label size worth adding to the ramp).
**Suggested command:** `/impeccable polish frontend/components/sidebar.tsx`

## Persona Red Flags

- A first-time user opening Settings on a laptop trackpad, expecting Escape to close it like every other modal convention on the web, gets stuck — has to hunt for the tiny `✕`.
- A solo dev signing out mid-Phase-2-draft to switch machines loses unsaved design work with zero warning — directly at odds with PRODUCT.md's "precise, rigorous" personality (a rigorous tool doesn't silently discard your work).
- Anyone on a tablet (iPad, 768px+ Android tablets) hits real, measured layout overflow — this is not an edge case, it's the default experience below ~1440px.

## Minor Observations

- Raw Unicode icons (`✕` line ~164, `↤` line ~552) instead of the `lucide-react` icons used everywhere else in the app.
- Dead Jira sign-in branch (~349-372, `pmTool` `useState` has no setter) — confirmed intentional via an adjacent code comment ("Jira login is deactivated for now (backlog)"), so this reads as a documented deferral rather than an oversight; worth deleting or feature-flagging explicitly rather than leaving live-looking dead code, but not a defect in the P0-P2 sense.
- Theme-toggle icon button contrast (4.34:1, needs 4.5:1) is a near-miss, separate from the 3 headline contrast failures.

## Questions to Consider

- Should the resize-drag feature be kept at all given it's the mechanism that lets the sidebar exceed viewport width in the first place, or should width become purely breakpoint-driven (no user-resizable rail) below tablet?
- Is the Jira sign-in branch permanently shelved, or should the dead code be deleted now that Taiga-only is confirmed the shipped behavior?

---
*Design Health Score: 22/40 · P0: 2 · P1: 3 · P2: 2*
