# Task set - internal notes

Not handed to participants. The participant-facing wording is `task-script.md`;
this file records what each task is actually testing, how to judge it, and how
to prepare the environment.

Nine tasks, roughly 45 minutes of tool time. Six carry a Raw TLX form.

---

## Environment, reset before every participant

- A dedicated **Demo Project** on the PM instance, seeded with 3 epics and 6
  stories at `phase_status: gherkin_locked` (see note below - `new` is not a
  real reachable state), plus one story named **Export board to CSV**.
  **No longer load-bearing as of 2026-08-30** - Task 8 was redesigned to
  deploy the participant's own password-reset story instead (see Task 8
  below), so `Export board to CSV`'s QA status no longer matters for any
  task; it just sits in the seeded board like any other filler story. Seeded
  via `scripts/seed-demo-project.py` (run manually - it needs the Taiga
  password typed interactively, never scripted further than that). Account
  and setup detail: `demo-environment.local.md` (gitignored, not in this
  repo's history).
  **Correction 2026-08-28:** `phase_status: "new"` is not actually reachable
  anywhere in the app - it is never assigned by any backend code path
  (verified: only appears once, as a fallback default for a story-index
  entry with a missing field), and the Status Mapping UI explicitly excludes
  it from the selectable target list (`Exclude<ApexPhaseStatus, "new">`,
  frontend/components/sidebar/status-mapping-section.tsx). The real baseline
  "nothing done yet" state for an imported Taiga story is `gherkin_locked`,
  which is also the import heuristic's actual default - no code or mapping
  change needed, just use the default mapping as-is.
- A GitHub repo with a **real codebase** in it, not an empty repo. Phase 3 and
  Phase 4 grounding read `github-context.md`; an empty repo produces vacuous
  output and the participant is then evaluating nothing. **Done:**
  `github.com/thomastabs/dummyREPO` holds a copy of Outfolio (incl. context
  files) as of 2026-08-28 - see `demo-environment.local.md`.
- **No leftover password-reset epic.** Tasks 3-9 now build one continuous
  story (epic created by the participant themselves in Task 3, carried
  through to deployment in Task 8 and export in Task 9). The reset must
  guarantee no epic resembling "password reset" / "forgot password" already
  exists before a participant starts - if one does, Task 3 stops being "write
  the requirement yourself" and Task 8 stops being a fresh QA-gated deploy.
  `scripts/seed-demo-project.py` never creates one, but a prior participant's
  (or a test walkthrough's) leftover epic would - check for and delete any
  such epic as part of every reset, not just before the first participant.
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
2026-08-28 - see `demo-environment.local.md`). Verify the reset by loading
the project, confirming every seeded story is back at `phase_status:
gherkin_locked`, and confirming there is no password-reset epic left over
from a previous participant or test run (see the point above).

Test the reset before the pilot. A half-reset project is the most likely way
to silently ruin a participant's data: a leftover password-reset epic means
Task 3 is no longer "write the requirement yourself" and Task 8 is no longer
a fresh QA-gated deploy for that participant.

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

### Task 8 `[TLX]` - Deploy the feature you built
**Surface:** Phase 5 (pre-flight delta check, deploy pack, Deployment Gate),
phase-status progression.
**Changed 2026-08-30:** this task was originally designed as a refusal test
(deploy the deliberately-never-QA'd `Export board to CSV` story and be
blocked at the gate). Redesigned so Tasks 3-9 form one continuous
requirement-to-deployment flow through the password-reset feature, instead
of switching to an unrelated story for the deployment step alone. The
refusal/comprehension measure is dropped entirely, not moved elsewhere - see
`EVALUATION-PLAN.md`'s deviation log. `Export board to CSV` stays seeded (it
is still a normal, harmless story in the board) but is no longer load-bearing
for any task; Tomás confirmed dropping the measure rather than relocating it
to an optional task or adding a 10th task.
**Success:** the password-reset story clears the pre-flight check, gets a
deploy pack, passes the Deployment Gate, and is recorded as deployed - since
it already passed QA in Task 7, this should succeed rather than be refused.
**Watch for:** whether the participant understands what pre-flight/deploy
pack/Deployment Gate each do, distinct from just clicking through them;
whether they notice the gate is now passing *because* of the QA sign-off
they gave in Task 7 - that link (QA in Task 7 -> deploy allowed in Task 8) is
the actual construct now under test, replacing the old refusal test.
**Predicted TLX:** moderate - no longer expected to be the highest-Frustration
task now that it is a successful completion rather than a designed block.
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
