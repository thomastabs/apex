# Apex Spec-Model Upgrade Roadmap

Status: living document. Created 2026-06-15. Audience: thesis planning + engineering.

This document benchmarks Apex's spec-driven model against the established
literature, names the gaps, and lays out a prioritised upgrade roadmap. Each
upgrade is tied to a specific gap so the work is defensible in the thesis.

---

## 1. Where Apex sits in the literature

| Tradition | Key sources | Core idea | Apex relation |
|---|---|---|---|
| Spec-Driven Development (2024–25) | GitHub **Spec Kit** (`/specify`→`/plan`→`/tasks`→`/implement`, `constitution.md`); AWS **Kiro** (requirements/design/tasks.md) | Spec is the primary artifact; AI generates code from it | **Direct sibling** |
| Behaviour-Driven Development | Dan North (2006); **Specification by Example**, Gojko Adzic (2011); Cucumber/Gherkin | Examples/scenarios as a shared, living specification | **Strong, partial** |
| Requirements Engineering | **EARS**, Mavin et al. (2009); Twin Peaks, Nuseibeh (2001); requirements-traceability literature | Structured NL requirements; requirement↔architecture co-evolution; traceability | **Mixed** |
| Model-Driven Engineering | OMG **MDA** (PIM→PSM→code) | Deterministic, round-trippable model→code transforms | **Echoes, but diverges** |
| Formal / contract-first | TLA+, Alloy; OpenAPI design-first | Spec with verification / contracts before code | **Aligns on contracts, lacks verification** |

> Note: Spec Kit and Kiro are 2025 tools at the edge of the author's knowledge
> cutoff — verify their exact feature set against current docs before citing.

### Alignments (defensible claims)
- **Gherkin as single source of truth feeding both implementation and test** — textbook Adzic.
- **Contract-first**: `technical-spec.md` (endpoint method/path/auth/in/out) + data model before code.
- **Phased artifact chain** concept→tech-stack→func-spec→tech-spec→design→tasks→packs maps ~1:1 to Spec Kit; `tech-stack.md` ≈ Spec Kit's `constitution.md`.
- **Traceability + governance gates** (story-index, traceability matrix, deployment-log, sign-offs) — *exceeds* the lightweight SDD tools.
- **Anti-hallucination grounding constraints** = the emerging "specification fidelity" practice in LLM-SE.

### Divergences / gaps (thesis-critical)
1. **Specs are not executable** → the "living documentation" claim is weak. Cucumber/Spec Kit close the loop with automated tests; Apex's Gherkin never executes. **Biggest gap.**
2. **No spec↔code conformance / round-trip.** Transforms are probabilistic (LLM) and one-way; nothing checks code matches spec after edits. "Grounding" ≠ proof.
3. **Phase-gated freezing** vs Twin Peaks co-evolution — early `gherkin_locked → design_locked` risks premature requirement freezing.
4. **Gherkin-only**: no home for non-behavioural requirements (performance, security). EARS (used by Kiro) fills this. → addressed by upgrade #2 (shipped).

### Innovations (the actual contribution)
- **Multi-target agent compilation** — `Agentic Brief` / `Chat Prompt` / `CLAUDE.md Snippet` per pack; serialising one grounded spec to *heterogeneous* AI coding tools. Absent from both the academic literature and current SDD tools (which assume one integrated agent).
- **Cross-pack consistency via digests** — sibling-pack grounding to prevent divergent file/entity names across parallel agent tasks; a *multi-agent* spec-execution problem.
- **Vaccine records / Fix-Bolt loop** — defect → permanent spec annotation.

---

## 2. The upgrade roadmap

Ranked by (thesis payoff × leverage on existing code).

### #1 — Spec↔code conformance check  ·  **highest priority**
- **Gap closed:** divergences (1) + (2) — executable/living-doc + spec↔code honesty.
- **What:** after a story is implemented, fetch shipped code (existing `github-browser.ts`) and verify it against the spec — do the `technical-spec` endpoints exist? does each Gherkin `Then` have a matching test/assertion? flag drift.
- **Home:** Phase 6 **Traceability Explorer** (planned F3).
- **Status:** detailed design in [`spec-code-conformance-plan.md`](./spec-code-conformance-plan.md).
- **Effort:** medium. **Payoff:** highest — the thesis's answer to "how do spec and code stay honest."

