# Task set - internal notes

Not handed to participants. The participant-facing wording is `task-script.md`;
this file records what each task is actually testing, how to judge it, and how
to prepare the environment.

Nine tasks, roughly 45 minutes of tool time. Six carry a Raw TLX form.

---

## Environment, reset before every participant

- A dedicated **Demo Project** on the PM instance, seeded with 3 epics and 6
  stories at `phase_status: gherkin_locked` (see note below - `new` is not a
  real reachable state), plus one story named **Export board to CSV** that
  must stay un-QA'd. Task 8 depends entirely on that story existing and never
  having passed QA. Seeded via `scripts/seed-demo-project.py` (run manually -
  it needs the Taiga password typed interactively, never scripted further
  than that). Account and setup detail: `demo-environment.local.md`
  (gitignored, not in this repo's history).
  **Correction 2026-08-28:** `phase_status: "new"` is not actually reachable
  anywhere in the app - it is never assigned by any backend code path
  (verified: only appears once, as a fallback default for a story-index
  entry with a missing field), and the Status Mapping UI explicitly excludes
  it from the selectable target list (`Exclude<ApexPhaseStatus, "new">`,
  frontend/components/sidebar/status-mapping-section.tsx). The real baseline
  "nothing done yet" state for an imported Taiga story is `gherkin_locked`,
  which is also the import heuristic's actual default. This still satisfies
  Task 8 (`gherkin_locked` is not `qa_passed`) - no code or mapping change
  needed, just use the default mapping as-is.
- A GitHub repo with a **real codebase** in it, not an empty repo. Phase 3 and
  Phase 4 grounding read `github-context.md`; an empty repo produces vacuous
  output and the participant is then evaluating nothing. **Open as of
  2026-08-28:** `github.com/thomastabs/dummyREPO` is chosen but still empty -
  see `demo-environment.local.md`.
- A PAT and repo URL printed on the participant card, along with sign-in
  credentials and the participant code.
- AI provider key configured server-side so nobody is blocked on it.
- Language left at the participant's choice from the start, then not changed.

**Reset procedure:** delete
`contextspec/<instance_id>/<project_id>/` for the demo project and re-seed the
PM board via `scripts/seed-demo-project.py`. Then, in Apex, click "Import from
Taiga" on the Overview page directly - the default Status Mapping (Taiga "New"
-> Apex "Gherkin Locked") is already correct, no change needed there. **Never
click "Rebuild"** on this project - it only rescans Apex-generated
`functional-spec.md` and fully replaces the story index from it, so it will
silently wipe a Taiga-native import back to empty rather than "sync" it (found
2026-08-28 - see `demo-environment.local.md`). Verify the reset
by loading the project and confirming every story is back at `new` and
`Export board to CSV` has no QA record.

Test the reset before the pilot. A half-reset project is the most likely way to
silently ruin a participant's data, because task 8 will not refuse if the story
already passed QA in a previous session.

---

## Per-task notes

### Task 1 - Sign in and open the project
**Surface:** auth, PM tool selector, project picker.
**Success:** signed in, correct project active.
**Watch for:** whether the PM tool selector on the login form is understood at
all. It was only recently labelled.
**Expected:** 3 min. No TLX.

### Task 2 - Connect the project to GitHub
**Surface:** sidebar GitHub section, PAT entry, connected state.
**Success:** repo shows as connected.
**Watch for:** whether the connected state is legible after connecting; whether
the participant looks for GitHub in Settings rather than the sidebar.
**Expected:** 4 min. No TLX.

### Task 3 `[TLX]` - Requirement to locked Gherkin
**Surface:** Phase 1, clarifying Q&A, per-scenario assumptions, lock.
**Success:** functional spec written, questions answered, Gherkin compiled,
story at `gherkin_locked`.
**Watch for:** whether the clarifying questions are read or clicked through;
whether the amber assumptions box is noticed; whether the participant hesitates
before locking. Also whether a 30-60 s generation makes them think it hung.
**Predicted TLX:** highest Mental Demand of the session.
**Expected:** 10 min.

