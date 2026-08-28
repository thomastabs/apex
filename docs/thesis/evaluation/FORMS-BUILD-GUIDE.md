# Forms build guide and master TODO

What to build, in what order, question by question. Follow this top to bottom
and the study is ready to pilot.

> **Building the forms right now?** Use **`FORMS-BUILD-SHEET.md`** instead. It
> holds every literal string for all eight forms - four instruments in EN and PT
> - along with the global Google Forms settings, the prefilled-link procedure and
> an acceptance checklist, so you never have to cross-reference another file
> while clicking. This file stays the plan and the master TODO; that one is the
> build sheet.

Four instruments, built as **eight forms** - each one in EN and PT, since the
two languages are strictly two instruments and must not be pooled. The task
script links to three of them; the fourth is completed before the script is
opened.

| # | Form | When | Times submitted |
|---|---|---|---|
| F0 | Consent and demographics | before anything | once |
| F1 | Raw NASA-TLX | after tasks 3, 4, 6, 7, 8, 9 | **six times**, one prefilled link per task |
| F2 | SUS | after task 9 | once |
| F3 | Apex UX | after SUS | once |

---

## Build progress log

Live status of the eight forms. Update this table as each one is finished and
verified, rather than relying on memory of what got built.

| Form | Status | Link | Built by | Date |
|---|---|---|---|---|
| F0-EN | **done** | https://docs.google.com/forms/d/e/1FAIpQLSezG6QwXDkCgLDEk0ebbsmTCs9EeIRoHNNGYavyeeWiOR1hrg/viewform | Tomás | 2026-08-27 |
| F0-PT | **done** | https://docs.google.com/forms/d/e/1FAIpQLSerEC9KkxLQj-nzo7qZsTkwpp9M4h0JHwk_atswO3adfm44kA/viewform | Claude (claude-in-chrome), duplicated from F0-EN and translated per the F0-PT block in `FORMS-BUILD-SHEET.md` | 2026-08-27 |
| F1-EN | **done** | https://docs.google.com/forms/d/e/1FAIpQLSed3z8FdBJDgQuLcYEX746HHGpxP80799H3TDrG8dfn9CzTYg/viewform | Claude (claude-in-chrome) | 2026-08-27 |
| F1-PT | **done** | https://docs.google.com/forms/d/e/1FAIpQLSdXAbp9UWHtLBkjJUQhylS6Xc-dRveePiRPS1ZGReq2uwEipw/viewform | Claude (claude-in-chrome), duplicated from F1-EN and translated per the F1-PT block in `FORMS-BUILD-SHEET.md` | 2026-08-27 |
| F2-EN | **done** | https://docs.google.com/forms/d/e/1FAIpQLSc3Tr2pVcRaNEc4MHrThurZSwbg1dXIyeHOyDbL-3_sufSlOg/viewform | Claude (claude-in-chrome), built from scratch per the F2-EN block in `FORMS-BUILD-SHEET.md` | 2026-08-27 |
| F2-PT | **done** | https://docs.google.com/forms/d/e/1FAIpQLSe0R3huJ3HOclxn8rRqVqcpinYwava5Ywla5FuUigfc4x2k7g/viewform | Claude (claude-in-chrome), duplicated from F2-EN and translated per the F2-PT block in `FORMS-BUILD-SHEET.md` (validated European Portuguese SUS, Martins et al. 2015) | 2026-08-27 |
| F3-EN | **done** | https://docs.google.com/forms/d/e/1FAIpQLSfNdyEC5U0eTVWO5aGChNckjW09Oe0R9h1Z9sSHbcQ--oGkrQ/viewform | Claude (claude-in-chrome), built from scratch per the F3-EN block in `FORMS-BUILD-SHEET.md` | 2026-08-27 |
| F3-PT | **done** | https://docs.google.com/forms/d/e/1FAIpQLSfWmMYRncpvhvmqmncy7fW6_xjqZsuRUUDs1aiDocVnOCIXJA/viewform | Claude (claude-in-chrome), duplicated from F3-EN and translated per the F3-PT block in `FORMS-BUILD-SHEET.md` | 2026-08-27 |

