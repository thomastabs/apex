# Plan — Spec↔Code Conformance Check (Roadmap #1)

Status: design, not built. Created 2026-06-15. Companion to
[`spec-model-roadmap.md`](./spec-model-roadmap.md).

## Goal

Turn Apex's spec from a *generation input* into a *verified contract*: after a
story is implemented, check the shipped code against the locked spec and report
drift. This closes the literature gap that Apex's spec→code link is probabilistic
and one-way (no executable specs, no conformance) — the thesis's answer to "how
do spec and code stay honest after the AI hands off?"

It extends, rather than replaces, the existing Phase 5 traceability matrix
(`verification_story_<id>.json/.md`) and the analytics "Context Traceability
Rate". Those check that *artifacts exist*; conformance checks that *code matches
the artifacts*.

## Where it lives

Phase 6 **Traceability Explorer** (planned F3). It is a read/report feature —
no phase-status mutation — so it can run on any story at/after `implementation`
and re-run any time the code changes.

## Inputs (all already available)

| Input | Source |
|---|---|
| Endpoint contracts | `story_technical_spec(story_id)` — method/path/auth/in/out lines |
| Behavioural scenarios | `story_gherkin(story_id)` — each `Then` is an assertable claim |
| Non-functional requirements | `constraints.md` (roadmap #2, shipped) |
| Shipped code | `github-context.md` (synced file tree + README + key files) for the MVP; on-demand file fetch via `github-browser.ts` for v2 |
| Tech stack | `read_tech_stack()` — to know test/route conventions |

## Two-layer check (deterministic first, AI second)

Deterministic pre-checks are cheap, reproducible, and shrink the AI's job to
genuine semantic judgement — the same philosophy as `_reconcile_task_list` and
`_prune_dangling_edges`.

### Layer A — deterministic
1. **Endpoint presence.** Parse `METHOD /path` tokens from the technical spec
   (reuse the design-bundle endpoint regex). Search the GitHub file tree + code
   text for route declarations matching method+path (framework-aware patterns
   from the tech stack: `@app.post("/x")`, `router.get('/x')`, `@GetMapping`, …).
   → each endpoint: `present | missing | ambiguous`, with file path when found.
2. **Test presence.** Parse Gherkin scenario titles + `Then` steps. Search test
   directories (conventional paths per stack) for files/cases referencing the
   story or scenario keywords. → each scenario: `has_test | no_test_found`.
3. **NFR keyword probes.** For each constraint, a weak signal pass (e.g. a
   `rate-limit` NFR → look for rate-limit middleware). Advisory only; never a
   hard fail (string matching is lossy for NFRs).

Layer A alone yields a coarse report with zero AI cost — useful as a fast,
deterministic baseline and a thesis artifact in its own right.

### Layer B — AI semantic judgement
For items Layer A marks `present`/`has_test`/`ambiguous`, the AI verifies the
code actually honours the contract (right fields, status codes, auth) and that a
test actually asserts the scenario's `Then`. Grounding rules mirror the existing
generators: cite the exact file (and line range when available); if the relevant
code is not in the provided context, return `unknown` and request the file —
**never assume conformance.**

## Data model (`src/ai_engine.py`)

```python
class EndpointConformance(BaseModel):
    contract: str            # "POST /auth/login"
    status: Literal["present", "missing", "mismatch", "unknown"]
    location: str = ""       # "backend/app/api/auth.py:42"
    notes: str = ""          # what differs, if mismatch

class ScenarioConformance(BaseModel):
    scenario: str
    status: Literal["tested", "untested", "partial", "unknown"]
    test_location: str = ""
    notes: str = ""

class ConstraintConformance(BaseModel):
    constraint_id: str       # "NFR-1"
    status: Literal["addressed", "not_found", "unknown"]
    evidence: str = ""

class ConformanceReport(BaseModel):
    endpoints: list[EndpointConformance] = []
    scenarios: list[ScenarioConformance] = []
    constraints: list[ConstraintConformance] = []
    summary: str = ""        # human-readable drift narrative
    score: int = 0           # 0–100, derived deterministically from the above
```

`score` is computed in code (not by the AI) from the status counts, so it is
reproducible and not a hallucinated number — e.g. weighted % of
present-and-correct endpoints + tested scenarios.

## Function

```python
def verify_spec_conformance(
    story_subject: str,
    gherkin: str,
    technical_spec: str,
    github_context: str,
    constraints: str = "",
    tech_stack: str = "",
    precheck: dict | None = None,   # Layer-A results, fed in as grounding
) -> ConformanceReport
```

Structured output via `_invoke_structured_with_progress`, temperature 0
(verification is a judgement task, wants determinism), grounded strictly in the
provided spec + code. Layer A runs in the service (pure Python) and is passed in
as `precheck` so the AI corrects/confirms rather than re-derives.

## Backend wiring

- `AiService.verify_conformance(...)` → returns `report.model_dump()`.
- `Phase6Service.verify_conformance(ctx, story_id)`:
  reads the four inputs, runs Layer A, calls the AI, computes `score`, persists
  `conformance_story_<id>.json` via `ContextService` (mirror `save_verification`).
- Routes (new `backend/app/api/phase6.py` or extend traceability routes):
  - `POST /api/phase6/conformance/{story_id}` → run + persist + return report.
  - `GET  /api/phase6/conformance/{story_id}` → load last report.
- Errors map through the existing AI→HTTP handler (`_handle_error`).

## Frontend (Phase 6 Traceability Explorer)

- Hook `useVerifyConformance(storyId)` (mutation) + `useConformanceReport(storyId)` (query).
- Panel: three grouped tables (endpoints / scenarios / constraints), each row
  status-coloured (green present/tested, red missing/untested, amber
  mismatch/partial, grey unknown), with the cited file path as a link into the
  GitHub repo. Header shows the score + a "Re-verify" button. The drift
  `summary` renders as markdown above the tables.
- For v2: a row marked `unknown` offers "fetch this file" → `github-browser.ts`
  pulls the implicated file client-side and re-runs with it in context.

## Persistence & analytics

- `conformance_story_<id>.json` alongside `verification_story_<id>.json`.
- New analytics metric: **Spec Conformance Rate** = avg `score` across
  implemented stories. Slots into the existing analytics endpoint next to
  Context Traceability Rate — and gives the thesis a quantitative result.

## Test plan

- ai_engine (pure / mocked LLM): `ConformanceReport` model + deterministic
  `score` computation; Layer-A endpoint/test parsers against fixture specs+trees.
- Service: feeds the four inputs, persists/loads the report (Fake context/AI).
- API: run + get roundtrip, eligibility, error mapping.
- Frontend: hook + panel render (mirrors test-plans-section tests).

## Effort & risks

- **Effort:** medium. Layer A + models + service + routes ≈ the bulk; the AI
  prompt is small; the Explorer panel mirrors existing section components.
- **Risk — context size:** whole-repo code won't fit. Mitigate by scoping to the
  files implicated by the endpoints/tasks (the packs already name `Files to
  Change`) rather than the full tree.
- **Risk — false confidence:** an AI "present" that is wrong is worse than
  silence. Mitigate with the `unknown`-when-not-in-context rule, code-computed
  score, and Layer-A determinism as the floor.
- **Dependency:** richest when GitHub is synced; degrade gracefully (report
  `unknown` for everything and prompt the user to sync) when it is not.

## Build order

1. ✅ **DONE 2026-06-16.** Layer-A parsers + `ConformanceReport` model + code-computed
   score (+ tests). Ships value with zero AI. In `src/ai_engine.py`:
   `parse_spec_endpoints`, `parse_constraint_ids`, `extract_code_routes` (FastAPI/
   Flask/Express/Spring/Rails patterns), `_paths_match` (suffix+param-wildcard),
   `build_layer_a_report`, `compute_conformance_score` (endpoints+scenarios weighted;
   constraints advisory, excluded). Tests: `TestConformanceParsers`, `TestPathMatching`,
   `TestLayerAReport` in `tests/test_ai_engine.py`.
2. AI semantic layer + `verify_spec_conformance` (+ mocked tests).
3. Service + routes + persistence (+ tests).
4. Phase 6 Traceability Explorer panel + hooks.
5. Analytics metric (Spec Conformance Rate).
