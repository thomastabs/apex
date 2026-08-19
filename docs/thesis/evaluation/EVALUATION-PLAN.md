# Apex evaluation plan - SUS, NASA-TLX and UI/UX instruments

Working document. Defines the empirical study that feeds Chapter 9 (Evaluation)
and Appendix B. Written **before** running the study on purpose: pre-registering
the task set, the measures and the analysis is what separates a demonstration
from an anecdote, and it is the single cheapest defence against "the
observations were selected after the fact to suit the artefact".

Status: **draft, not yet executed.** Nothing here has been administered.

---

## 1. What each instrument is allowed to claim

This is the sharpest attack surface in the whole thesis, so it is stated first
and never softened later.

| Instrument | Artefact evaluated | Claim it supports | Claim it does NOT support |
|---|---|---|---|
| SUS | Apex (instantiation) | Perceived usability of the tool | That the framework is sound |
| NASA-TLX | Apex (instantiation) | Perceived workload while operating the tool | Delivered software quality |
| Apex UX questionnaire (custom) | Apex (instantiation) | Where specifically the UI helps or obstructs; AI trust calibration | Anything generalisable - unvalidated instrument, descriptive only |
| Task-performance measures | Apex (instantiation) | Objective completion, time, assists, errors | Long-term productivity |
| Practitioner interviews | Framework | Practicality and perceived value in real workflows | Usability of the tool |
| Agile/Scrum expert interviews | Framework | Alignment with and departure from established methodology | Adoption outcomes |
| Analytical assessment | Framework | Degree to which stated design criteria are met | Independent validation |

A good SUS score for Apex is **not** evidence that the framework works. Chapter 9
already says this in `\Cref{tab:eval_instruments}`; keep it in the running text
too.

**Objective measures are included deliberately.** Chapter 9's threats section
already concedes that "the instruments measure perception rather than delivered
software quality". Adding completion rate, time on task and assist count costs
nothing during the session and blunts that threat instead of merely admitting it.

---

## 2. Study design

- **Type:** ex post, naturalistic, single-setting, within-subject (no control
  group). Pries-Heje et al. classification already cited in Chapter 9.
- **Unit of analysis:** one practitioner completing a fixed task set in Apex on a
  real project.
- **Setting:** the partner organisation already using Apex (the same one driving
  the Plane.so migration), plus, if the sample is short, MEIC students or
  practitioners with a development background.
- **Session length:** about 60 minutes, self-paced.
- **No control condition.** There is no baseline "same task without Apex" arm,
  because the task set is defined in terms of Apex's own artefacts. This is a
  real limitation and belongs in `\Cref{sec:threats}`, not hidden.

### One arm: unmoderated, self-administered

**Decided 2026-08-17. The study runs unmoderated only.** A second, moderated
arm of 3-4 observed sessions was designed and is now dropped. Every participant
receives the same self-administered task script and the same four online forms;
there is no facilitator, no observation, and nothing is screen or audio
recorded.

| | **As run** |
|---|---|
| Target N | 12, see Participants below |
| Format | Self-administered task script, remote, participant's own time |
| Materials | `task-script.md` plus four online forms |
| Yields | SUS, per-task Raw TLX, UX questionnaire, self-reported completion, form timestamps |
| Does not yield | think-aloud, assist counts, measured time on task, error counts, an observer-scored Task 8 comprehension score |
| Facilitator bias | none, removed structurally |

**Why the moderated arm was dropped.** Three reasons, in order of weight.

1. **Nothing is being recorded.** Screen and audio recording was ruled out for
   the whole study. A moderated session without a recording yields notes
   handwritten by a facilitator who is simultaneously facilitating, which is the
   weakest possible form of the one thing the arm existed to provide. The full
   scheduling cost buys a degraded instrument.
2. **The author designed both artefacts.** Running the sessions himself
   reintroduces exactly the conflict the unmoderated design removes, and the
   mitigations available (fixed script, logged assists, self-administered
   questionnaires) reduce it without removing it. See "Researcher role" below.