F0-EN and F0-PT both exist now - not yet run through the acceptance checklist
(bottom of `FORMS-BUILD-SHEET.md`). One deviation from the build sheet worth
noting when that check happens: G1 and G4's question text were extended by
Tomás beyond the sheet's original wording ("...or software engineering
experience", "...Gherkin Language for Requirements or Behavior Driven
Development") - F0-PT was translated to match F0-EN's actual final wording, not
the sheet's shorter original, so both languages stay mirrors of each other.
`FORMS-BUILD-SHEET.md` itself was not edited to match; treat F0-EN's live text
as authoritative over the sheet for these two questions.

---

## Master TODO, in order

### Before building anything

1. ~~Ask the supervisor about ethics approval and an IST consent template.~~
   **CLOSED 2026-08-15. Informed consent is sufficient, no ethics committee
   submission, and no IST template exists** - build F0 from the form in
   `consent-and-briefing.md` as written. Nothing gates the first session on
   ethics any more.
2. ~~Decide the PT SUS question.~~ **CLOSED.** Validated European Portuguese
   version, Martins et al. (2015). Paper obtained, ten items transcribed
   verbatim into `instrument-sus.md`. F2-PT is ready to build.
3. ~~Decide the TLX response scale.~~ **CLOSED 2026-08-12: linear 0 to 10,
   multiplied by ten at analysis time.** Google Forms is therefore the platform.
   Frozen - it cannot change mid-study. Disclosure wording for Chapter 9 is
   drafted in `EVALUATION-PLAN.md` section 6.
4. ~~Decide the arm split.~~ **CLOSED 2026-08-17: unmoderated only, and nothing
   is recorded** - not the sessions, not the interviews. F0 therefore has four
   questions in section 1, not five: the screen-and-audio recording consent item
   is deleted in both languages. `observer-sheet.md` is unused. **Nothing in
   this list is waiting on a decision any more** - the forms are fully
   buildable.

### Build

5. Build F0, F1, F2, F3 as specified below. **Done** 2026-08-27.
6. Test-submit every form once yourself. Open the response spreadsheet and
   check the column headers are usable. Delete the test rows. **Done**
   2026-08-27/28 - all 8 forms (F0/F1/F2/F3 x EN/PT), headers usable on every
   sheet, no test data left behind. Found+fixed along the way: F0-EN/F0-PT had
   no progress bar and the default Google confirmation message instead of the
   study's close-tab text; both now corrected and verified live.
7. Generate six prefilled F1 links per language, twelve in total, one per task,
   so the participant does not retype the task name. Google Forms: three-dot
   menu, "Get pre-filled link", set the task field, copy the URL. Paste each
   into the matching `<TLX LINK T3>`..`<TLX LINK T9>` slot in the script. Do not
   edit F1 after generating them; editing can invalidate the entry IDs baked
   into the URLs. **Done** 2026-08-28 - all 12 links generated and pasted into
   `task-script.md` (both language blocks), each verified by loading it and
   confirming the correct task radio is pre-selected.