### #2 — EARS non-functional requirements  ·  **SHIPPED 2026-06-15 (commit 87ebb5d)**
- **Gap closed:** divergence (4) — no home for non-behavioural requirements.
- **What:** project-level `constraints.md` in EARS notation, generated in Phase 1, injected into developer packs + test plans.
- **Where:** `ai_engine.generate_constraints`/`format_constraints` (Constraint/ConstraintList models, category + EARS-type normalisation); `POST /api/phase1/generate-constraints|save-constraints`, `GET /api/phase1/constraints`; "Generate with AI" button on the constraints context file (Phase 1/3/4 panels).
- **Follow-ups:** richer per-constraint editing UI; verify NFRs in the conformance check (#1).

### #3 — Deterministic agent-target compilation  ·  **hardens the core innovation**
- **Gap closed:** the overengineering flaw in the multi-target-compilation contribution.
- **What:** stop AI-regenerating the four export wrappers (Agentic Brief / Chat Prompt / CLAUDE.md / Agentic Test Brief). Generate ONE structured pack; render wrappers in code (pure template functions).
- **Why:** a real compiler is deterministic, not four stochastic re-serialisations. Cuts tokens, kills cross-wrapper drift, and reframes a weakness as rigour.
- **How:** `Phase3Pack` structured model → `render_agentic_brief()`, `render_chat_prompt()`, `render_claude_md()`. Same for the test-plan handoff sections.
- **Effort:** medium. **Payoff:** high — strengthens the central thesis claim.

### #4 — Controlled spec co-evolution  ·  **answers the Twin Peaks critique**
- **Gap closed:** divergence (3) — rigid phase freezing.
- **What:** when a downstream artifact reveals a spec problem, allow a *logged amendment* that re-propagates, instead of a silent edit or a hard freeze. Lighter version: a **drift flag** when a locked artifact is edited post-lock.
- **How:** amendment record on story-index (who/why/what changed) + re-trigger downstream regeneration with a diff note.
- **Effort:** medium. **Payoff:** medium — neutralises a predictable committee objection.

### #5 — Hygiene  ·  **low thesis value, do alongside the above**
- Per-epic slicing of `technical-spec` injection (today the flat file is injected wholesale and grows unbounded).
- Non-truncated pack digests (`_pack_digest` currently char-truncates at 700, can silently drop files from the consistency signal — slice by section/line instead).

---

## 3. Suggested sequence

`#2 (done) → #1 → #3`, with `#5` as cleanup and `#4` if time allows.

This trio gives three citable upgrades, each tied to a named literature gap, and
makes the novelty — *spec-as-source → multi-target agent compilation, now
deterministic (#3) and verified against code (#1)* — the spine of the thesis.

### One-paragraph positioning (thesis draft)
> Apex occupies the spec-driven development paradigm (cf. GitHub Spec Kit, AWS
> Kiro), inheriting BDD's Gherkin-as-shared-specification (North; Adzic) and
> API-first contract definition. It diverges in two principled ways and one
> limiting one. Principled: (a) an enterprise-grade governance and traceability
> layer absent from lightweight SDD tooling, and (b) multi-target agent
> compilation — serialising a single grounded spec into directives for
> heterogeneous AI coding agents — which neither the academic BDD/MDE literature
> nor current SDD tools address. Limiting: unlike executable-specification
> approaches (Cucumber) and the model-driven/formal traditions, Apex's spec→code
> transforms are probabilistic and one-way, with no executable specs or spec↔code
> conformance check, so its "living documentation" guarantee is weaker than the
> Specification-by-Example ideal it draws from. Upgrades #1 and #3 directly
> address this limitation.

---

## 4. Citation seeds (verify before use)
- D. North, *Introducing BDD*, 2006.
- G. Adzic, *Specification by Example*, Manning, 2011.
- A. Mavin et al., *Easy Approach to Requirements Syntax (EARS)*, RE'09, 2009.
- B. Nuseibeh, *Weaving Together Requirements and Architectures (Twin Peaks)*, IEEE Computer, 2001.
- OMG, *Model Driven Architecture (MDA) Guide*.
- GitHub, *Spec Kit* (2025) — confirm against the repository/docs.
- AWS, *Kiro* (2025) — confirm requirements/design/tasks + EARS usage against current docs.