3. **The arms were additive, not overlapping.** Nobody can complete the same
   nine tasks twice, so 12 unmoderated plus 3-4 moderated meant recruiting
   15-16 people. Recruitment runs through the supervisor's professional
   connections rather than a funnel this project controls, and a stable SUS
   mean is the higher-value use of every participant.

**What this costs, and where it must be admitted.** The chapter can make no
observational claim. Specifically it loses measured completion rates, median
time on task, assist counts, error counts, and the observer-scored 2/1/0 Task 8
comprehension judgement. Time on task degrades to a form-timestamp proxy that is
indicative only, since an unmoderated participant can walk away mid-task. State
all of this in `\Cref{sec:threats}` as a design consequence, not as an
oversight, and do not let any sentence in the results imply someone watched.

**Partial recovery.** The qualitative channel is not lost with the arm: the
interviews are a separate session and are the instrument assigned to the
*framework* rather than to the tool. Move the observational probes into the
practitioner interview guide as retrospective questions - where the participant
got stuck, and what they believed happened at task 8. This is recall rather than
observation, and must be reported as such.

### Per-task NASA-TLX

Raw TLX is administered **after each marked task**, not once at the end. Six
administrations per participant, on script tasks 3, 4, 6, 7, 8 and 9. Rationale,
costs and the anchoring/fatigue trade-off are in `instrument-nasa-tlx.md`.

The primary result becomes a six-subscale by six-task matrix, which is what lets
the chapter say *where in the framework* the workload sits rather than only how
much of it there is.

### Session timetable

Self-paced, roughly 60 minutes:

| Approx. min | Activity |
|---|---|
| 0-5 | Consent form and demographics, online |
| 5-10 | Read "Before You Begin", open the three form links |
| 10-55 | **Tasks 1-9**, with the TLX form after tasks 3, 4, 6, 7, 8, 9 |
| 55-58 | SUS form |
| 58-63 | Apex UX form and the three open questions |

Interviews are a **separate** session, 30-45 minutes. Running one straight after
an hour of task work produces fatigue answers.

Order matters at the end: SUS **before** the UX questionnaire. SUS is the
standardised, comparable instrument and should not be answered after 18 bespoke
items have primed the participant about specific features.

### Participants

- **Target N = 12** for SUS. Twelve is the point where SUS is generally treated
  as yielding a stable mean; below that, report the distribution and individual
  scores and make no inferential claim.
- **Realistic N is likely lower.** If it is, say so plainly, report every
  individual score, plot the distribution, and drop all inferential statistics.
  A defensible small-N descriptive report beats an indefensible t-test.
- Interviews: 5-8 practitioners plus 2-3 Agile/Scrum experts. Interviews saturate
  much earlier than questionnaires; the two do not need the same N.
- Recruitment, consent, anonymisation and data handling: see
  `consent-and-briefing.md`.

### Researcher role

The author designed both artefacts. This is a conflict and must be named in
`\Cref{sec:demo_design}` and again in `\Cref{sec:threats}`.

**The unmoderated design removes it structurally.** No facilitator is present,
the script is fixed text, and the forms are submitted without the author
watching. Nothing the author does during a session can steer it, because he is
not in it. This is the strongest single argument for the design and it should be
stated in the chapter as a deliberate choice rather than as a convenience - it
is also the second reason the moderated arm was dropped rather than merely
descoped.

The conflict is not eliminated everywhere, and the residue must still be named:
the author wrote the task set, the wording of the script and the 18 bespoke UX
items, and conducts the interviews himself. Mitigations that do apply:

1. Fixed script text, identical for every participant, with no live commentary.
2. The standardised instruments (SUS, Raw TLX) are unmodified and comparable
   against published data, so they are not the author's own yardstick.
3. Participants are told explicitly that the tool is being tested, not them, and
   that negative answers are the useful ones.
4. Interviews follow a written guide, and disconfirming evidence is reported
   with the same prominence as confirming evidence.

---

## 3. Task set

Participant-facing wording: `task-script.md`. What each task is testing, success
criteria, expected times and the environment reset: `task-set.md`.

