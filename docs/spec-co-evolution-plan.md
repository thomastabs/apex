# Plan — Controlled Spec Co-Evolution (Roadmap #4)

Status: design + build. Created 2026-06-16. Companion to
[`spec-model-roadmap.md`](./spec-model-roadmap.md) item #4.

## Goal

Apex freezes artifacts at phase gates (`gherkin_locked → design_locked → …`).
The Twin Peaks critique (Nuseibeh 2001): rigid forward-only freezing is
unrealistic — requirements and architecture co-evolve. Today a locked spec file
can still be edited via the sidebar, but the edit is **silent**: downstream
artifacts (tasks, dev packs, test plans, code) keep referencing the old spec
with no signal that they are now stale.

#4 makes post-lock edits **first-class and controlled**: edits are allowed (not
frozen), but each one is **logged as an amendment** and **raises a drift flag**
on every downstream story, so the team knows exactly what to re-derive. This is
the "logged amendment that re-propagates" instead of "silent edit or hard
freeze."

- **Gap closed:** divergence (3) — rigid phase freezing vs co-evolution.
- **Payoff:** medium — neutralises a predictable committee objection.
- **Effort:** medium.

## What counts as a locked spec edit

Each spec file locks at a phase; a story is **affected** when its
`phase_status` is at or after that lock (using `PHASE_STATUSES` ordering):

| File | Locks at | Rationale |
|---|---|---|
| `project-concept.md` | gherkin_locked | upstream of all artifacts |
| `functional-spec.md` | gherkin_locked | the Gherkin contract |
| `tech-stack.md` | design_locked | feeds design + packs |
| `technical-spec.md` | design_locked | endpoint contracts |
| `design-bundle.md` | design_locked | UX + endpoints + data model |
| `constraints.md` | design_locked | NFRs feed packs + test plans |

`vaccines.md` and `github-context.md` are append/sync artifacts — never trigger
drift. Editing a spec file while **no** story has passed its lock is a normal
pre-lock edit (no amendment, no drift).

## Backend (`src/context_manager.py`)

- `_SPEC_LOCK_PHASE: dict[str, str]` — the table above.
- `affected_stories_for_spec(filename) -> list[int]` — story_ids at/after the
  file's lock phase.
- `record_amendment(filename, note, story_ids)` — append a dated entry to
  `amendments.md` (human-readable log) and set `spec_drift=True` +
  `drift_reason=filename` on each affected story-index entry (under `_index_lock`).
- `amend_locked_spec(filename, note="") -> dict` — orchestrator: returns
  `{"amended": bool, "filename": str, "affected_story_ids": [...], "note": str}`.
  `amended=False` when nothing is past the lock (no log, no drift).
- `clear_spec_drift(story_id)` — drops the flag once the story is re-derived.
- `get_amendments() -> str` — read `amendments.md`.
- `amendments.md` added to the filename map + template + `init_context`.
- `upsert_story_index`: add `spec_drift` (False) and `drift_reason` ("") to the
  defaults + valid fields.

Drift **clears** automatically when a story's dev pack is regenerated
(`save_proposal` — the natural "I re-derived from the new spec" action), and via
an explicit acknowledge endpoint.

## API (`backend/app/api/workspace.py`)

- `PUT /context-files/{filename}`: after the write, call `amend_locked_spec`
  (passing an optional `note` from the request body). Extend the response with a
  `drift` block (`amended`, `affected_story_ids`). Add optional `note` to
  `UpdateContextFileRequest`.
- `POST /context-files/story-index/stories/{story_id}/acknowledge-drift` — clear
  the flag.
- `GET /context-files/amendments` — return the amendment log markdown.
- story-index-stats: add a `spec_drift` count.

## Frontend (focused)

- The context-file save hook surfaces the `drift` result: on a post-lock edit it
  toasts "Spec changed after lock — N downstream stories flagged for review" so
  the edit is never silent.
- Board: a `spec drift` badge on flagged stories with an "Acknowledge" action
  hitting the new endpoint.

## Tests
- context_manager: lock-phase scoping (pre-lock edit → no drift; post-lock →
  drift on the right stories only); amendment log append; drift set/clear;
  `save_proposal` auto-clears.
- API: `update_context_file` returns drift; acknowledge clears; stats count.
- Frontend: save hook toasts on drift; board badge + acknowledge (mutation hook).

## Build order
1. ✅ **DONE 2026-06-16.** context_manager core: `_SPEC_LOCK_PHASE`,
   `affected_stories_for_spec`, `record_amendment`, `amend_locked_spec`,
   `clear_spec_drift`, `get_amendments`; `amendments.md` template + init;
   `spec_drift`/`drift_reason` story-index fields. `TestSpecCoEvolution`.
2. ✅ **DONE.** Workspace API: `PUT /context-files/{filename}` returns `drift`
   (+ optional `note`); `POST …/{story_id}/acknowledge-drift`;
   `GET /context-files/amendments`; `spec_drift` count in stats. Tests in
   `test_backend_workspace_api.py`.
3. ✅ **DONE.** Auto-clear on `save_proposal` (re-derive ⇒ drift cleared).
4. ✅ **DONE.** Frontend: `useUpdateContextFile` toasts on drift + refreshes
   stats; `useAcknowledgeSpecDrift`; `acknowledgeSpecDrift` API; `SpecDriftInfo`
   type. `tests/spec-drift-hooks.test.tsx`. (Board badge deferred — the edit-time
   toast + auto-clear already make edits non-silent; acknowledge endpoint+hook
   exist for a future board surface.)
5. ✅ Roadmap doc marked #4 SHIPPED. Backend 588, frontend 82.

## Risk
- **Over-flagging:** a tiny typo fix flags every downstream story. Acceptable —
  the flag is advisory and one click to acknowledge; the alternative (guessing
  which edits are "material") is worse. The amendment `note` lets the editor say
  why.