### Task 4 `[TLX]` - Produce and lock the design
**Surface:** Phase 2, technical spec, runtime spec, visual design, lock.
**Success:** all three generated, assumptions reviewed, story at
`design_locked`.
**Watch for:** whether the Visual Design group is found at all - it is collapsed
by default; whether the runtime spec is read or scrolled past; **whether
anything is edited or the output is accepted wholesale.** Blanket acceptance is
a trust-calibration finding and is the one this thesis most needs.
**Predicted TLX:** high Mental Demand and high Effort.
**Expected:** 10 min.

### Task 5 - Resume a previous session
**Surface:** `sessionStorage` session store, active-project persistence, GitHub
auto-restore from the encrypted server-side PAT.
**Success:** signs back in and lands on the same project and work.
**Why it is here:** this is a real regression path. Session state is in
`sessionStorage`, and the "active project does not survive a fresh session" bug
was fixed only recently. No automated test exercises it with a human.
**Watch for:** whether GitHub is still connected afterwards, or whether the
participant has to reconnect. If they do, that is a bug found by the study.
**Expected:** 3 min. No TLX.

### Task 6 `[TLX]` - Break the work into implementation tasks
**Surface:** Phase 3 packs, task DAG, effort and coverage metadata.
**Success:** packs generated, and the participant names a defensible root task
with a reason.
**Grading the written answer:** correct if it names a task with no unmet
dependencies and the justification refers to ordering or dependency rather than
to the task sounding important.
**Watch for:** whether the DAG is read as a dependency order or as decoration.
**Expected:** 8 min.

### Task 7 `[TLX]` - Test plan and QA sign-off
**Surface:** Phase 4.
**Success:** test plan generated, QA recorded, story at `qa_passed`.
**Watch for:** whether the participant grasps that QA sign-off is a human
decision the tool deliberately will not make for them.
**Predicted TLX:** lowest demands of the marked tasks.
**Expected:** 6 min.

### Task 8 `[TLX]` - The deployment gate
**Surface:** Phase 5 gate, phase-status progression, refusal messaging.
**Designed to be refused.** `Export board to CSV` is not `qa_passed`, so the
gate blocks it.
**The measure is comprehension, not completion.** Score the written explanation:

- **2** - names the missing QA step and the required order
- **1** - knows a process rule blocked them, cannot say which
- **0** - concludes the tool is broken or the story is corrupt

**Watch for:** whether they hunt for an override; whether they find the phase
status; the exact words they use for the refusal.
**Predicted TLX:** highest Frustration, lowest Performance. If Frustration is
only moderate, the refusal messaging is doing its job, and that is a reportable
result about error surfacing.
**Expected:** 6 min.

### Task 9 `[TLX]` - Export
**Surface:** export and download paths, zip packaging.
**Success:** files downloaded and opened.
**Watch for:** whether the export control is findable; whether anything
downloads empty or corrupt.
**Predicted TLX:** lowest overall.
**Expected:** 5 min.

### Optional, excluded from all measures
- **O1** Phase 6 drift check. **O2** traceability explorer. **O3** Autopilot.

O2 is worth pushing for where time allows: traceability is a distinctive claim
of the framework and has never been usability-tested.

---

## Facilitator rules - UNUSED

**Not applied.** The moderated arm was dropped 2026-08-17; the study is
unmoderated, so there is no facilitator and no live session to run. Retained for
the record only. The rules below would have applied in the moderated arm:

- Read each task aloud from `task-script.md`, verbatim. Do not paraphrase.
- Do not point, hover, or say "it's over there". Silence is data.
- Stuck for **90 seconds**: offer one hint, log it as an assist. Another 90
  seconds: second hint. After a third, mark the task failed and move on.
- Prompt "what are you thinking?" only after 20 seconds of silence. Never "what
  would you expect to happen?" - that leads.
- Never explain, defend or apologise for the tool. Note the complaint, move on.
- The participant still fills in the same online forms, unwatched.