Nine tasks, identical for every participant, roughly 45 minutes of tool time.
Six of them carry a Raw TLX form.

| # | Task | TLX | Apex surface exercised |
|---|---|---|---|
| 1 | Sign in and open the project | | Auth, PM tool selector, project picker |
| 2 | Connect the project to GitHub | | Sidebar, PAT entry, connected state |
| 3 | Requirement to locked Gherkin | yes | Phase 1, clarifying Q&A, assumptions, lock |
| 4 | Produce and lock the design | yes | Phase 2, technical + visual + runtime spec |
| 5 | Resume a previous session | | Session store, active-project persistence |
| 6 | Break the work into implementation tasks | yes | Phase 3, packs, task DAG |
| 7 | Test plan and QA sign-off | yes | Phase 4 |
| 8 | Deploy a **different**, un-QA'd feature | yes | Phase 5 deployment gate |
| 9 | Export what the tool produced | yes | Export and download paths |

Optional and excluded from all measures: Phase 6 drift check, traceability
explorer, Autopilot.

**Task 8 is designed to be refused.** The gate blocks a story that is not
`qa_passed`. Whether the participant understands *why* is the single most
informative observation available, and it is the one place the UI has to explain
a refusal rather than celebrate a success. It is captured by the open text on the
TLX form and by UX item A4. There is no observer-scored 2/1/0 judgement, because
there is no observer; the open text is the whole of the evidence and is analysed
as such.

**Task 5 is a real regression test, not filler.** Session state lives in
`sessionStorage` and the active-project-survives-a-fresh-session bug was fixed
only recently. Putting a tab close in the middle of the script exercises exactly
that path with a real user, which no automated test does.

---

## 4. Instruments

| File | Contents |
|---|---|
| `task-script.md` | **Participant-facing document**, EN + PT. Hand this out. Format follows the LiteraFlow task script: numbered tasks, `[TLX]` markers, reference screenshots, explicit stop instructions |
| `instrument-sus.md` | SUS, 10 items, EN + PT, scoring procedure, interpretation bands |
| `instrument-nasa-tlx.md` | Raw NASA-TLX, 6 subscales, EN + PT, subscale definitions as shown to participants |
| `instrument-apex-ux.md` | Custom 18-item Apex UX questionnaire + 3 open questions, EN + PT |
| `interview-guides.md` | Practitioner guide and Agile/Scrum expert guide |
| `observer-sheet.md` | **Unused.** Per-task completion, time, assists, errors, critical incidents. Written for the moderated arm, which was dropped 2026-08-17. Kept for the record, not built or administered |
| `consent-and-briefing.md` | Informed consent and demographics form. Its facilitator briefing script and do-not-do list are unused for the same reason |

### Raw TLX, not weighted TLX

**Decision: use Raw TLX (unweighted).** Justification for the chapter:

- The weighted procedure adds 15 pairwise comparisons. Under per-task
  administration that is 15 comparisons **times six tasks**, or ninety per
  participant, which is not survivable in a 60-minute unmoderated session.
- The weights would have to be either collected once and applied to all six
  tasks, which assumes the participant's priorities do not change between
  phases, or collected six times, which nobody will complete. Neither is
  attractive; Raw TLX avoids the choice.
- Weights earn their cost when workload is compared **across conditions**, since
  their purpose is to make aggregates commensurable between raters. This
  evaluation has a single condition, so there is nothing for them to
  discriminate between. They would also put each participant's aggregate on a
  slightly different scale, which adds variance to an N of about twelve in
  exchange for nothing.
- **The literature does not favour weighting.** Reviewing 550 studies twenty
  years after the instrument's publication, Hart records that dropping the
  weighting is the most common modification made to the NASA-TLX, and that
  across the 29 studies directly comparing the two versions the Raw variant was
  found more sensitive, less sensitive, or equally sensitive depending on the
  study - no consistent advantage either way (Hart, 2006; `Hart:2006TLX`). This is the
  strongest of the four arguments, because it turns the decision from "the
  weighted version was impractical for us" into "the weighted version buys
  nothing reliable".
