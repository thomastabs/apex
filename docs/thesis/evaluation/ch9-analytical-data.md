# Chapter 9 analytical data - working document (DATA ONLY, no prose)

Generated for the Chapter 9 writing pass. This file is factual/computational
only: raw values, computed scores, means/SDs, verbatim quotes. No
interpretation, no persuasive language, no claims about what results "show".
That is the writing agent's job.

Source instruments (scoring formulas used exactly as specified there):
- `docs/thesis/evaluation/instrument-sus.md`
- `docs/thesis/evaluation/instrument-nasa-tlx.md`
- `docs/thesis/evaluation/instrument-apex-ux.md`
- `docs/thesis/evaluation/EVALUATION-PLAN.md` (study design, decisions, benchmarks)

Status: COMPLETE (2026-09-14). All six sections filled and cross-checked;
no `[PENDING]` markers remain. See Section 6's closing note for the
verification method used on the last-completed section (Apex UX
questionnaire).

---

## 0. Chapter 9 existing-state audit (read before writing)

`Chapters/Chapter_9-Evaluation.tex` sections, as of this pass:

**Already-written prose (not empty):**
- `sec:eval_strategy` - written (Table `tab:eval_instruments` + 1 todo asking to
  state SUS/TLX-vs-framework separation plainly in text)
- `sec:eval_instruments_procedure`, `sec:sus`, `sec:tlx`, `sec:apex_ux` - mostly
  written narrative about method/instrument design, each with 1-2 targeted
  `\todo`s asking for actual numbers/results to be dropped in
- `sec:interviews` - FULLY WRITTEN, real prose. This is a **separate
  practitioner-consultation activity** (T2/T3/T4 practitioners + E1
  Agile/Scrum expert), distinct from the 13-participant P0-P12 task-based
  survey study. Do not confuse or merge the two populations. Nothing needed
  here from the P0-P12 data.
- `sec:eval_participants` - has consent/ethics prose written, but 2 `\todo`s
  still empty (participant count/roles/seniority/AI-exposure + recruitment
  description). Not in this task's assigned 4 sections, but the demographics
  section below (Section 5 of this doc) covers it in case the writing agent
  needs it.

**Empty `\todo[inline]{}` blocks - this task's 4 target sections:**

1. `sec:analytical` (Analytical Assessment, in `\subsection`, under
   `sec:eval_instruments_procedure`'s parent flow) - todo text: "State the
   success criteria in advance - clarity, completeness, alignment with SDLC
   phases, support for human-in-the-loop practice, and governance of
   AI-enabled activity - and the three-level ordinal scale used to assess
   each. Each rating must carry a short qualitative justification grounded in
   observed usage, artefacts, or interview evidence rather than in the
   author's judgement alone." -> This is a FRAMEWORK-level assessment, not
   computed from the P0-P12 survey data. See Section 6 mapping below for what
   little of the survey data is indirectly relevant.
2. `sec:eval_results` (Results) - FIVE separate `\todo`s: SUS results
   (per-participant + mean + dispersion), NASA-TLX per subscale, Apex UX
   questionnaire item-by-item + framework-scoped items separated +
   deployment-gate cross-read, interview findings as themes (not this
   task's data), analytical assessment table (not this task's data).
3. `sec:threats` - TWO `\todo`s: (a) construct/internal/external/conclusion
   validity threats (dual role, small non-random sample, single org, short
   window, perception-not-quality); (b) consequences of recording nothing
   (no completion/time/assist/error data, note-based interviews).
4. `sec:eval_discussion` - todo asking to synthesise across instruments +
   agreement/disagreement; plus `sec:eval_rq_answers` sub-todo asking to
   answer DRQ1-DRQ4 from evidence.

Note: the chapter's todo for the UX cross-read (`sec:apex_ux`, and repeated
in `sec:eval_results`) references "the deployment-gate comprehension item"
cross-read against NASA-TLX Frustration for Task 8 - **this no longer
applies**: UX item A4 (the item this cross-read was built for) was deleted
2026-08-30 when Task 8 was redesigned from a refusal test to a successful
deployment (see `instrument-apex-ux.md` and `EVALUATION-PLAN.md`). This is a
stale cross-reference left in the chapter text/todos from before that
redesign. Flagged for the writing agent to handle explicitly (state that the
cross-read no longer applies and why), not silently skip.

---

## 1. SUS results

