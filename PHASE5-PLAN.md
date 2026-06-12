# Phase 5 Implementation Plan — Deployment Gate, Verification, Analytics

**Date:** 2026-06-12 · **Source:** framework draft "Deployment & Release" / "QA Validation" playbooks + governance metrics (Draft&Ideas v14), adapted to the current Apex architecture.

> **STATUS: ✅ IMPLEMENTED 2026-06-12** — all milestones shipped on `main`:
> M0a `4b19f8f` (status_history + lossless rebuild) · M0b `4a2c98e` (QA results persisted) ·
> M0c `b2184ab` (fix_bolt_count + phase4_passed fix) · M1a `f5eea30` (backend vertical) ·
> M1b `7792420` (frontend workflow) · M1c `5fe3cd6` (e2e + toast-flake fix) ·
> M2 `183303d` (traceability matrix) · M3 `0846784` (analytics) · docs `efad707`.
> Suite: 416 backend / 50 unit / 7 e2e. Remaining ideas live in "Out of scope" below.

Scope agreed: **Feature A** (Deployment Gate + infra delta) as Phase 5 core, **Feature B** in its lean form (traceability matrix, no live-code fetching), **Feature C** (governance analytics). Pure governance v1 — Apex records gate decisions and artifacts; it does not trigger real deployments (a GitHub `workflow_dispatch` hook is a possible v2).

---

## 0. Framework → Apex translation (the draft is outdated here)

The draft anchors everything in a single split `.ai-context.md`. Apex long ago replaced that with the `contextspec/<project_id>/` directory. Mapping used throughout this plan:

| Draft concept | Apex reality |
|---|---|
| Memory Bank (global context) | `project-concept.md`, `tech-stack.md` |
| Feature Spec — Functional | `functional-spec.md` (locked Gherkin per story) |
| Feature Spec — Technical | `technical-spec.md`, `design-bundle.md` (endpoints + data model) |
| Repo/infra knowledge | `github-context.md` (file tree, README, config file, OpenAPI spec) |
| Task plans | `proposal_story_<id>_task_<id>.md` + Apex meta in PM task descriptions (`covered_scenarios` → "Covers" line) |
| QA evidence | `bdd_story_<id>.feature`, `bug_report_<id>.md`, `vaccines.md` |
| "Updated to reflect live state" | new `deployment-log.md` (append-only) |
| Bolt Board states | `story-index.json` `phase_status`: `new → gherkin_locked → design_locked → implementation → qa → qa_passed → deployed` |

New Phase 5 artifacts: `infra_delta_story_<id>.md`, `deploy_pack_story_<id>.md`, `verification_story_<id>.json` (+ rendered `.md`), `qa_results_story_<id>.json`, `deployment-log.md`.

---

## M0 — Instrumentation prerequisites (do first; Features B and C depend on it)

1. **Status timestamps.** `upsert_story_index` records `status_history: {<phase_status>: <iso datetime>}` whenever `phase_status` changes (append-only per status; first-write wins so re-entries are visible as later keys, e.g. re-`implementation` after a Fix-Bolt overwrites with the latest — store a list per status to keep both). Powers cycle-time metrics retroactively from day one.
2. **Persist QA scenario results server-side.** Today pass/fail lives only in the `apex-phase4-draft` Zustand store and is lost after the gate. Extend `POST /api/phase4/pass-gate` (and the fail/fix-bolt path) payload with `scenario_results: [{scenario, result, notes?}]`; service writes `qa_results_story_<id>.json`. Backward compatible — field optional.
3. **Fix-Bolt counter.** `upsert_story_index(..., fix_bolt_count=+1)` on trigger-fix-bolt (today only boolean `has_bug_report`). Feeds the defect-rate metric.

Small, isolated, immediately mergeable.

---

## M1 — Feature A: Phase 5 Deployment Gate

Four-stage stepper, same skeleton as Phases 3/4.

### Stage A — Select Story
Eligible = `phase_status == "qa_passed"`. Epic-grouped 2×2 card grid (clone Phase 4 selector). Badges: "Delta ready", "Pack ready", "Routine (bypass)".

### Stage B — Pre-Flight (Infra Delta Check + Verification panel)
Implements playbook Step 1 ("one question: does this story need new infra, env vars, or deploy-script changes?").

- AI call `generate_infra_delta` — context strictly narrowed (framework rule): story Gherkin slice from `functional-spec.md`, relevant endpoints/data-model from `design-bundle.md`, `tech-stack.md`, `github-context.md` if synced. **Not** the whole contextspec.
- Structured output:
  ```json
  { "needs_infra_change": bool,
    "rationale": str,
    "deltas": [{ "category": "env_var|migration|iac|ci_config|secret",
                 "title": str, "detail": str, "risk": "low|high" }] }
  ```
- Human can edit/override verdict and delta list before saving → `infra_delta_story_<id>.md`.
- Second panel on this stage: the **traceability matrix** (Feature B, M2) — read-only evidence, generated alongside.

### Stage C — Deploy Pack or Bypass (playbook Step 2)
- `needs_infra_change == false` → "Routine Deployment" banner, bypass recorded in the delta artifact, skip to Stage D.
- `true` → `generate_deploy_pack`: one editable Markdown pack (env-var diffs, migration SQL, IaC/CI snippets per delta item) → `deploy_pack_story_<id>.md`. Download/copy actions like Phase 4 plans.
- `revise_deploy_pack(feedback)` — regeneration loop used by Stage D rejection (playbook Step 4 FAIL path; mirrors the Fix-Bolt wizard pattern).