- What is given up: Raw aggregates are not directly comparable to weighted
  aggregates published elsewhere. This costs almost nothing here, since the
  six-subscale profile is the primary result and the subscale scores are
  identical under both versions - weighting affects only how they are combined.

**Written into Chapter 9 `sec:tlx` 2026-08-12**, replacing the writing prompt
that used to sit there. Report it as "Raw TLX" explicitly, never as "NASA-TLX"
unqualified.

### The custom questionnaire is not a validated instrument

SUS cannot see the things this thesis actually cares about: whether the
practitioner trusted the AI output, whether the phase gates read as guardrails
or as obstruction, whether reviewing generated work felt cheaper than writing
it. Those need bespoke items.

Consequence: report the 18 items **descriptively, item by item**, with no
composite score, no Cronbach's alpha, no factor claims. An unvalidated
instrument reported as a single number is exactly the sort of thing that gets
attacked in a viva. Reported as a per-item diverging bar chart it is honest and
genuinely informative.

### Language

Every instrument is written EN + PT because the app itself ships EN/PT parity
and the likely participants are Portuguese speakers.

**PT SUS: decided 2026-08-11 - use the validated European Portuguese version**
(Martins et al., 2015). Consequences:

- **Done 2026-08-11: the paper was obtained and the ten items are transcribed
  verbatim in `instrument-sus.md`.** F2-PT can be built.
- Chapter 9 states that the validated European Portuguese SUS was used, and
  cites Martins et al. alongside Brooke.
- Only the system name is substituted ("o Apex" for "o sistema"). Nothing else
  changes.
- The English SUS stays available for participants who choose EN. Report which
  language each participant used; do not pool EN and PT into one mean without
  saying so, since they are strictly two instruments.
- **State the instrument's reported limits in Chapter 9 pre-emptively.** Martins
  et al. report construct validity (r = 0.70 vs PSSUQ) but **weak inter-rater
  reliability, ICC = 0.36**, and 76.67% agreement against their own 80%
  threshold. They attribute it to the alternating item polarity. Their sample
  was also drawn from the general community, not software practitioners. All of
  this is in `instrument-sus.md`; one sentence in the text closes the line of
  attack that citing a validated instrument without knowing its limits would
  otherwise open.

---

## 5. Analysis

**SUS**
- Score per participant: odd items `response - 1`, even items `5 - response`,
  sum, multiply by 2.5. Range 0-100.
- **Not a percentage.** State this in the chapter; it is the most common
  misreading of SUS.
- Report: every individual score, mean, median, SD, min/max, and a dot plot.
- Interpret against the Bangor adjective ratings and the Sauro/Lewis curved
  grade, never against a bare "68 is average".

**Raw TLX**
- Primary artefact: the **six subscales by six tasks matrix**, as a heatmap.
  This is the headline figure of the chapter.
- Then per-task aggregate, so the phases can be ranked by total workload.
- Then the subscale profile collapsed across tasks, for the overall claim.
- The single grand aggregate last, if at all.
- Per-task predictions are written down in `instrument-nasa-tlx.md` in advance,
  including the specific prediction that task 8, the deployment gate, carries the
  highest Frustration and lowest Performance. A mismatch is then a finding rather
  than something rationalised afterwards.
- One arm, one response scale, so there is nothing to pool or separate. The
  scale actually used is disclosed regardless.

**Apex UX questionnaire**
- Per-item stacked/diverging bars. No composite.

**Task performance**
- Self-reported completion, plus form timestamps as a rough proxy for time per
  task. Treat the timestamps as indicative only; an unmoderated participant can
  walk away mid-task, and no one is watching to tell the difference between a
  hard task and a coffee break.
- No measured completion rate, assist count or error count. These were the
  moderated arm's contribution and the arm was dropped; do not report a
  self-reported completion figure using language that implies it was observed.
- Any task under 100% self-reported completion gets a written explanation, not
  just a number.

