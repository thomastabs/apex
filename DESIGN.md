---
name: Apex
description: Spec-anchored AI SDLC workspace — dense, flat, traceable
colors:
  primary: "#7c3aed"
  primary-hover: "#8b5cf6"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#dc2626"
  ink: "#111827"
  muted: "#7c8194"
  border-light: "#d9dce6"
  border-dark: "#262626"
  bg-dark: "#121113"
  bg-dark-elevated: "#1b1b1c"
  bg-light: "#ffffff"
  bg-light-elevated: "#fbfbfd"
  sidebar-light: "#e8edf8"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary-dark:
    backgroundColor: "#262626"
    textColor: "#e5e5e5"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "#450a0a"
    textColor: "#fecaca"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  input-field:
    backgroundColor: "{colors.bg-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  card-phase:
    backgroundColor: "#171717"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Apex

## 1. Overview

**Creative North Star: "The Spec Ledger"**

Apex reads like an audit trail, not a product page. The interface exists to be inspected line by line — spec IDs in monospace, statuses as small dots and badges, phases as a console strip rather than a marketing nav. `text-xs` is the dominant type size across the codebase (488 uses against 315 `text-sm`), and that density is not an oversight: it's the tell of a tool built for someone cross-referencing a Gherkin scenario against a task pack, not scrolling a feed. Structure earns the trust; nothing here persuades.

Against that neutral, dense backdrop, **Signal Violet** is the one warm signal — active phase, active tab, AI-touched state, primary action. It appears sparingly enough that its presence *means something* every time it shows up. This directly enforces PRODUCT.md's positioning: spec-anchored traceability, not spec-anchored decoration.

The system explicitly rejects the generic SaaS dashboard look (gradient heroes, hero-metric tiles, cream/paper body backgrounds) and the enterprise-PM-tool skin (Jira-clone chrome) named in PRODUCT.md's anti-references. Apex sits above Taiga/Jira as the reasoning layer; it should never be mistaken for another ticket tracker.

**Key Characteristics:**
- Dark-first (`neutral-900`/`#121113`/`#1b1b1c` base), with a fully-mirrored light mode swapped via `.apex-sidebar-light` / `.apex-main-light` class overrides rather than a separate token set.
- One accent color (violet) carries all "active/selected/AI" meaning; status color (emerald/amber/red) is reserved strictly for state, never decoration.
- Monospace for anything that's an identifier — spec IDs, file paths, keyboard shortcuts (`kbd`) — never for prose.
- Flat by default: 1px borders and background-tint layering do the work shadows would do elsewhere; shadows appear only on true overlays.

## 2. Colors

The palette is restrained: one saturated accent, a wide neutral ramp for the dense ledger surface, and status colors held to their semantic role only.

### Primary
- **Signal Violet** (`#7c3aed` / violet-600): the single accent that means active, selected, or AI-generated. Used on primary buttons, the active phase-nav tab, active status dots, and focus rings. Hover state lightens to `#8b5cf6` (violet-500) — never a second unrelated hue.

### Semantic / Status
- **Ledger Green** (`#10b981` / emerald-500, `#34d399` on dark text): "done" / passed / locked states only — the `CheckCircle2` on a completed phase card, a passed test row.
- **Caution Amber** (`#f59e0b` / amber-500): warning banners and amber callouts (e.g. assumption-review boxes) — never a default UI color.
- **Ledger Red** (`#dc2626` / red-600 light, `#fecaca` text on `#450a0a` dark surface): destructive actions and failure states only.

### Neutral
- **Ledger Black** (`#121113`, `#1b1b1c`, `#171717` / neutral-900): dark-mode base and elevated surfaces — the primary working background.
- **Paper White** (`#ffffff`, `#fbfbfd`, `#f8f9fc`): light-mode base and elevated surfaces, mirroring the dark tiers exactly.
- **Ink** (`#111827`): light-mode primary text.
- **Ledger Gray** (`#7c8194` / apex-muted): secondary/muted text in both modes — the single shared muted token, not redefined per theme.
- **Hairline Border** (`#262626` dark / `#d9dce6` light): the 1px border that does almost all of the system's structural work, given the Flat-by-Default rule below.
- **Sidebar Mist** (`#e8edf8` / apex-sidebar): the light-mode sidebar tint, distinct from main-content white to keep the workspace chrome legible as chrome.

### Named Rules
**The One-Signal Rule.** Violet is the only color allowed to mean "this is active or AI-touched." Status colors (emerald/amber/red) mean state, never selection. Don't reach for a second brand hue to add visual interest — that's what the neutral ramp and monospace are for.

## 3. Typography