### Stage D — Deployment Gate (playbook Steps 3–4)
- Evidence summary: delta verdict, pack (if any), traceability matrix, QA results.
- Two sign-offs (Phase 2 gate pattern): **Tech Lead — pack reviewed** and **DevOps Alliance — security review passed**. (Apex is single-user; the Alliance is a named sign-off role, same compromise as the Trio in Phases 1–2 — the draft explicitly allows reference implementations.)
- **Approve:** `phase_status → deployed`, append `deployment-log.md` entry (date, story, verdict, bypass/pack, sign-offs), optional PM story-status update through the adapter (both Taiga and Jira).
- **Reject:** feedback textarea → routed to `revise_deploy_pack`, back to Stage C.

### Backend surface
- `backend/app/schemas/phase5.py`, `backend/app/services/phase5_service.py`, `backend/app/api/phase5.py` (thin routes):
  `GET eligible-stories`, `GET story-context/{id}`, `POST generate-infra-delta`, `POST save-infra-delta`, `POST generate-deploy-pack`, `POST save-deploy-pack`, `POST revise-deploy-pack`, `POST pass-deployment-gate`. Standard AI error mapping (429/504/502).
- Prompts in `src/ai_engine.py`: `generate_infra_delta` (structured), `generate_deploy_pack`, `revise_deploy_pack`.

### Frontend surface
- `frontend/app/phase5/`, stage components under `frontend/components/phase5/`, `frontend/lib/hooks/use-phase5.ts`, `frontend/lib/api/phase5.ts`, Zustand `apex-phase5-draft` (localStorage, clone of phase4-store).

### Tests
- `tests/test_backend_phase5.py` + `tests/test_backend_phase5_api.py` (mirror phase-4 suites), frontend hook unit tests, `e2e/phase5-deploy-flow.spec.ts` (select → delta NO → bypass → gate; plus delta YES → pack → gate).

---

## M2 — Feature B (lean): Traceability Matrix

**Overengineering verdict:** the deep version (fetching live source files from GitHub and having AI verify code against specs) *is* overengineering for this project — unbounded context, unverifiable claims, large surface. **Skip it.** The lean version is cheap because the traceability data already exists; it just was never assembled:

| Matrix column | Existing source |
|---|---|
| Gherkin scenario | `functional-spec.md` (parse scenario titles) |
| Covering task(s) | PM task descriptions — Apex meta "Covers" line (`decodeApexMeta`, already round-trip-safe) |
| Developer pack exists | `proposal_story_<id>_task_<id>.md` presence |
| QA result | `qa_results_story_<id>.json` (M0.2) |
| Fix-Bolt history | `bug_report_<id>.md` / `fix_bolt_count` (M0.3) |

- `phase5_service.build_traceability_matrix(story_id)` — pure assembly, **zero AI calls** in v1. Persisted as `verification_story_<id>.json` + rendered Markdown for the gate evidence panel and export.
- Gap flags: scenario with no covering task, task with no pack, scenario never marked in QA. Shown as amber rows in Stage B/D.
- Optional v1.5 (only if useful in practice): one narrow AI call assessing gaps against `github-context.md`'s file tree/OpenAPI spec — clearly labelled "AI assessment", never blocking the gate.

This *is* the framework's Context Traceability mechanism made concrete, and it doubles as thesis evidence.

---

## M3 — Feature C: Governance Analytics

Draft metrics → Apex computation (all derivable from M0 + existing artifacts; no new tracking infra):

| Draft metric | Apex computation |
|---|---|
| Bolt Cycle Time | per-story deltas between `status_history` timestamps (gherkin_locked → design_locked → implementation → qa_passed → deployed); aggregate median/p90 per phase |
| Context Traceability Rate | % of `deployed` stories whose artifact chain is complete (gherkin + packs + test plan + delta + deployment-log entry) — straight from the matrix |
| AI Defect Escape Rate (proxy) | Fix-Bolts per story (`fix_bolt_count`); Apex has no production telemetry, so QA-caught defects are the honest measurable proxy — state this explicitly in the thesis |
| Funnel | story counts per `phase_status` (extends the existing `phase4_passed` stat) |

- Backend: `analytics_service.py` + `GET /api/analytics/summary` (single endpoint, computed on demand — project scale is tens of stories, no caching needed).
- Frontend: `/analytics` page — metric cards, per-phase cycle-time table, funnel bar, per-story drill-down table. Recharts or plain Tailwind bars; no heavy charting dependency.
- Export as CSV/Markdown for the thesis evaluation chapter.

---

## Order & estimates

| Milestone | Contents | Size |
|---|---|---|
| M0 | timestamps, QA-results persistence, fix-bolt counter | small (1 session) |
| M1 | Phase 5 stepper end-to-end | large (2–3 sessions) |
| M2 | traceability matrix (assembly + UI panels) | small-medium (1 session) |
| M3 | analytics endpoint + page | medium (1–2 sessions) |

M0 → M1 → M2 → M3. M2/M3 have no AI-prompt risk; M1 carries the two new prompts.

## Out of scope (explicit)

- Triggering real deployments (GitHub `workflow_dispatch`) — possible v2.
- Live source-code verification (deep Feature B) — rejected as overengineering.
- Fix-Bolt Fast Lane severity routing (Phase 4 fail-path change) — future work note.
- Phase 6 (Maintenance) — separate effort; will consume `deployment-log.md` and `vaccines.md`.
