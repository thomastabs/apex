# Plan — Deterministic Agent-Target Compilation (Roadmap #3)

Status: design + build. Created 2026-06-16. Companion to
[`spec-model-roadmap.md`](./spec-model-roadmap.md) item #3.

## Goal

Apex's central novelty is **multi-target agent compilation**: one grounded spec
serialised into directives for heterogeneous AI coding agents (Agentic Brief /
Chat Prompt / CLAUDE.md Snippet per Dev Pack; Agentic Test Brief / Chat Prompt
per Test Plan). Today those wrappers are **AI-regenerated** as extra sections of
one big markdown blob — four/five stochastic re-serialisations of content the
model already wrote. That is the overengineering flaw: a real compiler is
**deterministic**, not a bag of restatements.

#3 makes the wrappers **pure code-rendered templates** over a single structured
pack. The AI produces the genuine content once; the export targets are computed.

- **Gap closed:** the overengineering critique of the multi-target contribution.
- **Why it matters (thesis):** reframes a weakness as rigour — "compilation" now
  literally means a deterministic transform. Cuts tokens, eliminates
  cross-wrapper drift (a Brief that names different files than the Chat Prompt).
- **Payoff:** high. **Effort:** medium.

## Invariant (keeps blast radius zero)

Both public functions keep their **exact signature and return type** (a markdown
string). Section **headings stay byte-identical**, because downstream code parses
them: `phase3-workflow.tsx` extracts `## Agentic Brief` / `## Chat Prompt`
(fallback `## AI Prompt`) / `## CLAUDE.md Snippet` / `## Context`; `_pack_digest`
reads `## Context` + `## Files to Change`; the Phase-6 conformance parser reads
`Files to Change` and the `METHOD /path` tokens. Persistence (`save_proposal`,
`save_bdd_tests`) and the frontend are untouched.

Net change is **internal**: how the markdown is produced, not its shape.

## Part A — Developer Pack (Phase 3) · full structure

### Model (`src/ai_engine.py`)
```python
class PackFile(BaseModel):
    path: str
    change: str          # one-line description

class Phase3Pack(BaseModel):
    context: str                       # one paragraph
    implementation_steps: list[str]    # 5–10 file-level steps
    files_to_change: list[PackFile]    # ≤10
    test_assertions: list[str]         # one per Gherkin Then
    # wrapper inputs (genuine, but each emitted ONCE):
    task_verb: str                     # imperative ≤10 words → Agentic Brief Task
    verify_command: str                # inferred test command
    constraints: list[str]             # agent constraints
    goal: str                          # one sentence → CLAUDE.md
    done_when: str                     # one sentence → CLAUDE.md
```

### Pure renderers (no AI, no network)
- `render_agentic_brief(pack) -> str`
- `render_chat_prompt(pack, *, tech_stack, story_ref, gherkin, task_subject, task_description) -> str`
- `render_claude_md(pack, *, story_ref) -> str`
- `render_pack_md(pack, *, task_subject, task_description, story_ref, tech_stack, gherkin) -> str`
  assembles the **same seven sections** (`## Context`, `## Implementation Steps`,
  `## Files to Change`, `## Test Assertions`, `## Agentic Brief`, `## Chat
  Prompt`, `## CLAUDE.md Snippet`). First four from content fields; last three
  delegate to the wrapper renderers.

### Generator
`generate_coding_proposal(...)` (signature unchanged): builds `Phase3Pack` via
`_invoke_structured_with_progress` (temperature 0.2, 3-tier fallback), then
returns `render_pack_md(...)`. System prompt asks ONLY for the structured fields
— never the wrapper sections.

## Part B — Test Plan (Phase 4) · deterministic handoff append

The per-scenario sections (Test Steps / Expected Results / Edge Cases / Risk
Areas / BDD Mapping) are genuine QA analysis — keep them AI-generated as prose.
Only the two trailing **handoff** sections are wrappers:

- Drop `## Agentic Test Brief` + `## Chat Prompt` from the prompt (AI stops
  generating them).
- Append in code: `render_agentic_test_brief(*, tech_stack)` and
  `render_test_chat_prompt(plan_md, *, tech_stack, story_subject, gherkin)`.
  The Chat Prompt needs the per-scenario BDD Mappings; extract them
  deterministically from the generated prose (regex the `### BDD Mapping`
  blocks) rather than asking the model to restate them.

`generate_test_plan(...)` (signature unchanged) returns the AI prose with the two
rendered handoff sections appended.

## Tests
- ai_engine (pure): `Phase3Pack` model; each renderer's output shape + that the
  Agentic Brief / Chat Prompt / CLAUDE.md cite the **same** files (drift killed);
  `render_pack_md` emits all seven headings in order; test-plan handoff renderers
  + BDD-Mapping extraction.
- mocked-LLM: `generate_coding_proposal` returns markdown with the seven
  headings when the structured call is stubbed; `generate_test_plan` appends the
  two deterministic sections.
- Existing Phase 3/4 service + API tests must stay green (return type unchanged).

## Build order
1. ✅ **DONE 2026-06-16.** Part A — `Phase3Pack`/`PackFile` + `render_agentic_brief`/
   `render_chat_prompt`/`render_claude_md`/`render_pack_md` + `generate_coding_proposal`
   rewired to structured output then deterministic render. `TestDeterministicPack`.
2. ✅ **DONE 2026-06-16.** Part B — `render_agentic_test_brief`/`render_test_chat_prompt`/
   `append_test_plan_handoffs` (BDD Mappings extracted from prose via `_BDD_MAPPING_RE`);
   prompt trimmed to per-scenario sections only; `generate_test_plan` appends handoffs.
   `TestDeterministicTestPlanHandoffs`.
3. ✅ Roadmap doc marked #3 SHIPPED. Backend suite 574, frontend unchanged (return
   types + section headings byte-identical → zero downstream change).

## Risks
- **Structured-output robustness:** rely on the existing 3-tier fallback in
  `_invoke_structured_with_progress`; cap list lengths in the model.
- **Prose flexibility loss (Part A content):** the four content sections become
  list-driven — acceptable; they were already required to be lists/short prose.
- **BDD-Mapping extraction (Part B):** if a scenario omits the block, the Chat
  Prompt still renders with whatever mappings exist; never crash on missing.