**Body Font:** `ui-sans-serif, system-ui, sans-serif` (the platform default stack — no custom webfont)
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, monospace`

**Character:** A deliberately un-branded system-sans stack for prose, paired with monospace reserved exclusively for anything that functions as an identifier. The absence of a custom display font is consistent with "no hype tool" — Apex doesn't need a typographic personality competing with the spec data it's presenting.

### Hierarchy
- **Headline** (700, 24px `text-2xl`, 1.3): page/section titles. Rare — only 2 uses of `text-2xl` across the codebase; reserved for genuine section breaks.
- **Title** (600, 16-18px `text-lg`): panel and dialog headers.
- **Body** (400, 14px `text-sm`): default prose, form labels, descriptions. 65-75ch cap where it wraps freeform text (story descriptions, AI-generated summaries).
- **Label** (500, 12px `text-xs`): the dominant size in the system — table cells, badges, nav labels, metadata. Density is the point; this is the ledger reading at a glance.
- **Mono** (400, 11-12px): spec IDs (`SCR-3`, `EP-2`), file paths, keyboard shortcuts inside `<kbd>`. Never used for anything a human is meant to read as prose.

### Named Rules
**The Identifier-Is-Mono Rule.** Any string that functions as an ID, path, or shortcut renders in monospace, unconditionally. If it's typed into a URL, a `story-index.json`, or a Gherkin tag, it's mono on screen too — the typography itself signals "this is machine-addressable."

## 4. Elevation

Flat-by-default: everyday depth comes from a 1px border plus a background-tint shift (`bg-neutral-900/40` → `bg-neutral-800/60` on hover), not from shadows. Shadows are reserved strictly for true overlays — content that stacks above the page in its own layer, not content that merely responds to hover.

### Shadow Vocabulary
- **Overlay** (`box-shadow` via `shadow-2xl`): command palette, confirmation modals, the fix-bolt dialog — anything rendered as a floating layer above the page.
- **Ambient-light** (`shadow-sm`): light-mode cards only, compensating for the lack of a dark background to establish surface separation; dark mode relies on border+tint instead and skips shadow entirely for the same component.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to true stacking (a modal/overlay), never as ambient decoration on a card or button. If a shadow doesn't correspond to something rendering above the page, remove it.

## 5. Components

### Buttons
- **Shape:** 4px radius (`rounded`), 40px height, `px-4`, `text-sm font-semibold`.
- **Primary:** Signal Violet background, white text, hover to violet-500.
- **Secondary:** neutral-tinted (`neutral-800`/`slate-200` by theme), never a second brand color.
- **Danger:** deep red surface (`red-950`/`#450a0a`) with light red text — a muted destructive treatment, not a loud one, consistent with the calm-under-scrutiny personality.

### Cards / Containers (Phase Cards)
- **Corner Style:** 8px radius (`rounded-lg`).
- **Background:** `neutral-900/40` dark, white with `shadow-sm` light.
- **Border:** 1px, brightens to violet-500/40 on hover — the border itself is the interactive affordance, not a shadow lift.
- **Internal Padding:** 16px (`p-4`).
- **State:** a small status dot (top-right) carries done/active/pending — emerald check, violet pulse, or neutral gray dot. No badge chrome beyond that.

### Inputs / Fields
- **Style:** 1px border, 4px radius, 40px height, `bg-neutral-950` dark / white light.
- **Focus:** border shifts to violet-500; light mode adds a `ring-2 ring-violet-500/20` glow. Dark mode intentionally skips the ring — border-color shift alone is enough against a dark surface.
- **Hover (idle):** border brightens one neutral step before focus, giving a two-stage affordance (hover → focus) rather than jumping straight to the focus state.

### Navigation (Phase Nav)
- **Style:** 48px-tall sticky console strip, 1px bottom border, six phase tabs plus a home icon-link. Active tab is Signal Violet text with a violet underline/indicator; inactive tabs are muted gray. Badge counts (`3/8`) render inline in the tab label, not as a separate pill — keeping the strip a single reading line rather than a stack of components.

## 6. Do's and Don'ts

### Do:
- **Do** keep violet as the only color that signals "active / selected / AI-touched" (The One-Signal Rule) — status colors stay semantic-only.
- **Do** render every spec ID, file path, and keyboard shortcut in monospace (The Identifier-Is-Mono Rule).
- **Do** keep depth flat-by-default; reserve shadows for genuine overlays (command palette, modals) per The Flat-by-Default Rule.
- **Do** mirror dark/light via the existing `.apex-sidebar-light` / `.apex-main-light` override classes rather than introducing a parallel light-mode token set.

### Don't:
- **Don't** build a generic SaaS marketing dashboard — no gradient hero, no hero-metric-tile template, no cream/paper body background (per PRODUCT.md's anti-references).
- **Don't** let Apex's chrome converge toward looking like Taiga/Jira — density is fine, but Apex is the reasoning layer above the PM tool, not a reskin of it (per PRODUCT.md).
- **Don't** use `border-left`/`border-right` greater than 1px as a colored side-stripe accent. `SectionHeading` and `Callout` in `components/ui/primitives.tsx` currently do this (`border-l-4 border-violet-500` / `border-l-4 border-violet-400`) — flagged here as a known violation to fix in a future `/impeccable polish` pass, not an accepted pattern to replicate elsewhere.
- **Don't** introduce a second brand hue alongside violet "for visual interest" — variety comes from the neutral ramp and typography, not from more color.
- **Don't** add ambient shadow to cards or buttons at rest; if it's not an overlay, it stays flat.