**Interviews**
- **Note-based, not recorded.** No interview is audio recorded, so there are no
  verbatim transcripts. The record is contemporaneous written notes, expanded
  into a full write-up immediately after each interview and before the next one
  - notes left overnight are reconstruction, not record.
- Thematic analysis, codebook developed from the first two write-ups then
  applied to the rest.
- Quotations may only be used where the exact words were written down at the
  time and marked as verbatim in the notes. Everything else is paraphrase and is
  presented as paraphrase.
- This is a real methodological cost and belongs in `\Cref{sec:threats}`:
  note-taking is selective in a way a transcript is not, and the person
  selecting is the person who designed the artefact.
- Report disconfirming evidence explicitly and with the same prominence.

**Triangulation**
- Cross-read the four sources. Where they disagree, the disagreement *is* the
  finding. Example worth watching for: a good SUS score alongside interview
  scepticism about process overhead - that pattern says the tool is pleasant and
  the method is heavy, which is a real and publishable result.

---

## 6. What still has to be decided

1. ~~RQ naming.~~ **CLOSED 2026-08-11.** The dissertation's own research
   questions were renamed `RQ-A`..`RQ-D` to **`DRQ1`..`DRQ4`** (Dissertation
   Research Question) across Chapters 1, 6, 7 and 9, so they no longer collide
   with the systematic review's `RQ1`-`RQ5`. `\Cref{tab:eval_instruments}` now
   maps instruments to DRQ1..DRQ4. Chapter 1 states the distinction explicitly
   and `DRQ` is in the acronym list.
2. ~~Validated PT SUS or own translation.~~ **CLOSED 2026-08-11: validated
   European Portuguese version (Martins et al., 2015), obtained and
   transcribed.** Nothing outstanding.
3. ~~N and recruitment.~~ **Resolved 2026-08-17: the supervisor is recruiting
   through his own professional connections.** The LinkedIn free-tier limit of
   five noted connection requests per month, raised 2026-08-12, is therefore
   moot - that channel is not the one being used. This is no longer a blocker
   on our side and no longer a work item; it is a waiting item.

   What it does **not** resolve, and what still has to be recorded once the
   participants are known: the achieved N, and the composition of the sample.
   A sample drawn entirely from one supervisor's network is a convenience
   sample, and if it turns out to be academic rather than industrial, or
   concentrated in one organisation, that bounds the external-validity claim.
   State the channel and the composition plainly in
   `\Cref{sec:eval_participants}` and carry the limit into
   `\Cref{sec:threats}`; do not let it read as a random sample of
   practitioners.
4. ~~Ethics approval.~~ **CLOSED 2026-08-15.** The supervisor confirmed that
   **informed consent is sufficient** - no submission to an ethics committee is
   required - and that **no standard IST consent template exists**, so the form
   in `consent-and-briefing.md` is the one that will be used. Written up in
   `\Cref{sec:eval_participants}` of Chapter 9, which now states the route, the
   four-item consent structure, the coding scheme and the retention rule.
5. ~~Arm split.~~ **CLOSED 2026-08-17: unmoderated only.** The moderated arm is
   dropped. Nothing is screen or audio recorded, including the interviews, which
   are analysed from contemporaneous notes instead of transcripts. The
   observational metrics are given up deliberately and are declared in
   `\Cref{sec:threats}`. Consequences are written through this document, the
   consent form, the forms build sheet and `observer-sheet.md`, which is now
   marked unused.
6. ~~TLX response scale.~~ **CLOSED 2026-08-12: linear scale 0 to 10, multiplied
   by 10 at analysis time**, in place of the published 20-interval line, which
   Google Forms cannot render. This is a real deviation from the instrument and
   is disclosed in Chapter 9 in the wording drafted below. Frozen - it cannot
   change once the first participant has run, and a mid-study change would make
   the earlier and later responses two different instruments.
7. ~~Form platform.~~ **CLOSED 2026-08-12: Google Forms**, which follows from
   decision 6. Six submissions per participant are handled by one prefilled link
   per task, so the participant never retypes the task name or their code by
   hand. Build details in `FORMS-BUILD-SHEET.md`.

