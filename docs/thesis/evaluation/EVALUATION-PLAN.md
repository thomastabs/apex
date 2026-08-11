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
- **Session length:** about 60 minutes unmoderated, about 80 minutes moderated.
- **No control condition.** There is no baseline "same task without Apex" arm,
  because the task set is defined in terms of Apex's own artefacts. This is a
  real limitation and belongs in `\Cref{sec:threats}`, not hidden.

### Two arms: unmoderated primary, moderated secondary

The study runs in two arms. This is a deliberate split, not indecision, and it
must be described as such in Chapter 9.

| | **Arm 1 - unmoderated** | **Arm 2 - moderated** |
|---|---|---|
| Target N | 10-12 | 3-4 |
| Format | Self-administered task script, remote, participant's own time | In person or screen-shared, facilitator present |
| Materials | `task-script.md` plus three online forms | Same script, plus `observer-sheet.md` |
| Yields | SUS, per-task Raw TLX, UX questionnaire, self-reported outcomes | All of the above **plus** think-aloud, assist counts, time on task, the Task 8 comprehension score |
| Does not yield | anything observational | N, realistically |
| Facilitator bias | none | present, mitigated only |

**Why both.** Arm 1 is the only realistic route to a usable SUS N, and it
removes the facilitator-bias problem entirely, which matters unusually much here
because the author designed both artefacts. Arm 2 supplies the observational
findings that a questionnaire cannot reach: where people actually got stuck,
what they said while stuck, and whether they understood the Task 8 refusal.
Neither arm alone produces a defensible chapter.

**Report the arms separately** wherever the instrument differs between them (see
the TLX response-scale note below). Pooling arms silently is the error to avoid.

### Per-task NASA-TLX

Raw TLX is administered **after each marked task**, not once at the end. Six
administrations per participant, on script tasks 3, 4, 6, 7, 8 and 9. Rationale,
costs and the anchoring/fatigue trade-off are in `instrument-nasa-tlx.md`.

The primary result becomes a six-subscale by six-task matrix, which is what lets
the chapter say *where in the framework* the workload sits rather than only how
much of it there is.

### Session timetable

Arm 1, self-paced, roughly 60 minutes:

| Approx. min | Activity |
|---|---|
| 0-5 | Consent form and demographics, online |
| 5-10 | Read "Before You Begin", open the three form links |
| 10-55 | **Tasks 1-9**, with the TLX form after tasks 3, 4, 6, 7, 8, 9 |
| 55-58 | SUS form |
| 58-63 | Apex UX form and the three open questions |

Arm 2 adds a 5-minute scripted orientation before the tasks and runs about 80
minutes, because think-aloud slows everything down.

Interviews are a **separate** session for both arms, 30-45 minutes. Running one
straight after an hour of task work produces fatigue answers.

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

**Arm 1 removes it structurally.** No facilitator is present, the script is
fixed text, and the forms are submitted without the author watching. This is the
strongest single argument for making the unmoderated arm the primary one, and it
should be stated in the chapter as a design choice rather than a convenience.

Arm 2 reintroduces the conflict, and there only mitigations are available:

1. The facilitator reads from a fixed script (in `consent-and-briefing.md`) and
   does not demonstrate, hint or defend the tool during tasks.
2. Assists are logged rather than silently given (observer sheet).
3. Questionnaires are self-administered, on the same forms as arm 1, without the
   facilitator watching.
4. Participants are told explicitly that the tool is being tested, not them, and
   that negative answers are the useful ones.

None of this removes the bias in arm 2. Say so, and report which findings come
from which arm.

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
a refusal rather than celebrate a success. In arm 1 it is captured by the open
text on the TLX form and by UX item A4; in arm 2 it is additionally scored 2/1/0
on the observer sheet.

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
| `observer-sheet.md` | Per-task completion, time, assists, errors, critical incidents |
| `consent-and-briefing.md` | Informed consent, facilitator script, demographics form |

### Raw TLX, not weighted TLX

**Decision: use Raw TLX (unweighted).** Justification for the chapter:

- The weighted procedure adds 15 pairwise comparisons. Under per-task
  administration that is 15 comparisons **times six tasks**, which is not
  survivable in a 60-minute unmoderated session.
- Raw TLX correlates highly with weighted TLX and is the dominant form in
  software-tool evaluation.
- The weights would have to be either collected once and applied to all six
  tasks, which assumes the participant's priorities do not change between
  phases, or collected six times, which nobody will complete. Neither is
  attractive; Raw TLX avoids the choice.

Chapter 9's `\todo` at `sec:tlx` says the justification matters more than the
choice. This is the justification. Report it as "Raw TLX" explicitly, never as
"NASA-TLX" unqualified.

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

- The ten Portuguese items currently in `instrument-sus.md` are a provisional
  translation and **must be replaced with the published wording verbatim**
  before form F2 is built. That file carries an action block saying so.