8. Seed the demo project. Confirm `Export board to CSV` exists and has **never**
   passed QA. Task 8 does nothing without it. **Done 2026-08-28.** Demo
   Project (id 1804164) seeded via `scripts/seed-demo-project.py`, imported
   into Apex ("7 stories imported, 0 skipped"), all at `phase_status:
   gherkin_locked` (the real reachable baseline - `new` turned out not to be
   an actual state the app ever assigns, see `demo-environment.local.md`).
   `Export board to CSV` attached to an epic so it's actually visible in the
   Apex board UI (a real bug: orphan stories were being silently dropped from
   the board view). `thomastabs/dummyREPO` now holds a real codebase (a copy
   of Outfolio, incl. context files). Two real Apex bugs found+fixed along
   the way, both pushed to `main`: the Taiga status-fetch endpoint was wrong
   (`userstories/statuses` vs the real `userstory-statuses`, 404'd always)
   and the board fetch dropped epic-less stories. Detail:
   `demo-environment.local.md` (gitignored).
9. Capture the nine reference screenshots from the seeded project. **Done
   2026-08-28** - `docs/thesis/evaluation/screenshots/01-09-*.jpg`, one per
   task, matching every `[SCREENSHOT: ...]` placeholder in `task-script.md`.
   Real walkthrough of a "Forgot password reset" epic through Phases 1-5
   (Gherkin, design, task DAG, QA sign-off, deployment gate) plus sign-in,
   GitHub-connected, and resume-session states. **This used the real Demo
   Project and left it with real progress (12 stories, one epic taken through
   deployment) - it is no longer pristine and must be reset (task-set.md
   procedure) before the pilot or any real participant.**
10. Fill all eighteen placeholder links into `task-script.md` - nine per
    language: the tool link, the six per-task TLX links, the SUS link and the UX
    link - then export it to PDF. **Done 2026-08-28.** Tool/SUS/UX links wired
    in both languages; the 9 reference screenshots (annotated with red
    arrows/circles by Tomás) swapped in for every `[SCREENSHOT: ...]` marker;
    exported to `task-script.pdf` (12 pages, self-contained, verified page by
    page).
11. Print participant code cards: code, sign-in credentials, GitHub repo URL,
    PAT. **Open, Tomás's own step:** the credentials/repo/PAT are his to
    provide (his own GitHub repo + PAT, used for real) - not something to be
    generated. Card content is otherwise standard.
11.5. **Tomás reviews everything before the pilot.** Not a build step - a
    full read-through of what's been produced so far:
    - `task-script.pdf` (this repo, `docs/thesis/evaluation/`) - the
      participant-facing document, EN + PT, 9 annotated screenshots, all 18
      links wired.
    - `main.pdf` (`docs/thesis/IST_UL___MEIC_Thesis___Dissertação_final/`) -
      the full dissertation. Rebuilt 2026-08-28, current with the latest
      `.tex` (105 pages).
    - `main.pdf` (`docs/thesis/extended-abstract/`) - the 10-page English
      extended abstract, current.
    - **Stale, do not review:** `Apex-Evaluation-Package.pdf` and
      `Apex-Task-Script.pdf` in `docs/thesis/evaluation/` are both dated
      2026-08-19 - a bundled export from before the arm-split closure, before
      any form was built, before task-script.pdf was wired. Superseded by
      `task-script.pdf` above; not regenerated since. Consider deleting once
      confirmed unneeded, so they stop looking current.

### Pilot

12. Run **one** pilot participant. Not counted, ever.
13. Check the pilot returned six correctly labelled F1 rows. If not, fix F1
    before anyone else runs.
14. Time the pilot. If the tasks overrun 60 minutes, cut an optional task, not a
    marked one.
15. Fix whatever the pilot broke, then freeze everything. No wording changes
    after this point.

### Run

16. Recruit and run. Recruitment runs through the supervisor's professional
    connections (settled 2026-08-17), so the job here is scheduling, not
    sourcing. Record which channel each participant came from - it is what
    `\Cref{sec:eval_participants}` has to report. Reset the demo project
    between participants and verify the reset.
17. Log any technical failure against the specific task it happened in.

### After

18. Export all four response sheets to CSV.
19. Score SUS per `instrument-sus.md`. Build the TLX matrix per
    `instrument-nasa-tlx.md`.
20. Write Chapter 9 results. Write the deviations you decided in steps 2 and 3
    into the text explicitly.

---

## F0 - Consent and demographics

Single form, two sections. Turn **off** "collect email addresses" - it defeats
the anonymity claim in the consent text.

**Section 1: Consent**

Paste the consent text from `consent-and-briefing.md` into the section
description. Then:

| Q | Type | Required | Content |
|---|---|---|---|
| 1 | Short answer | yes | Participant code (on your card) |
| 2 | Checkboxes | yes | `I confirm I have read and understood the above and I agree to take part` |
| 3 | Checkboxes | no | `I consent to anonymised quotations being used in the dissertation` |
| 4 | Checkboxes | no | `I agree to be contacted about a follow-up interview` |

Four questions only. No recording-consent item exists, in either language,
because nothing is recorded.

**Section 2: About you** - G1 to G6 exactly as listed in
`consent-and-briefing.md`. All multiple choice, all required except G2's "other".

---

## F1 - Raw NASA-TLX

The one that must be right. It is submitted six times per participant.

Title it something the participant will recognise mid-task, for example
"Apex - workload after each task".

| Q | Type | Required | Content |
|---|---|---|---|
| 1 | Short answer | yes | Participant code |
| 2 | Multiple choice | yes | Which task? `Task 3 - Requirement to locked scenarios` / `Task 4 - Produce and lock the design` / `Task 6 - Break the work into implementation tasks` / `Task 7 - Test plan and QA sign-off` / `Task 8 - Deploy a different feature` / `Task 9 - Export what the tool produced` |
| 3 | Linear scale 0-10 | yes | **Mental Demand** |
| 4 | Linear scale 0-10 | yes | **Physical Demand** |
| 5 | Linear scale 0-10 | yes | **Temporal Demand** |
| 6 | Linear scale 0-10 | yes | **Effort** |
| 7 | Linear scale 0-10 | yes | **Frustration** |
| 8 | Linear scale 0-10 | yes | **Performance** - reversed anchors, placed last on purpose |
| 9 | Paragraph | no | Anything you want to say about this task |

**Every scale question needs its full description in the question help text**,
copied from `instrument-nasa-tlx.md`. Nobody is present to explain them.

**Labels on each scale:**
- Q3 to Q7: left `Very low`, right `Very high`.
- Q8 Performance: left **`Perfect`**, right **`Failure`**. Put the word
  "reversed" in the help text and repeat that good performance is the left end.

**Task 6 and Task 8 need an extra prompt.** Add a paragraph question shown
conditionally, or simply add to Q9's help text:

> If you are answering for Task 6, name the task you think must be done first
> and say why in one sentence. If you are answering for Task 8, describe in your
> own words what happened when you tried to deploy.

Simplest robust option: two extra optional paragraph questions, "For task 6
only" and "For task 8 only". Conditional section logic in Google Forms is
fragile and easy to misconfigure.

**Scoring reminder:** multiply every 0-10 response by 10 at analysis time, and
write the deviation into Chapter 9.

---

## F2 - SUS

Ten items, in order, exactly as in `instrument-sus.md`. Do not reword, reorder,
add or drop any item.

| Q | Type | Required | Content |
|---|---|---|---|
| 1 | Short answer | yes | Participant code |
| 2-11 | Linear scale **1-5** | yes | SUS items 1 to 10, verbatim |

Scale labels: left `Strongly disagree`, right `Strongly agree`. Same labels on
all ten - alternating them is a common and fatal build error, because the
scoring formula already handles the polarity reversal.

Form description: the participant instructions block from `instrument-sus.md`.

**Two separate forms, one per language.** F2-EN uses the English items. F2-PT
uses the validated European Portuguese items from Martins et al. (2015), which
are now transcribed verbatim in `instrument-sus.md` under "As administered".
Copy that table, not the "Published items, verbatim" one above it - the
administered version is the same wording with `este produto` replaced by
`o Apex`, which is the only permitted change.

Do not mix languages within one form. PT anchors: `Discordo totalmente` and
`Concordo totalmente`.

---

## F3 - Apex UX

| Q | Type | Required | Content |
|---|---|---|---|
| 1 | Short answer | yes | Participant code |
| 2-19 | Multiple choice, 6 options | yes | The 18 items A1-A4, B1-B5, C1-C4, D1-D2, E1-E3 |
| 20 | Paragraph | yes | What was the single most confusing thing about using Apex? |
| 21 | Paragraph | yes | Was there a point where you did not trust what the tool had produced? What made you doubt it? |
| 22 | Paragraph | yes | If you could change one thing about the interface, what would it be? |

**Use multiple choice, not linear scale, for Q2-Q19.** The six options are
`1 Strongly disagree`, `2`, `3`, `4`, `5 Strongly agree`, `N/A - did not use
this`. A linear scale cannot carry an N/A option, and forcing a centre point for
a surface the participant never opened manufactures data.

Group them into four sections matching A, B, C, D and E so the form does not
read as a wall of 18 statements.

---

## Response-sheet hygiene

- Participant code is the join key across all four sheets. If a code is missing
  or mistyped, that row is orphaned. Print the code large on the card and ask
  for it first on every form.
- F1 produces six rows per participant. Sort by code then task before building
  the matrix.
- Google Forms writes the question text as the column header, which is unwieldy.
  Add a second header row of short names (`mental`, `physical`, `temporal`,
  `effort`, `frustration`, `performance`) before analysis, or rename the columns
  in a copy of the sheet. Never edit the raw response sheet itself.
- Export to CSV and keep the raw exports untouched. Do all cleaning in a copy.

---

## What goes in Appendix B

Once the study has run, Appendix B needs: the SUS form as administered, the
Raw TLX form as administered including subscale descriptions and the response
scale actually used, the UX questionnaire, both interview guides, the consent
form, and the per-participant raw scores in anonymised form.

Everything except the raw scores already exists in these files. Appendix B is
currently four `\todo` prompts.