### Drafted disclosure wording for Chapter 9

Two deviations from the published instrument, disclosed together in
`\Cref{sec:tlx}` rather than one being mentioned and the other not:

> Workload was collected on a linear scale from 0 to 10 rather than on the
> original twenty-interval line, and the responses were rescaled to the
> instrument's 0-100 range by multiplying by ten. The subscales were also
> presented in the order mental, physical and temporal demand, effort,
> frustration and performance, placing the reversed performance scale last
> rather than fourth. Neither change affects the unweighted Raw TLX
> computation, but the first reduces the resolution of the instrument, and the
> resulting values are therefore not directly comparable to studies using the
> original response scale.

The reason for each, for the surrounding prose: the response scale because no
form tool available for an unmoderated study reproduces a twenty-interval line,
and the item order because a reversed scale met in the middle of five forward
ones, with no facilitator present to explain it, is the most likely way a
participant inverts a sixth of the data set.
8. **Reference screenshots.** `task-script.md` has nine `[SCREENSHOT: ...]`
   slots that must be captured from a real seeded project. In an unmoderated
   study these are load-bearing, not decoration: without them a participant can
   spend ten minutes doing the wrong thing with nobody there to notice.

## 7. Bibliography entries - ADDED 2026-08-11

All seven are now in `Bibliography.bib` and cited from Chapter 9, and the build
was reverified afterwards. Kept here as the record of what was added and where
each is used. Page counts move with every chapter written, so they are recorded
in the commit messages rather than here; the current build is verified at each
change with 0 errors and 0 undefined references or citations.

| Key | Used for |
|---|---|
| `Brooke:1996SUS` | the SUS instrument itself |
| `Martins:2015SUS` | the validated European Portuguese version |
| `Bangor:2009SUS` | adjective rating bands |
| `Sauro:2016QUANT` | curved grading scale, small-sample reporting |
| `Lewis:2009SUS` | Usability and Learnability sub-scales |
| `Hart:1988TLX` | the NASA-TLX instrument itself |
| `Hart:2006TLX` | the Raw TLX variant, and the twenty-year review finding that it has no consistent sensitivity disadvantage against the weighted version |

```bibtex
@incollection{Brooke:1996SUS,
    Author = {Brooke, J.},
    Booktitle = {Usability Evaluation in Industry},
    Editor = {Jordan, P. W. and Thomas, B. and Weerdmeester, B. A. and McClelland, I. L.},
    Pages = {189--194},
    Publisher = {Taylor and Francis},
    Title = {{SUS: A `quick and dirty' usability scale}},
    Year = {1996}
}

@article{Bangor:2009SUS,
    Author = {Bangor, A. and Kortum, P. and Miller, J.},
    Journal = {Journal of Usability Studies},
    Number = {3},
    Pages = {114--123},
    Title = {{Determining what individual SUS scores mean: Adding an adjective rating scale}},
    Volume = {4},
    Year = {2009}
}

@book{Sauro:2016QUANT,
    Author = {Sauro, J. and Lewis, J. R.},
    Edition = {2nd},
    Publisher = {Morgan Kaufmann},
    Title = {{Quantifying the User Experience: Practical Statistics for User Research}},
    Year = {2016}
}

@incollection{Hart:1988TLX,
    Author = {Hart, S. G. and Staveland, L. E.},
    Booktitle = {Human Mental Workload},
    Editor = {Hancock, P. A. and Meshkati, N.},
    Pages = {139--183},
    Publisher = {North-Holland},
    Title = {{Development of NASA-TLX (Task Load Index): Results of empirical and theoretical research}},
    Year = {1988}
}

@inproceedings{Hart:2006TLX,
    Author = {Hart, S. G.},
    Booktitle = {Proceedings of the Human Factors and Ergonomics Society Annual Meeting},
    Pages = {904--908},
    Title = {{NASA-Task Load Index (NASA-TLX); 20 years later}},
    Volume = {50},
    Year = {2006}
}