- Chapter 9 states that the validated European Portuguese SUS was used, and
  cites Martins et al. alongside Brooke.
- Only the system name is substituted ("o Apex" for "o sistema"). Nothing else
  changes.
- The English SUS stays available for participants who choose EN. Report which
  language each participant used; do not pool EN and PT into one mean without
  saying so, since they are strictly two instruments.

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
- If the two arms used different response scales, report them separately and do
  not pool them into one mean without saying so.

**Apex UX questionnaire**
- Per-item stacked/diverging bars. No composite.

**Task performance**
- Arm 1: self-reported completion, plus form timestamps as a rough proxy for
  time per task. Treat the timestamps as indicative only; an unmoderated
  participant can walk away mid-task.
- Arm 2: completion rate, median time on task, assist count, error count, and
  the task 8 comprehension score from the observer sheet.
- Any task under 100% completion gets a written explanation, not just a number.

**Interviews**
- Thematic analysis, codebook developed from the first two transcripts then
  applied to the rest.
- Report disconfirming evidence explicitly and with the same prominence.

**Triangulation**
- Cross-read the four sources. Where they disagree, the disagreement *is* the
  finding. Example worth watching for: a good SUS score alongside interview
  scepticism about process overhead - that pattern says the tool is pleasant and
  the method is heavy, which is a real and publishable result.

---

## 6. What still has to be decided

1. **RQ naming.** `\Cref{tab:eval_instruments}` maps instruments to RQ-A..RQ-D,
   which are still the unresolved assistant-written set colliding with the SLR's
   RQ1-RQ5. Every instrument mapping in this plan inherits that. Resolve the
   naming before Appendix B is typeset.
2. ~~Validated PT SUS or own translation.~~ **DECIDED 2026-08-11: validated
   European Portuguese version (Martins et al., 2015).** Remaining action, not a
   decision: obtain the paper and paste the ten items verbatim.
3. **N and recruitment.** Whether the partner organisation can supply 12, or
   whether the sample gets topped up with MEIC students, which changes the
   external-validity claim.
4. **Ethics approval.** Whether IST requires a formal submission for this study
   or whether informed consent plus anonymisation suffices. Ask the supervisor.
5. **Arm split.** The 10-12 unmoderated plus 3-4 moderated split above is a
   proposal. Confirm the moderated arm is worth the scheduling cost, or drop it
   and accept losing the observational findings.
6. **TLX response scale.** Google Forms cannot render the 20-interval line. The
   recommendation is a 0-10 scale rescaled to 0-100, documented as a deviation.
   Alternative: use a form tool with a real slider. Decide before the pilot, and
   never change it mid-study.
7. **Form platform.** Google Forms is assumed. Anything with a 0-100 slider and
   CSV export is better. Whatever is chosen must let a participant submit the
   TLX form six times without re-entering their code by hand each time, or use a
   prefilled link per task.
8. **Reference screenshots.** `task-script.md` has nine `[SCREENSHOT: ...]`
   slots that must be captured from a real seeded project. In an unmoderated
   study these are load-bearing, not decoration: without them a participant can
   spend ten minutes doing the wrong thing with nobody there to notice.

## 7. Missing bibliography entries

None of these exist in `Bibliography.bib` yet. All are required before Chapter 9
can cite the instruments.

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
    Url = {https://www.sciencedirect.com/science/article/pii/S1877050915031191},
    Volume = {67},
    Year = {2015}
}
```

Volume, pages and year confirmed against the publisher listing. Verify the DOI
and add it when the paper is obtained.

## 8. Pre-flight checklist

- [ ] RQ naming resolved, `tab:eval_instruments` updated
- [x] PT SUS decided: validated European Portuguese version, Martins et al. 2015
- [ ] Martins et al. obtained and the ten PT items pasted verbatim into
      `instrument-sus.md`, replacing the provisional translation
- [ ] Bibliography entries above added and the build reverified
- [ ] Supervisor sign-off on the task set and the session length
- [ ] Ethics/consent route confirmed with the supervisor
- [ ] Arm split confirmed, or the moderated arm dropped
- [ ] TLX response scale decided and the deviation wording drafted
- [ ] Three forms built: TLX (with the task selector and participant code first),
      SUS, UX. Test-submit each one and check the CSV export column names
- [ ] All nine reference screenshots captured from a seeded project
- [ ] `task-script.md` exported to the participant-facing format with the four
      placeholder links filled in
- [ ] Participant code cards printed
- [ ] Pilot run with **one** participant, not counted in results, to time the
      script and catch broken instructions. Six TLX submissions must come back
      correctly labelled - if they do not, fix the form before anyone else runs
- [ ] A clean demo project seeded, including the un-QA'd `Export board to CSV`
      story that task 8 depends on, and a reset procedure that actually works
- [ ] Chapter 8 `sec:demo_design` written before the first real session
