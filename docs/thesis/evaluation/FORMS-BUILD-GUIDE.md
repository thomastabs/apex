# Forms build guide and master TODO

What to build, in what order, question by question. Follow this top to bottom
and the study is ready to pilot.

> **Building the forms right now?** Use **`FORMS-BUILD-SHEET.md`** instead. It
> holds every literal string for all eight forms - four instruments in EN and PT
> - along with the global Google Forms settings, the prefilled-link procedure and
> an acceptance checklist, so you never have to cross-reference another file
> while clicking. This file stays the plan and the master TODO; that one is the
> build sheet.

Four forms. The task script links to three of them; the fourth is completed
before the script is opened.

| # | Form | When | Times submitted |
|---|---|---|---|
| F0 | Consent and demographics | before anything | once |
| F1 | Raw NASA-TLX | after tasks 3, 4, 6, 7, 8, 9 | **six times** |
| F2 | SUS | after task 9 | once |
| F3 | Apex UX | after SUS | once |

---

## Master TODO, in order

### Before building anything

1. **Email the supervisor.** Two questions: does this study need an ethics
   committee submission, and is there a standard IST consent template to use
   instead of the one in `consent-and-briefing.md`. This gates the first
   session and nothing else unblocks it.
2. ~~Decide the PT SUS question.~~ **CLOSED.** Validated European Portuguese
   version, Martins et al. (2015). Paper obtained, ten items transcribed
   verbatim into `instrument-sus.md`. F2-PT is ready to build.
3. ~~Decide the TLX response scale.~~ **CLOSED 2026-08-12: linear 0 to 10,
   multiplied by ten at analysis time.** Google Forms is therefore the platform.
   Frozen - it cannot change mid-study. Disclosure wording for Chapter 9 is
   drafted in `EVALUATION-PLAN.md` section 6.
4. **Decide the arm split.** Unmoderated only, or unmoderated plus 3-4
   moderated sessions.

### Build

5. Build F0, F1, F2, F3 as specified below.
6. Test-submit every form once yourself. Open the response spreadsheet and
   check the column headers are usable. Delete the test rows.
7. Generate six prefilled F1 links, one per task, so the participant does not
   retype the task name. Google Forms: three-dot menu, "Get pre-filled link",
   set the task field, copy the URL. Paste each into the matching task in the
   script.
8. Seed the demo project. Confirm `Export board to CSV` exists and has **never**
   passed QA. Task 8 does nothing without it.
9. Capture the nine reference screenshots from the seeded project.
10. Fill the four placeholder links into `task-script.md` and export it to PDF.
11. Print participant code cards: code, sign-in credentials, GitHub repo URL,
    PAT.

### Pilot

12. Run **one** pilot participant. Not counted, ever.
13. Check the pilot returned six correctly labelled F1 rows. If not, fix F1
    before anyone else runs.
14. Time the pilot. If the tasks overrun 60 minutes, cut an optional task, not a
    marked one.
15. Fix whatever the pilot broke, then freeze everything. No wording changes
    after this point.

### Run

16. Recruit and run. Reset the demo project between participants and verify the
    reset.
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
| 5 | Checkboxes | no | `I consent to the session being screen and audio recorded` - **moderated arm only**, delete this question for the unmoderated form |

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