@article{Lewis:2009SUS,
    Author = {Lewis, J. R. and Sauro, J.},
    Journal = {Human Centered Design, HCII 2009, LNCS},
    Pages = {94--103},
    Title = {{The factor structure of the System Usability Scale}},
    Volume = {5619},
    Year = {2009}
}
```

Required by the PT SUS decision:

```bibtex
@article{Martins:2015SUS,
    Author = {Martins, A. I. and Rosa, A. F. and Queir\'os, A. and Silva, A. and Rocha, N. P.},
    Journal = {Procedia Computer Science},
    Pages = {293--300},
    Title = {{European Portuguese Validation of the System Usability Scale (SUS)}},
    Doi = {10.1016/j.procs.2015.09.273},
    Url = {https://doi.org/10.1016/j.procs.2015.09.273},
    Volume = {67},
    Year = {2015}
}
```

Authors, volume, pages, year and DOI all verified against the published PDF.
Note the article title capitalises "validation" lowercase in the original.

## 8. Pre-flight checklist

- [x] RQ naming resolved: `DRQ1`..`DRQ4`, `tab:eval_instruments` updated
- [x] PT SUS decided: validated European Portuguese version, Martins et al. 2015
- [x] Martins et al. obtained; the ten PT items transcribed verbatim into
      `instrument-sus.md` and the provisional translation deleted
- [x] Bibliography entries added and the build reverified (0 errors, 0 undefined
      references or citations)
- [x] `sec:tlx` written 2026-08-12: Raw-variant justification including Hart's
      review finding, both instrument deviations disclosed together, anchoring
      and fatigue carried into `sec:threats`
- [x] Sauro and Lewis curved grading scale boundaries verified 2026-08-12
      against two independent reproductions, one of them by a co-author of the
      scale. Every band confirmed; percentile ranges added. See
      `instrument-sus.md`, "Verification status of these boundaries". The book's
      page locator is still unverified, so cite the book without one
- [x] Supervisor sign-off on the task set and the session length - **dropped
      2026-08-17 by decision.** The task set and the 60-minute budget are the
      researcher's own call and are not being put to the supervisor. The pilot
      run (step 12 of the forms build guide) is what validates the session
      length, and it now carries that job alone
- [x] Recruitment channel settled 2026-08-17: the supervisor recruits through
      his professional connections. Achieved N and sample composition are still
      unknown and must be reported honestly when they are
- [x] Ethics/consent route confirmed with the supervisor 2026-08-15: informed
      consent is sufficient, no committee submission, no IST template. The form
      in `consent-and-briefing.md` is final and is reproduced in Appendix B
- [x] Arm split closed 2026-08-17: unmoderated only, moderated arm dropped,
      nothing recorded, interviews analysed from notes. F0 loses its
      screen-recording consent item and `observer-sheet.md` is unused
- [x] TLX response scale decided 2026-08-12 - linear 0 to 10, rescaled by ten -
      and the disclosure wording drafted in section 6 above, covering both the
      scale and the reordered Performance subscale
- [ ] Eight forms built - consent/demographics, TLX, SUS and UX, each in EN and
      PT. Every string is paste-ready in `FORMS-BUILD-SHEET.md`; the acceptance
      check at the end of that file is the test-submit procedure, and it must be
      run in full before the pilot
- [ ] All nine reference screenshots captured from a seeded project
- [ ] `task-script.md` exported to the participant-facing format with all
      eighteen placeholder links filled in - nine per language: the tool link,
      six per-task prefilled TLX links, the SUS link and the UX link
- [ ] Participant code cards printed
- [ ] Pilot run with **one** participant, not counted in results, to time the
      script and catch broken instructions. Six TLX submissions must come back
      correctly labelled - if they do not, fix the form before anyone else runs
- [ ] A clean demo project seeded, including the un-QA'd `Export board to CSV`
      story that task 8 depends on, and a reset procedure that actually works
- [ ] Chapter 8 `sec:demo_design` written before the first real session