N = 13 (all participants), verified directly against both linked Sheets
(EN sheet "Apex - SUS (respostas)": 10 responses; PT sheet "Apex - SUS (PT)
(respostas)": 3 responses). No blanks in any of the 10 items for any
respondent. Per instrument-sus.md scoring: odd items (1,3,5,7,9) contribution
= response-1; even items (2,4,6,8,10) contribution = 5-response; sum x 2.5.
Reported per language, not pooled, per `instrument-sus.md`.

### Raw items and computed SUS score, per participant

Item order as on the form (Q1..Q10, matching the instrument's item order in
both languages).

| Participant | Lang | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | SUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | EN | 1 | 3 | 3 | 5 | 4 | 2 | 4 | 3 | 2 | 4 | 42.5 |
| P1 | EN | 5 | 2 | 4 | 4 | 4 | 2 | 5 | 2 | 4 | 2 | 75 |
| P5 | EN | 5 | 2 | 4 | 3 | 4 | 1 | 5 | 1 | 4 | 3 | 80 |
| P6 | EN | 1 | 5 | 1 | 5 | 3 | 5 | 1 | 3 | 1 | 3 | 15 |
| P7 | EN | 1 | 2 | 4 | 4 | 5 | 1 | 4 | 2 | 4 | 4 | 62.5 |
| P8 | EN | 3 | 3 | 4 | 2 | 4 | 2 | 3 | 3 | 3 | 3 | 60 |
| P9 | EN | 4 | 3 | 3 | 3 | 5 | 1 | 2 | 2 | 3 | 4 | 60 |
| P10 | EN | 5 | 1 | 5 | 2 | 4 | 5 | 3 | 1 | 4 | 2 | 75 |
| P11 | EN | 3 | 3 | 2 | 1 | 4 | 1 | 3 | 4 | 4 | 1 | 65 |
| P12 | EN | 3 | 2 | 4 | 2 | 4 | 1 | 4 | 2 | 4 | 4 | 70 |
| P2 | PT | 1 | 4 | 2 | 5 | 5 | 1 | 3 | 4 | 3 | 5 | 37.5 |
| P3 | PT | 1 | 4 | 2 | 5 | 4 | 2 | 4 | 3 | 3 | 4 | 40 |
| P4 | PT | 2 | 3 | 3 | 2 | 4 | 2 | 2 | 2 | 2 | 2 | 55 |

### Descriptive statistics

| | N | Mean | SD | Median | Min | Max |
|---|---|---|---|---|---|---|
| All 13 (reported for completeness; EN+PT are two instruments, see note) | 13 | 56.73 | 18.50 | 60 | 15 | 80 |
| EN only | 10 | 60.50 | 19.18 | 63.75 | 15 | 80 |
| PT only | 3 | 44.17 | 9.46 | 40 | 37.5 | 55 |

Sorted all-13 distribution (for a dot plot): 15, 37.5, 40, 42.5, 55, 60, 60,
62.5, 65, 70, 75, 75, 80.

**Benchmark, per `instrument-sus.md`:** published-corpus mean SUS is
approximately 68 (this is the "68 = average" figure, itself only the
midpoint of the curved grading scale, not a linear percentage). Bangor et
al. (2009) adjective bands: Worst imaginable 12.5, Awful 20.3, Poor 35.7, OK
50.9, Good 71.4, Excellent 85.5, Best imaginable 90.9. Sauro/Lewis (2016)
curved grade for the all-13 mean (56.73) falls in grade **D** (range 51.7-
62.6, percentile 15-34); for EN-only mean (60.50) also grade **D**; for
PT-only mean (44.17) falls in grade **F** (0-51.6, percentile 0-14). Full
band table is in `instrument-sus.md`.

### Usability / Learnability sub-scales (Lewis and Sauro, 2009)

Usability = items {1,2,3,5,6,7,8,9} contributions, sum x (100/32).
Learnability = items {4,10} contributions, sum x (100/8).

| Participant | Usability | Learnability |
|---|---|---|
| P0 | 50.00 | 12.5 |
| P1 | 81.25 | 50 |
| P5 | 87.50 | 50 |
| P6 | 12.50 | 25 |
| P7 | 71.88 | 25 |
| P8 | 59.38 | 62.5 |
| P9 | 65.63 | 37.5 |
| P10 | 75.00 | 75 |
| P11 | 56.25 | 100 |
| P12 | 75.00 | 50 |
| P2 | 46.88 | 0 |
| P3 | 46.88 | 12.5 |
| P4 | 50.00 | 75 |

Mean Usability (all 13) = 59.86. Mean Learnability (all 13) = 44.23.

Note the wide learnability spread (0 to 100) - P2 scored 0 (both items 4 and
10 answered as maximally agreeing they'd need a technician / need to learn a
lot), P11 scored 100 (fully disagreeing with both).

### PT SUS instrument caveats (state in Chapter 9 per `instrument-sus.md`)

Validated European Portuguese version (Martins et al., 2015). Construct
validity established (r=0.70 vs PSSUQ) but inter-rater reliability weak
(ICC=0.36, 95% CI 0.01-0.63) and percentage agreement 76.67% (below their
own 80% threshold), attributed to alternating item polarity. Validation
sample was drawn from the general community, not software practitioners.

## 2. NASA-TLX (Raw) results

N = 13, all 6 task administrations x 13 participants = 78/78 rows present in
the two linked Sheets (EN "Apex - workload after each task": 60 rows = 10
participants x 6 tasks; PT "Apex - carga de trabalho após cada tarefa": 18
rows = 3 participants x 6 tasks). No missing task administrations for any
participant. Verified directly against the Sheets via a scratch fetch/parse
(gviz CSV export), not via screenshot.

**Scale note.** Raw response scale as administered: linear 0-10 (per the
frozen 2026-08-12 decision recorded in `EVALUATION-PLAN.md` /
`instrument-nasa-tlx.md`). All values below are already rescaled x10 to the
instrument's native 0-100 range. Column/administration order as built:
Mental, Physical, Temporal, Effort, Frustration, Performance (Performance
last, not fourth, per the reordering decision - reversed anchors, low =
Perfect, high = Failure). **Performance is reported as marked, not
inverted**, per `instrument-nasa-tlx.md` \S Scoring; this is carried
unmodified into the aggregate mean.

### Raw per-participant, per-task scores (0-100, rescaled from 0-10 raw)

Columns: Mental / Physical / Temporal / Effort / Frustration / Performance.

**Task 3 (Phase 1 Gherkin)**

| P | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| P0 | 50 | 40 | 50 | 60 | 40 | 30 |
| P1 | 50 | 0 | 0 | 30 | 10 | 20 |
| P5 | 10 | 0 | 10 | 10 | 10 | 0 |
| P6 | 20 | 20 | 20 | 20 | 20 | 80 |
| P7 | 20 | 10 | 30 | 30 | 10 | 10 |
| P8 | 20 | 10 | 10 | 10 | 10 | 0 |
| P9 | 10 | 0 | 10 | 0 | 10 | 10 |
| P11 | 0 | 0 | 0 | 40 | 0 | 0 |
| P10 | 20 | 10 | 10 | 0 | 0 | 0 |
| P12 | 0 | 0 | 0 | 0 | 0 | 0 |
| P2 (PT) | 70 | 80 | 70 | 30 | 30 | 20 |
| P3 (PT) | 50 | 60 | 60 | 50 | 30 | 10 |
| P4 (PT) | 30 | 0 | 10 | 30 | 0 | 10 |

**Task 4 (Phase 2 design)**

| P | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| P0 | 70 | 30 | 60 | 40 | 40 | 30 |
| P1 | 40 | 10 | 40 | 40 | 10 | 20 |
| P5 | 40 | 20 | 50 | 40 | 30 | 50 |
| P6 | 20 | 20 | 20 | 20 | 20 | 20 |
| P7 | 40 | 30 | 30 | 30 | 10 | 10 |
| P8 | 20 | 10 | 20 | 20 | 20 | 20 |
| P9 | 70 | 10 | 90 | 70 | 50 | 20 |
| P11 | 50 | 0 | 0 | 0 | 0 | 0 |
| P10 | 60 | 10 | 20 | 30 | 0 | 0 |
| P12 | 20 | 20 | 20 | 0 | 0 | 0 |
| P2 (PT) | 80 | 80 | 80 | 70 | 50 | 10 |
| P3 (PT) | 70 | 40 | 70 | 70 | 30 | 20 |
| P4 (PT) | 40 | 0 | 30 | 40 | 0 | 10 |

**Task 6 (Phase 3 packs)**

| P | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| P0 | 50 | 30 | 40 | 30 | 50 | 20 |
| P1 | 50 | 20 | 20 | 40 | 30 | 30 |
| P5 | 10 | 0 | 20 | 10 | 0 | 20 |
| P6 | 20 | 20 | 20 | 20 | 20 | 20 |
| P7 | 40 | 20 | 20 | 20 | 30 | 10 |
| P8 | 50 | 50 | 30 | 50 | 60 | 70 |
| P9 | 70 | 10 | 70 | 70 | 50 | 20 |
| P11 | 0 | 0 | 0 | 0 | 0 | 0 |
| P10 | 10 | 10 | 0 | 10 | 0 | 0 |
| P12 | 20 | 0 | 20 | 20 | 0 | 0 |
| P2 (PT) | 80 | 70 | 70 | 90 | 50 | 10 |
| P3 (PT) | 80 | 50 | 60 | 60 | 20 | 20 |
| P4 (PT) | 40 | 0 | 50 | 50 | 30 | 20 |

**Task 7 (Phase 4 QA)**

| P | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| P0 | 40 | 20 | 30 | 40 | 50 | 20 |
| P1 | 50 | 20 | 20 | 20 | 10 | 20 |
| P5 | 0 | 0 | 0 | 10 | 0 | 10 |
| P6 | 20 | 20 | 20 | 20 | 20 | 20 |
| P7 | 30 | 20 | 20 | 30 | 20 | 10 |
| P8 | 0 | 0 | 0 | 0 | 0 | 0 |
| P9 | 70 | 10 | 80 | 50 | 10 | 20 |
| P11 | 0 | 0 | 0 | 0 | 0 | 0 |
| P10 | 0 | 0 | 0 | 0 | 0 | 0 |
| P12 | 0 | 0 | 0 | 0 | 0 | 0 |
| P2 (PT) | 50 | 50 | 40 | 70 | 60 | 20 |
| P3 (PT) | 60 | 40 | 30 | 50 | 20 | 20 |
| P4 (PT) | 10 | 0 | 10 | 10 | 10 | 0 |

**Task 8 (Phase 5 deployment gate)**

| P | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| P0 | 50 | 30 | 60 | 30 | 50 | 40 |
| P1 | 30 | 10 | 20 | 30 | 10 | 20 |
| P5 | 30 | 20 | 20 | 0 | 10 | 10 |
| P6 | 20 | 20 | 20 | 20 | 20 | 20 |
| P7 | 20 | 20 | 20 | 20 | 20 | 10 |
| P8 | 10 | 0 | 10 | 0 | 0 | 30 |
| P9 | 50 | 10 | 70 | 70 | 50 | 30 |
| P11 | 0 | 0 | 0 | 0 | 0 | 0 |
| P10 | 0 | 10 | 10 | 40 | 20 | 50 |
| P12 | 20 | 20 | 10 | 20 | 0 | 0 |
| P2 (PT) | 40 | 70 | 70 | 80 | 80 | 20 |
| P3 (PT) | 40 | 60 | 30 | 50 | 10 | 20 |
| P4 (PT) | 20 | 0 | 10 | 20 | 20 | 30 |

**Task 9 (Export)**

| P | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| P0 | 10 | 10 | 20 | 20 | 10 | 10 |
| P1 | 0 | 0 | 0 | 10 | 0 | 0 |
| P5 | 10 | 10 | 0 | 0 | 0 | 0 |
| P6 | 20 | 20 | 20 | 20 | 20 | 20 |
| P7 | 30 | 20 | 10 | 10 | 0 | 0 |
| P8 | 0 | 0 | 0 | 0 | 0 | 100 |
| P9 | 0 | 0 | 0 | 0 | 10 | 0 |
| P11 | 0 | 0 | 0 | 0 | 0 | 0 |
| P10 | 0 | 0 | 0 | 0 | 0 | 0 |
| P12 | 0 | 0 | 0 | 0 | 0 | 0 |
| P2 (PT) | 20 | 20 | 10 | 30 | 0 | 0 |
| P3 (PT) | 20 | 20 | 20 | 10 | 0 | 0 |
| P4 (PT) | 10 | 0 | 10 | 0 | 0 | 10 |

Note on P8/Task 9: participant entered their code in lowercase ("p8") on
this one row only, in the raw sheet; treated as P8 (same participant, all
other 5 of their 6 rows use "P8"), flagged here in case the writing agent
wants to note it as a minor data-entry artefact rather than a 14th
participant appearing.

### Six-subscale x six-task matrix (means across all 13 participants)

This is the primary artefact per `instrument-nasa-tlx.md` (headline figure /
heatmap source).

| Task | Mental | Physical | Temporal | Effort | Frustration | Performance | Task aggregate (mean of 6) |
|---|---|---|---|---|---|---|---|
| 3 (Gherkin) | 26.9 | 17.7 | 21.5 | 23.8 | 13.1 | 14.6 | 19.6 |
| 4 (Design) | 47.7 | 21.5 | 40.8 | 36.2 | 20.0 | 16.2 | 30.4 |
| 6 (Packs) | 40.0 | 21.5 | 32.3 | 36.2 | 26.2 | 18.5 | 29.1 |
| 7 (QA) | 25.4 | 13.8 | 19.2 | 23.1 | 15.4 | 10.8 | 17.9 |
| 8 (Deploy) | 25.4 | 20.8 | 26.9 | 29.2 | 22.3 | 21.5 | 24.4 |
| 9 (Export) | 9.2 | 7.7 | 6.9 | 7.7 | 3.1 | 10.8 | 7.6 |

Medians per cell (given coarse 10-point resolution, means alone understate
this):

| Task | Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|---|
| 3 | 20 | 10 | 10 | 30 | 10 | 10 |
| 4 | 40 | 20 | 30 | 40 | 20 | 20 |
| 6 | 40 | 20 | 20 | 30 | 30 | 20 |
| 7 | 20 | 10 | 20 | 20 | 10 | 10 |
| 8 | 20 | 20 | 20 | 20 | 20 | 20 |
| 9 | 10 | 0 | 0 | 0 | 0 | 0 |

### Subscale profile, collapsed across all 6 tasks (N=78 administrations)

| Mental | Physical | Temporal | Effort | Frustration | Performance |
|---|---|---|---|---|---|
| 29.1 | 17.2 | 24.6 | 26.0 | 16.7 | 15.4 |

### Grand aggregate (unweighted mean of the six subscale means)

**21.5** (out of 100).

### Per-task aggregate ranking (highest to lowest total workload)

1. Task 4, Design: 30.4
2. Task 6, Packs: 29.1
3. Task 8, Deploy: 24.4
4. Task 3, Gherkin: 19.6
5. Task 7, QA: 17.9
6. Task 9, Export: 7.6

### Pre-registered predictions vs. observed (from `instrument-nasa-tlx.md`, for the writing agent to cross-read; not an interpretation, just the recorded prediction next to the recorded number)

- Task 3 predicted highest Mental Demand -> observed Mental=26.9, actually
  second-highest task (Task 4=47.7 is highest).
- Task 4 predicted high Mental + high Effort -> observed Mental=47.7
  (highest of all tasks), Effort=36.2 (highest of all tasks, tied-ish with
  Task 6's 36.2).
- Task 6 predicted "moderate throughout, largely a review task" -> observed
  second-highest aggregate (29.1), Effort tied-highest (36.2), Frustration
  highest of all tasks (26.2).
- Task 7 predicted "low across the board" -> observed lowest or
  second-lowest on every subscale except being unremarkable middle - overall
  second-lowest aggregate (17.9).
- Task 8 predicted "moderate throughout" (no longer a refusal test) ->
  observed Performance=21.5, the highest Performance (least-perfect-rated)
  score of any task, and third-highest aggregate.
- Task 9 predicted "lowest overall" -> observed lowest on every single
  subscale and lowest aggregate (7.6). Confirmed.
- Physical Demand predicted near-floor throughout -> observed lowest or
  near-lowest subscale in every task (range 7.7-21.5), confirmed.

### Verbatim TLX free-text comments (by participant/task)

Three free-text fields per submission: general comment, Task-6-only
"name the task that must be done first and why", Task-8-only "describe what
happened when you tried to deploy". Empty fields omitted. 34 total non-empty
comments (26 EN, 8 PT) out of 78 possible submissions x 1-3 fields.

**EN**

- P1/T3/general: "Was confused at first until i realized i needed to press
  \"Requirements\" on the sidebar, from then on it was easy."
- P1/T6/task6: "\"Create PasswordResetRequest database entity\" Before
  implementing anything we must create the entity as it supports the rest
  of the flow."
- P1/T8/task8: "Received a warning by the AI about required infra changes,
  ignoring that due it being a demo project i moved on and successfully
  created a Deploy Pack"
- P5/T3/general: "The AI answer is in portuguese even tho I have the title,
  description and website in english."
- P5/T6/task6: "2. Create database schema and RLS policies for users - The
  registration API needs somewhere to store the user's profile and relies
  on the database constraints."
- P5/T8/task8: "The AI noticed that it didn't have any pipelines in the
  repository and gave me \"4 changes required\" so it generated a deploy
  pack for this story with the tasks to set up CI/CD pipelines, environment
  variables, database migrations, etc. The deployment went smooth."
- P6/T6/task6: "Create OnboardingChecklist database entity"
- P6/T8/task8: "It deployed? Im not sure"
- P7/T6/task6: "Implement POST /api/v1/password-reset/request endpoint, it
  made sense because of its fundamental logic of the endpoint creation"
- P7/T8/task8: "Although there is no current records of deployment
  infrastructure, the AI model seems to confidently say the otherwise. It
  is a good system, and knowing that it's a demo github repository it's
  understandable, but more grounding and context injection would make this
  feature more smooth."
- P9/T3/general: "For the simplicity of the task the AI did its job well,
  only had a minor sidequest, decided to speak in Portuguese, did not find
  a reason for it to speak with it."
- P9/T4/general: "Task dependent, if harder tasks where at stake it would
  mean more effort from the Developer, since the AI can sometimes
  hallucinate or go ways that we do not expect, so a thorough reading of
  every thing it as accomplished is needed."
- P9/T6/task6: "\"Create PasswordResetRequest Mongoose model\" - The AI
  suggested starting from the database, since we need a password request
  \"token\" its the most logical starting point."
- P9/T8/task8: "The task went well, it described its intent and analyzed
  correctly the given infrastructure"
- P11/T3/general: "Pretty solid task, very intuitive"
- P11/T6/task6: "Implement POST password-reset complete endpoint - The
  first stepping block to create user password resets is having the
  endpoint itself, a POST that will have a token and a new password and
  will give a response for future processes. Also serves for error checks"
- P11/T8/task8: "Went well, I manually deployed and showed a green
  rectangle saying it was deployed and that logs are in .md file"
- P10/T3/general: "It's really fluid overall"
- P10/T4/general: "Relativamente ao Apex é uma UI um pouco densa demais e
  ligeiramente confusa, acho que as coisas não têm uma separacão nitida
  então obriga a perder um pouco mais de tempo a entender" (PT text
  submitted on the EN-language sheet)
- P10/T6/task6: "Implement POST. É a base do sistema de password reset, é
  quando acontece a primeira interação" (PT text on EN sheet)
- P10/T7/general: "Perfeito" (PT text on EN sheet)
- P10/T8/task8: "Alguns avisos dos agentes que dizem que não existe
  infraestrutura para suportar essa feature. Bastante interessante dizerem
  o que falta na infra." (PT text on EN sheet)
- P10/T9/general: "Nice."
- P12/T6/task6 (this exact text also appears entered against T7's row -
  data-entry artefact, both instances given): "Logically the task
  \"Password Reset Request\" has to be first because a user has to request
  a reset before you can deliver the email, use the link or implement
  security mechanisms" (T6 row) / "...before the email delivery, the link
  for the reset, and before implementing security mechanisms for the
  reset" (T7 row, near-duplicate wording)
- P12/T8/task8: "The deployment went smoothly, without any issues."

**PT**

- P2/T6/task6: "Create password recovery request entity and migration,
  tinha de ser primeiro pois era o que fazia sentido"
- P2/T8/task8: "Houve um problema com o raciocinio da AI sobre o contexto
  do repositório, no entanto após corrigir foi fácil de identificar que
  este era o primeiro deployment do projeto e seguir em frente para a
  criação do Deploy Pack"
- P3/T6/task6: "Implement password recovery request endpoint, pois é a
  tarefa técnica que vai criar a base para as restantes"
- P3/T8/task8: "Correu bem, a IA reconheceu com confiança que faltava
  infraestrutura para o deployment e fizemos um plano para isso mesmo!"
- P3/T9/general: "Relativamente intuítivo"
- P4/T6/general: "Achei a UI um bocado confusa"
- P4/T6/task6: "Create password reset request database schema - Pois
  geralmente a database é feita primeiro"
- P4/T8/task8: "Tive apenas alguns avisos/recomendações referentes à
  implementação da pipeline CI/CD"

**Cross-reference to the real Phase 5 bug (`demo-environment.local.md`,
memory `thesis_p0_pilot_2026_09_02.md`):** P1's and P2's Task 8 comments
both describe an AI-issued "infra changes required" warning that the
participant then worked around/through; this independently corroborates the
stale-`github-context.md`-trusted-at-confidence bug found live during P0's
own (unrecorded) session. P3 and P4's Task 8 comments describe the AI
correctly identifying missing infra with confidence and no friction - per
`demo-environment.local.md`, P2/P3's framing ("first deployment") matches
the framework's own documented bootstrap rule rather than the same
hallucination, and P1's framing reads more like surprise at friction. This
area (Phase 5 pre-flight repository-context reasoning) was investigated and
partly fixed in code (`830913b`, the Clear-button bug) during the study,
per `demo-environment.local.md`'s 2026-09-03 entries.

## 3. Apex UX questionnaire results

N = 13 (all participants: EN sheet "Apex - your experience of the interface
(respostas)" 10 responses P0,P1,P5,P6,P7,P8,P9,P11,P12,P10; PT sheet "Apex -
a sua experiência com a interface (respostas)" 3 responses P2,P3,P4).
Verified directly against both linked Sheets, cell range by cell range (not
screenshot-only), cross-checked against a scratch per-row concatenation
formula left over in the PT sheet from an earlier session
(`=B2&CARACT(10)&TEXTJOIN(CARACT(10);FALSO;ARRAYFORMULA(SEERRO(VALOR(ESQUERDA(C2:S2;1));"NA")))`),
which independently reproduced the same 17 values per participant; that
scratch column has been deleted after use, per the instrument's own
instruction to clean up scratch formulas. One participant (P8) entered their
code as lowercase "p8" in this sheet too (same minor data-entry artefact
noted in Section 2), treated as P8.

Per `instrument-apex-ux.md`: **no composite score, no subscale means** - each
item is reported individually with its response distribution and median.
Scale: 1 = Strongly disagree ... 5 = Strongly agree, plus an explicit N/A -
did not use this option (excluded from the median calculation, counted
separately). Section A's original item A4 was deleted 2026-08-30 (see
Section 0 note above) - A is A1-A3 only, 17 items total.

### Raw per-participant, per-item responses

Order: A1,A2,A3 | B1,B2,B3,B4,B5 | C1,C2,C3,C4 | D1,D2 | E1,E2,E3.

| P | A1 | A2 | A3 | B1 | B2 | B3 | B4 | B5 | C1 | C2 | C3 | C4 | D1 | D2 | E1 | E2 | E3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 3 | 5 | 5 | 4 | 4 | 3 | 4 | 4 | 4 |
| P1 | 5 | 3 | 4 | 5 | 5 | 5 | 4 | 4 | 4 | 5 | 4 | 5 | 5 | 5 | 4 | 4 | 5 |
| P5 | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | 4 | 5 | 5 | 4 | 3 | 4 | 5 | 4 | 5 |
| P6 | 3 | 3 | 3 | 5 | 5 | 5 | 5 | 5 | 3 | 5 | 3 | 5 | 3 | 3 | 3 | 3 | 3 |
| P7 | 5 | 3 | 4 | 5 | 3 | 5 | 3 | 5 | 4 | 5 | 4 | 5 | 3 | 4 | NA | NA | 5 |
| P8 | 5 | 4 | 3 | 5 | 4 | 5 | 3 | 3 | 3 | 3 | 3 | 5 | 3 | 4 | NA | NA | 4 |
| P9 | 5 | 4 | 4 | 5 | 4 | 5 | 4 | 4 | 5 | 5 | 3 | 5 | 4 | 5 | 4 | 2 | 4 |
| P11 | 5 | 5 | 5 | 5 | 3 | 5 | 5 | 4 | 4 | 2 | 5 | 4 | 4 | 5 | 4 | 4 | 5 |
| P12 | 4 | 5 | 4 | NA | 5 | NA | 4 | 5 | 4 | 5 | 3 | 5 | 3 | 5 | 3 | 3 | 5 |
| P10 | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 2 | 4 | 5 | 5 | 5 | 5 | 5 | NA | NA | 5 |
| P2 | 4 | 4 | 3 | 2 | 4 | 5 | 4 | 4 | 2 | 4 | 5 | 5 | 3 | 3 | 4 | 4 | 3 |
| P3 | 3 | 3 | 4 | 5 | 4 | 5 | 4 | 4 | 4 | 4 | 5 | 5 | 4 | 5 | 3 | 4 | 4 |
| P4 | 3 | 4 | 3 | 2 | 4 | 5 | 3 | 4 | 4 | NA | 2 | 4 | 2 | 3 | 2 | 2 | 4 |

### Per-item distribution and median (N=13, N/A excluded from median)

Format: counts for 1/2/3/4/5, then NA count, then median.

**A. Understanding where you are**

| Item | 1 | 2 | 3 | 4 | 5 | NA | Median |
|---|---|---|---|---|---|---|---|
| A1 - knew which phase I was in | 0 | 0 | 3 | 4 | 6 | 0 | 4 |
| A2 - understood what tool expected next | 0 | 0 | 4 | 5 | 4 | 0 | 4 |
| A3 - could tell finished vs unfinished work | 0 | 0 | 4 | 7 | 2 | 0 | 4 |

**B. Working with AI-generated content**

| Item | 1 | 2 | 3 | 4 | 5 | NA | Median |
|---|---|---|---|---|---|---|---|
| B1 - could tell AI-generated vs own parts | 0 | 2 | 0 | 3 | 7 | 1 (P12) | 5 |
| B2 - reviewing AI output took less effort than writing it | 0 | 0 | 2 | 6 | 5 | 0 | 4 |
| B3 - felt able to reject/change AI output | 0 | 0 | 0 | 1 | 11 | 1 (P12) | 5 |
| B4 - trusted generated content enough for real project | 0 | 0 | 3 | 8 | 2 | 0 | 4 |
| B5 - could see what info AI had been given | 0 | 1 | 2 | 6 | 4 | 0 | 4 |

B2/B4 trust-calibration pair (per instrument note): B4 median 4, B2 median
4 - not a case of high-trust/low-scrutiny divergence at the median, though
individual spread exists (B4 min 3, max 5; B2 min 3, max 5).

**C. Control and reversibility**

| Item | 1 | 2 | 3 | 4 | 5 | NA | Median |
|---|---|---|---|---|---|---|---|
| C1 - felt in control of what tool did | 0 | 1 | 3 | 8 | 1 | 0 | 4 |
| C2 - confident could undo/redo a step | 0 | 1 | 1 | 2 | 8 | 1 (P4) | 5 |
| C3 - understood consequences of locking a phase | 0 | 1 | 4 | 2 | 6 | 0 | 4 |
| C4 - waiting for AI to finish was acceptable | 0 | 0 | 0 | 4 | 9 | 0 | 5 |

**D. Feedback and errors**

| Item | 1 | 2 | 3 | 4 | 5 | NA | Median |
|---|---|---|---|---|---|---|---|
| D1 - told clearly what had happened when something went wrong | 0 | 1 | 6 | 4 | 2 | 0 | 3 |
| D2 - messages said what to do next, not only what failed | 0 | 0 | 4 | 3 | 6 | 0 | 4 |

**E. Fit to real work** (E2, E3 are framework-scoped per instrument note -
see Section 6 mapping)

| Item | 1 | 2 | 3 | 4 | 5 | NA | Median |
|---|---|---|---|---|---|---|---|
| E1 - artefacts are ones my team would actually use (tool-scoped) | 0 | 1 | 3 | 5 | 1 | 3 (P7,P8,P10) | 4 |
| E2 - process fits the way my team works (**framework**) | 0 | 2 | 2 | 6 | 0 | 3 (P7,P8,P10) | 4 |
| E3 - effort of following the process is worth what it produces (**framework**) | 0 | 0 | 2 | 5 | 6 | 0 | 4 |

Note the identical N/A triple (P7, P8, P10) on E1: these three participants
marked "did not use this" on all three E-block Likert items in the same
session, not just E1/E2 - i.e. a within-participant pattern, not three
independent missing values.

### Open questions - verbatim responses

**Q1 - What was the single most confusing thing about using Apex? (EN)**

- P0: "My biggest difficulty was the beginning itself; since the UI was a bit
  overstimulating I was confused on how or where could i start mainly with
  Phase 1."
- P1: "Too many things in the screen at the begging not sure where to click,
  after starting the flow it was easy."
- P5: "Design"
- P6: "Too much happening at the same time"
- P7: "Sometimes on certain phases there was no clear directions on what to
  do next, so I would suggest more clarity."
- P8: "I made a mistake in one of the stages, and I know I did. However,
  Apex did not clearly show what the error was, or perhaps I did not fully
  understand it. In any case, for testing purposes and out of curiosity, I
  decided to continue with the mistake and complete the following stages
  correctly, but based on that incorrect assumption."
- P9: "The amount of text in the screen, its overwhelming for beginners and
  first time users, if you don't understand the context and technical terms
  you will get lost, but this type of tool requires a level of technical
  skills not fit for a beginner, a team leader or a senior developer are the
  best examples which this tool was mainly implemented for."
- P11: "Where were the buttons to proceed to the next steps"
- P12: "A lot of things in the UI could be a bit confusing, especially
  without a guide to follow, but I'm sure it would be fine for regular use."
- P10: "Nada" (Portuguese "nothing", submitted on the EN sheet)

**Q1 (PT)**

- P2: "A navegação pelo sistema e termos técnicos."
- P3: "Navegação pelos múltiplos menus e fases"
- P4: "Acho que a UI"

**Q2 - Was there a point where you did not trust what the tool had
produced? What made you doubt it? (EN)**

- P0: "No, I actually reviewed a lot of the artifacts the tool generated and
  at first glance it seemed fine."
- P1: "Not really, the results looked consistent"
- P5: "No"
- P6: "No"
- P7: "No because I believed that the AI models used were properly
  grounded so I did not review in great detail and I trusted it completely."
- P8: "yes, probably because of the quantity of information received"
- P9: "The architecture, it did a good job this time around, but its model
  dependent, since some can hallucinate."
- P11: "No"
- P12: "I felt the tool was trustworthy"
- P10: "Não" (Portuguese "no", submitted on the EN sheet)

**Q2 (PT)**

- P2: "Desconfio sempre um pouco devido ao meu receio de os artefactos que a
  IA produz não serem 100% reais."
- P3: "Não duvidei, pois acredito que ajudei a AI a melhorar o output para
  corresponder ao desejado"
- P4: "Não"

**Q3 - If you could change one thing about the interface, what would it
be? (EN)**

- P0: "No, personally there is not a thing I would change because I became
  quite fond of the UI and UX visuals and color scheme of the tool. Maybe
  introduce more simplicity or more linear progression between phases."
- P1: "Nothing, the interface is clean and responsive."
- P5: "I think it's very simple and straight forward, it's very good."
- P6: "Make it a lot simpler"
- P7: "Overall, although confusing sometimes I enjoyed the interface visuals
  and would not change a thing."
- P8: "To make AI responses more visually appealing and easier on the eyes."
- P9: "Less text, more simplicity. The rest is as said before technical
  dependent."
- P11: "Maybe when a phase ended, maybe add a shortcut directly in the
  phase to proceed to the next one"
- P12: "The interface is fine. The level of confusion is normal for a tool
  with this many features, which is expected. Again, with regular use, I
  believe the user would become very familiar with the interface."
- P10: "Dropdown menu dentro de cada story com as tasks" (Portuguese,
  submitted on the EN sheet)

**Q3 (PT)**

- P2: "Apesar de ter tido alguma dificuldade com a navegação, gostei dos
  visuais e da interface em geral."
- P3: "O tamanho das letras em geral para pessoas com pouca visibilidade"
- P4: "Talvez poderia haver um pouco menos de informação por página. Acho
  também que os títulos e indicações das fases, por exemplo, podiam ser
  mais destacados"

## 4. Demographics / consent (G1-G6)

N = 13. EN sheet "Apex study - consent and about you (respostas)": 9
responses (P0, P1, P5, P6, P7, P8, P9, P11, P12). PT sheet "Estudo Apex -
consentimento e sobre si (respostas)": 4 responses (P2, P3, P10, P4).
**P10 is a cross-language case**: P10 submitted the *Portuguese* consent
form (verified directly - row for P10 is in the PT sheet, not the EN one)
but recorded "Preferred language for this session" = **English**, and in
fact used the EN-language SUS and UX forms elsewhere in the study (Sections
1 and 3 above). This is a genuine data inconsistency, not a
transcription error on this pass - flagged for the writing agent as a
threats-to-validity / data-collection-artefact item, not silently
resolved.

All 13/13 consented to participate ("I consent to participate" /
"Consinto em participar"). No withdrawals.

### Optional permissions (quotations vs. follow-up interview contact)

| Permission | Count | Participants |
|---|---|---|
| Both (anonymised quotes + follow-up interview contact) | 9 | P0, P1, P2, P3, P4, P5, P6, P7, P8 |
| Anonymised quotes only | 2 | P11, P12 |
| Follow-up interview contact only | 2 | P9, P10 |

11/13 consented to anonymised quotation use; 11/13 agreed to be contacted
for a follow-up interview (the two sets overlap at 9, per the table above).

### G1 - Years of professional software development experience

| Participant | Years |
|---|---|
| P0 | 1 to 3 |
| P1 | Student |
| P5 | 1 to 3 |
| P6 | Student |
| P7 | Student |
| P8 | 1 to 3 |
| P9 | 1 to 3 |
| P11 | 1 to 3 |
| P12 | 1 to 3 |
| P2 | Less than 1 |
| P3 | 1 to 3 |
| P10 | Less than 1 |
| P4 | Less than 1 |

Distribution: Student 3, Less than 1: 3, 1 to 3: 7.

### G2 - Current role

| Participant | Role |
|---|---|
| P0 | Student |
| P1 | Student |
| P5 | Developer |
| P6 | Student |
| P7 | Student |
| P8 | AI Engineer |
| P9 | Developer |
| P11 | Developer |
| P12 | Developer |
| P2 | Hairdressing official - partner/manager (PT: "Oficial de Cabeleireira - Sócia/Gerente") |
| P3 | Communications network technician (PT: "Técnico de Redes de Comunicação") |
| P10 | Student (PT: "Estudante") |
| P4 | Student (PT: "Estudante") |

Distribution: Student 6, Developer 4, AI Engineer 1, Hairdressing official 1,
Network technician 1. Two of the 13 participants (P2, P3) have no software
development background at all - relevant to the AI-exposure/seniority split
required for `sec:eval_participants`.

### G3 - Frequency of use of AI coding assistants

| Participant | Frequency |
|---|---|
| P0 | Tried once or twice |
| P1 | Daily |
| P5 | Daily |
| P6 | Weekly |
| P7 | Monthly |
| P8 | Daily |
| P9 | Daily |
| P11 | Weekly |
| P12 | Weekly |
| P2 | Never |
| P3 | Tried once or twice |
| P10 | Weekly |
| P4 | Monthly |

Distribution: Never 1, Tried once or twice 2, Monthly 2, Weekly 4, Daily 4.

### G4 - Familiarity with Gherkin/BDD

| Participant | Familiarity |
|---|---|
| P0 | None |
| P1 | None |
| P5 | Have seen it |
| P6 | Have seen it |
| P7 | None |
| P8 | None |
| P9 | Have seen it |
| P11 | Have seen it |
| P12 | None |
| P2 | None |
| P3 | None |
| P10 | None |
| P4 | None |

Distribution: None 9, Have seen it 4, Regular use 0.

### G5 - Familiarity with the project management tool (Taiga) used in the session

| Participant | Familiarity |
|---|---|
| P0 | None |
| P1 | None |
| P5 | None |
| P6 | None |
| P7 | (blank - not answered) |
| P8 | Some |
| P9 | None |
| P11 | None |
| P12 | None |
| P2 | None |
| P3 | None |
| P10 | Some |
| P4 | None |

Distribution: None 11, Some 2, blank/unanswered 1 (P7).

### G6 - Preferred language for the session

| Participant | Preferred language |
|---|---|
| P0 | English |
| P1 | English |
| P5 | English |
| P6 | English |
| P7 | English |
| P8 | English |
| P9 | **Portuguese** (despite completing every other instrument in English) |
| P11 | English |
| P12 | English |
| P2 | Portuguese |
| P3 | Portuguese |
| P10 | **English** (despite submitting the Portuguese-language consent form) |
| P4 | Portuguese |

Two cross-language mismatches worth flagging together: P9 declared a
Portuguese preference but completed all task/instrument forms in English
(consistent with the TLX free-text note in Section 2 about the AI
unexpectedly replying in Portuguese to P9); P10 declared an English
preference but the *consent form itself* was the Portuguese variant. Neither
is a data-cleaning error introduced during this pass - both are recorded
exactly as entered in the source sheets.

## 5. Real bugs/incidents found live during the study (cross-reference)

Source: `docs/thesis/evaluation/demo-environment.local.md` (gitignored
session log, narrative notes taken across the data-collection window) and
this session's own memory index entries. Listed in roughly chronological
order. This is a factual log for the writing agent to draw on for
`sec:threats` and the discussion - not a claim about product quality, and
not itself something to present as "results" of the survey instruments.

### Product bugs found and root-caused during the evaluation window

1. **Taiga Status Mapping / Import 404 (found + fixed before P0, 2026-08-28,
   `cbe6ee3`).** `import_service.py` and `workspace.py`'s `/status-mapping`
   route called the wrong Taiga endpoint (`/userstories/statuses` instead of
   `/userstory-statuses`); the test suite's fake Taiga server matched the
   same wrong path so it was never caught before. Fixed before data
   collection began - included here because it was found through the act of
   setting up this evaluation's demo project, not through unrelated work.
2. **`taigaGetBoard` drops orphan stories with no epic (found before P0,
   2026-08-28).** A story with no `epic_id` is silently absent from the
   Epics & Stories board view even though story-index counts it correctly.
   Worked around for the study (every seeded story given an epic); the
   underlying board-view gap was not fixed in code.
3. **GitHub context pack token ceiling (found live during P0's session,
   2026-09-02).** `dummyREPO`'s sync failed ("Repository is too large to
   pack even compressed") against the default 80,000-token compress budget
   in `github_fetch.py`'s `_COMPRESS_TOKEN_BUDGET`, despite the repo having
   no real CI pipeline markers at all. Worked around per-project (Pack
   detail: Compressed, Pack max tokens ~150,000); not changed in code during
   the study.
4. **Stale GitHub context trusted at "High Confidence" by Phase 5 (found
   live during P0's session, 2026-09-02; independently corroborated by P1's
   Task 8 free-text comment the same day).** `write_context_file
   ("github-context.md", ...)` only runs after `clone_and_pack` succeeds, so
   a failed sync leaves a stale file in place with no staleness signal;
   `_pipeline_detected()` in `phase5_service.py` then reads that stale
   content as current, and the model - told only a bare boolean, never
   which file - invents a plausible filename when asked to cite evidence.
   **Not fixed in code during the study.** This is the same bug the
   `thesis_p0_pilot_2026_09_02` memory entry calls one of "2 real Apex bugs
   found live" during P0's pilot.
5. **Phase 5 "Clear" button silently un-does itself (found live and fixed
   in code, 2026-09-03, `830913b`).** `useLoadInfraDelta`'s resume-query was
   gated on `infraDelta === null`, and `clearInfraDelta` sets `infraDelta`
   to `null` as its first act - so clicking Clear immediately re-triggered
   the query that re-fetched the still-saved server-side delta and wrote it
   straight back. Root-caused, fixed with a `deltaCleared` flag, 5 new unit
   tests added, both Phase 5 e2e specs still passing, pushed and deployed
   same day.
6. **`ai_language` global-config leak across projects (found live during
   P5's session, 2026-09-04; fixed same day, `3efd992`).** P5's Task 3
   comment noted the AI answered in Portuguese despite an English project;
   root cause was `ai_language` living in a genuinely global
   `.apex-config.json` (not scoped by `instance_id`/`project_id`), so P2 and
   P3's earlier Portuguese sessions had left the shared setting on "pt" and
   it carried into P5's nominally-English session. Fixed by moving
   `ai_language` to a new per-project `.project-language-config.json`
   (mirroring the existing GitHub-PAT per-project pattern), verified with 6
   new cross-project-isolation tests plus the full backend/frontend/e2e
   suite, deployed same day.

### Data-hygiene items (not product bugs)

- **Stray `TEST-DELETE-ME` rows**: found in the linked response sheets for
  both the EN and PT TLX and SUS forms (F1-EN, F2-EN/SUS, F1-PT, F2-PT/SUS)
  - 6 rows total across the four sheets, per the
  `thesis_eval_data_collection_complete_2026_09_13` memory entry (an earlier
  narrative note undercounted this as 3). Google Forms' own response counts
  already excluded these rows everywhere checked; they were visual clutter
  in the raw sheets only, since deleted, and never affected any computed
  score in this document.
- **Dead UX-instrument column (A4)**: "When the tool refused to let me
  continue, I understood why" was removed from both live forms 2026-08-30
  (Task 8 no longer guarantees a refusal - see Section 0 above) but the
  column header artefact remained visible/blank in the response sheet for
  every participant after that date. Not missing data - the item does not
  exist for any participant in this study. Since deleted from the sheets.

### Qualitative pattern across participants (Phase 5 pre-flight reasoning)

Four different participants' Task 8 free-text comments (P1, P2, P3 EN/PT;
see Section 2's verbatims) all center on Phase 5's pre-flight
repository-context reasoning, but land on different framings: P1 read the
"infra changes required" verdict as unexpected friction on a demo project;
P2 and P3 (PT) both explicitly named "first deployment" as the resolving
fact, which is the framework's own documented bootstrap rule
(`needs_infra_change=true` when no prior deploy exists) rather than
necessarily the same context-staleness bug P1 and P0 hit. Tomás's own
follow-up investigation (2026-09-03) found the specific repository-context
confusion P1/P0 experienced was rooted in `dummyREPO`'s own files and fixed
it there directly, separately from the `github-context.md` staleness bug
above. Four participants converging on the same feature area from three
different angles is noted here as a fact pattern for the discussion
section, not resolved into a single interpretation in this data pass.

## 6. Mapped to Chapter 9's empty sections

Pointers only - no prose synthesis here, that is the writing agent's job.
Each Chapter 9 `\todo` is quoted verbatim (as of this pass) with the section
of this document that supplies its data, or a note if this document cannot
supply it.

### `sec:eval_strategy` (line ~45)

> "State plainly that SUS and NASA-TLX measure the instantiation, not the
> methodology..."

Not survey data - a framing/positioning statement. `instrument-sus.md`,
`instrument-nasa-tlx.md` and `instrument-apex-ux.md`'s own header notes
already argue this explicitly; the E2/E3 framework-scoping split in Section
3 above is the one place survey data itself needs to be split by that
line.

### `sec:eval_participants` (lines ~51, ~53)

> "Report the number of participants, their roles, seniority, sector, and
> prior exposure to AI-assisted development... state honestly what the
> achieved sample supports and what it does not."
> "Describe how participants were recruited..."

Data: **Section 4** (all of G1-G6, N=13, recruitment channel is not
survey data - see `EVALUATION-PLAN.md`'s Participants section for the
recruitment description itself, not reproduced here since it is process
narrative rather than a number to report). N=13 vs. SUS's "stable from
around twelve" benchmark is a direct, already-computed fact worth quoting:
this study meets that bar.

### `sec:sus` (line ~115)

> "Report the scoring procedure and state the interpretation scale used...
> Report the Usability and Learnability sub-scales separately... State also
> the limits the Portuguese validation itself reports..."

Data: **Section 1** in full (scores, Bangor/Sauro-Lewis bands, Usability/
Learnability sub-scales, PT validation caveats already stated verbatim from
`instrument-sus.md`).

### `sec:tlx` (line ~130)

> "Define the task set both instruments are administered against, and keep
> it identical across participants."

Not survey data - this is the task-set definition itself (`task-set.md`),
already identical across all 13 participants (verified in Section 2's task
administration counts, 78/78 rows). Numeric TLX results: **Section 2**.

### `sec:apex_ux` (line ~156)

> "State which item pair is expected to be the most diagnostic... the trust
> items (B4/B2) as a trust-calibration pair, and the item on understanding a
> deployment-gate refusal, cross-read against... Frustration... since there
> is no observer-scored comprehension check..."

Data: **Section 3**'s B2/B4 note gives the trust-calibration pair numbers
(B4 median 4, B2 median 4). The deployment-gate refusal cross-read
**no longer applies** - A4 was deleted 2026-08-30 (Section 0 note, repeated
in Section 3's intro) - the writing agent needs to state this explicitly
rather than silently drop the cross-read.

### `sec:analytical` (line ~181)

> "State the success criteria in advance... and the three-level ordinal
> scale used to assess each. Each rating must carry a short qualitative
> justification grounded in observed usage, artefacts, or interview
> evidence..."

**Not P0-P12 survey data** - this is a framework-level assessment against
the interview/practitioner-consultation evidence (`sec:interviews`,
already fully written) and the demonstration, not something this data pass
computes. The one indirectly relevant fact: Section 5's product-bug log and
Section 2's Phase-5 qualitative pattern are "observed usage/artefacts"
evidence a framework-level rating could cite for the human-in-the-loop and
governance criteria specifically (e.g. the deployment-gate reasoning
pattern across P0/P1/P2/P3 as evidence about governance of AI-enabled
activity).

### `sec:eval_results` (lines ~187, ~189, ~191, ~193, ~195)

- SUS per-participant + mean + dispersion -> **Section 1**.
- NASA-TLX per subscale -> **Section 2** (six-subscale x six-task matrix,
  subscale profile, grand aggregate, ranking).
- Apex UX item-by-item + median, no composite, framework-scoped items (E2,
  E3) separated, deployment-gate cross-read -> **Section 3** (cross-read
  no longer applies, see above).
- Interview findings as themes -> not this task's data; `sec:interviews` is
  already fully written prose per Section 0's audit.
- Analytical assessment table -> not this task's data, see `sec:analytical`
  above.

### `sec:threats` (lines ~201, ~203)

> "...the author's dual role... the small and non-random sample... the
> single organisational setting; the short observation window... the fact
> that the instruments measure perception rather than delivered software
> quality..."
> "...no observational evidence at all: no measured completion rate, no
> time on task..., no assist or error counts, and no independent check on
> whether a participant understood the deployment refusal in task eight...
> the interview analysis rests on written notes rather than transcripts..."

Data this document can supply as concrete instances of these threats
(not the threats prose itself):

- Non-random/convenience sample, recruited through professional
  connections: **Section 4** demographics show the actual composition -
  6 students, 4 developers, 1 AI engineer, 1 hairdressing-business
  official, 1 network technician (2 of 13 with zero software background).
- Dual role / author-authored instruments: the `ai_language` and
  `github-context.md` staleness bugs in **Section 5** were found by the
  same person who designed the study, using the same demo project across
  every participant - a concrete instance of the single-organisational-
  setting / non-independence-of-observer threat, not merely an abstract
  one.
- "No independent check on deployment-refusal comprehension": literally
  true and sharper than the original threat text realises - **Section 0's
  note and Section 3's UX section** establish that the task the check was
  built for (Task 8 refusal) was redesigned away 2026-08-30, so the gap is
  not just "no observer check" but "no guaranteed trigger for the
  comprehension item at all" for any of the 13 participants.
- P10's consent-form-language / preferred-language mismatch and P9's
  preferred-language / actual-forms-used mismatch (**Section 4**) are
  concrete data-collection artefacts of an unmoderated, self-administered
  design - worth citing as an instance of "perception self-report, no
  observer" rather than a threat that stayed hypothetical.
- No completion/time/assist/error data: confirmed true - `observer-sheet.md`
  was never administered (moderated arm dropped 2026-08-17, per
  `EVALUATION-PLAN.md`); the only timing signal in the raw data is the
  form-submission timestamp column visible in every sheet referenced in
  Sections 1, 2 and 3, which the chapter's own todo already correctly says
  cannot distinguish a hard task from an interruption.

### `sec:eval_discussion` + `sec:eval_rq_answers` (lines ~209, ~214)

> "Synthesise across instruments. Where they agree, say so; where they
> disagree... treat the disagreement as a finding..."
> "Answer DRQ1-DRQ4... DRQ4 is answered from SUS, NASA-TLX, the Apex UX
> questionnaire, and the demonstration."

Not this task's synthesis to write, but the raw material for a
cross-instrument read is now fully assembled:

- SUS all-13 mean 56.73 (grade D) vs. UX questionnaire's own items on
  trust/control/reversibility trending toward agree (C2 median 5, C4
  median 5, B3 median 5) - a case where a below-average standardised
  usability score sits alongside above-neutral custom-instrument answers
  on specific control-related items, for the writing agent to reconcile or
  present as a genuine disagreement.
- NASA-TLX's per-task ranking (Design and Packs highest workload, Export
  lowest, Section 2) can be read against UX D1's relatively low median (3,
  the lowest closed-item median in the whole instrument - "told clearly
  what had happened when something went wrong") - both point at
  error/feedback surfacing as a comparatively weak area independent of
  which instrument is asked.
- The Phase-5-related product bugs in Section 5 (stale GitHub context
  trusted at "High Confidence", found live and not fixed during the study)
  sit directly under UX item D1 (median 3, the weakest D-block item) and
  under the pre-registered TLX prediction that Task 8 would be only
  "moderate throughout" (Section 2) - actual Task 8 Performance subscale
  was the least-perfect-rated of any task (mean 21.5, Section 2's ranking
  table), which is one instrument-and-incident-log agreement the writing
  agent can state directly rather than infer.

---

Status: COMPLETE. All sections filled; no remaining `[PENDING]` markers.
Every numeric section (1-4) was either verified against the previous run's
already-correct work or freshly computed and cross-checked (UX
questionnaire data independently verified twice: once via direct
single-column grid reads with the highlight-box method, once via the PT
sheet's own leftover per-row concatenation formula, recovered via undo and
deleted after use per the instrument's scratch-formula-cleanup instruction).
