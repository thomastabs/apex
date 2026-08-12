# Raw NASA-TLX - as administered for Apex

Source instrument: Hart and Staveland (1988); Raw TLX variant discussed in Hart
(2006). Six subscales.

**Variant used: Raw TLX (unweighted).** The 15 pairwise weighting comparisons
are **not** administered. Justification is in `EVALUATION-PLAN.md` section 4 and
must appear in Chapter 9 - reporting an unweighted score as plain "NASA-TLX" is
the error to avoid. Always write "Raw TLX".

## Administration: per task, not per session

**Decision: Raw TLX is administered once after each marked task**, immediately,
before the participant reads the next task. Six administrations per participant
(script tasks 3, 4, 6, 7, 8, 9).

This is the instrument's intended use. NASA-TLX is a *task* load index; a single
end-of-session administration is the compromise, not the standard. Three
consequences, all favourable:

1. **Workload profile per phase.** The primary result becomes a matrix of six
   subscales by six tasks, not one flat score. "Phase 2 design carries the
   highest mental demand while Phase 5 carries the highest frustration" is a
   claim about *where in the framework* the burden sits, which is what this
   thesis is actually arguing about. A single aggregate cannot say that.
2. **No recall decay.** Each rating is taken within a minute of the work it
   describes.
3. **More data points.** Participants x 6 tasks, so the workload analysis is not
   hostage to the same small N as SUS.

Cost: roughly 90 seconds per administration, about 9 minutes across the session,
plus the interruption. Accepted.

**Frame of reference given to the participant:** "the task you have just
completed", named explicitly. The form's first question is which task the
responses refer to; without it the whole matrix is unrecoverable.

**Note the trade-off honestly in Chapter 9:** repeated administration invites
anchoring, where later ratings drift toward earlier ones, and fatigue on the
last one or two tasks. Neither is avoidable here. State them in
`\Cref{sec:threats}` alongside the benefits above.

---

## Instructions shown to the participant (EN)

> Which task are you answering about? `(required, single choice)`
>
> Your participant code: `(required)`
>
> We are interested in the workload you experienced **during the task you have
> just completed**. Please rate each of the six aspects below by marking a point
> on the line. Read each description before answering. Note that the scale for
> Performance runs in the opposite direction to the others.

Each scale is a line divided into 20 intervals. Mark one interval. The mark is
converted to a score from 0 to 100 in steps of 5.

### Mental Demand
*How much mental and perceptual activity was required? Was it easy or
demanding, simple or complex, forgiving or exacting?*

`Very Low |--------------------| Very High`

### Physical Demand
*How much physical activity was required? Was the task easy or demanding, slow
or brisk, restful or laborious?*

`Very Low |--------------------| Very High`

### Temporal Demand
*How much time pressure did you feel due to the rate or pace at which the tasks
occurred? Was the pace slow and leisurely or rapid and frantic?*

`Very Low |--------------------| Very High`

### Performance
*How successful do you think you were in accomplishing the goals of this task?
How satisfied were you with your performance in accomplishing them?*

`Perfect |--------------------| Failure`

**Note the reversed anchors.** Good performance is at the left end.

### Effort
*How hard did you have to work, mentally and physically, to accomplish your
level of performance?*

`Very Low |--------------------| Very High`

### Frustration Level
*How insecure, discouraged, irritated, stressed and annoyed, versus secure,
gratified, content and relaxed, did you feel during this task?*

`Very Low |--------------------| Very High`

---

## Instruções apresentadas ao participante (PT)

> A que tarefa se refere esta resposta? `(obrigatório, escolha única)`
>
> O seu código de participante: `(obrigatório)`
>
> Interessa-nos a carga de trabalho que sentiu **durante a tarefa que acabou de
> realizar**. Classifique cada um dos seis aspectos abaixo marcando um ponto na
> linha. Leia cada descrição antes de responder. Note que a escala do Desempenho
> corre no sentido inverso das restantes.

### Exigência Mental
*Quanta actividade mental e perceptiva foi necessária? A tarefa foi fácil ou
exigente, simples ou complexa, tolerante ou rigorosa?*

`Muito Baixa |--------------------| Muito Alta`

### Exigência Física
*Quanta actividade física foi necessária? A tarefa foi fácil ou exigente, lenta
ou rápida, repousante ou trabalhosa?*

`Muito Baixa |--------------------| Muito Alta`

### Exigência Temporal
*Quanta pressão de tempo sentiu devido ao ritmo a que a tarefa decorreu? O
ritmo foi lento e tranquilo ou rápido e frenético?*

`Muito Baixa |--------------------| Muito Alta`

### Desempenho
*Em que medida acha que teve sucesso em atingir os objectivos desta tarefa? Quão
satisfeito ficou com o seu desempenho?*

`Perfeito |--------------------| Fracasso`

**Note as âncoras invertidas.** O bom desempenho está na extremidade esquerda.

### Esforço
*Quanto teve de trabalhar, mental e fisicamente, para alcançar o seu nível de
desempenho?*

`Muito Baixo |--------------------| Muito Alto`

### Nível de Frustração
*Quão inseguro, desencorajado, irritado, tenso e incomodado, por oposição a
seguro, satisfeito, contente e tranquilo, se sentiu durante esta tarefa?*

`Muito Baixo |--------------------| Muito Alto`

---

## Building this as an online form

The script is unmoderated, so the TLX is a web form the participant opens six
times. Two things must be got right or the data is unusable.

### 1. Which task is this for

**First question on the form, required, single choice:** Task 3, Task 4, Task 6,
Task 7, Task 8, Task 9, with the task titles spelled out. Second question:
participant code, required, short answer.

Without both, six submissions per participant cannot be reassembled into a
matrix, and one participant forgetting their code loses their whole row.

### 2. The response scale is a real deviation from the instrument

The published NASA-TLX scale is a line divided into **20 intervals**, scored
0-100 in steps of 5.

**Google Forms cannot reproduce this.** Its linear scale tops out at 10 points
and it has no slider. The options considered:

| Option | Fidelity | Verdict |
|---|---|---|
| A form tool with a real 0-100 slider | faithful | best if one is available |
| Google Forms linear scale 0-10, multiplied by 10 | coarse but monotonic | acceptable, **must be documented** |
| Google Forms short answer, number 0-100 validated as a multiple of 5 | faithful values | high error rate, participants type freely |
| Google Forms grid with 21 columns | faithful | unusable on a phone, do not |

**DECIDED 2026-08-12: linear scale 0 to 10, multiplied by ten at analysis time.**
Google Forms is the platform that follows from it. **Frozen** - the scale cannot
change once the first participant has run, because a mid-study change would make
the earlier and later responses two different instruments.

The disclosure sentence for Chapter 9 is drafted in `EVALUATION-PLAN.md`
section 6 and covers this together with the item reordering below. In short: a
0-10 scale was used in place of the 20-interval line and rescaled to 0-100; this
reduces the resolution of the instrument and the values are not directly
comparable to studies using the original scale.

Do not silently rescale and report it as NASA-TLX. That is the sort of quiet
deviation that, once noticed in a viva, casts doubt on everything else.

**Consequence for analysis:** every response is a multiple of ten, so the
subscale means are coarser than the instrument's own granularity. Report medians
and ranges alongside means, and do not read a difference of a few points between
two cells of the matrix as meaningful when the smallest step a participant could
express was ten.

### 3. Item order as administered

**Decision: Performance is administered last, not fourth.** The published order
is Mental, Physical, Temporal, Performance, Effort, Frustration; the forms built
from `FORMS-BUILD-SHEET.md` use Mental, Physical, Temporal, Effort, Frustration,
Performance.

The reason is the reversed anchors. Meeting a backwards scale in the middle of
five forward ones, with nobody present to explain it, is the most likely way an
unmoderated participant inverts a sixth of the data set. Placing it last means
the reversal is encountered once, at the end, immediately after its own warning.

Scoring is unaffected - Raw TLX is an unweighted mean, so order does not enter
the arithmetic. It is still a departure from the instrument as published, so
**state it in Chapter 9 in the same sentence as the response-scale deviation.**
Reordering is a much smaller deviation than rescaling, but the two should be
disclosed together rather than one being mentioned and the other not.

### 4. Anchors on every item

Repeat the subscale description and both anchor words on every question. In an
unmoderated study nobody is present to explain that Performance runs backwards,
and a participant who misses that inverts one sixth of the data set.

Put the Performance item's reversed anchors in bold, and consider placing it
last rather than fourth so the reversal is not encountered mid-flow.

---

## Scoring

1. Each mark converts to `0-100` in steps of 5 (interval index x 5). If the
   0-10 form scale was used, multiply the response by 10 and record the
   deviation.
2. **Performance is recorded as marked, on its own Perfect-to-Failure scale.**
   Do not silently invert it. If it is inverted to make the aggregate
   directionally consistent, state that in the caption, every time.
3. Raw TLX overall score = the unweighted arithmetic mean of the six subscale
   scores.

## Reporting

**The six-subscale profile is the primary result.** The single aggregate is
secondary and reported after it, never instead of it.

With per-task administration the primary artefact is a **six-by-six matrix**:
six subscales across six tasks, each cell a mean across participants.

Report as:

- the subscale-by-task matrix as a heatmap or grouped bar chart. This is the
  headline figure of the evaluation chapter
- per-task aggregate Raw TLX, so the phases can be ranked by total workload
- per-subscale profile collapsed across tasks, for the overall claim
- a table of per-participant, per-task scores in Appendix B so the figures can
  be recomputed
- median and range, not only means, given the sample size

The matrix is what justifies the per-task cost. If Chapter 9 ends up reporting
only the collapsed profile, the six administrations bought nothing and a single
end-of-session TLX would have been the right call.

### What to look for

The interesting hypothesis for this thesis, stated in advance so that finding it
counts and not finding it also counts:

> Apex plausibly **raises Mental Demand** - there is more structure, more
> vocabulary and more explicit state to hold in mind than in unstructured
> AI-assisted work - while **lowering Effort and Frustration**, because there is
> less blank-page work and fewer dead ends.

If that profile appears, it is a precise, defensible claim about *where* the
framework moves the practitioner's burden, and it is much more interesting than
a low aggregate. If the profile does not appear, report the actual profile and
say the hypothesis was not supported. Both outcomes are publishable; only
silently reporting the aggregate is not.

Physical Demand will almost certainly be near-floor for a desktop tool. Report
it anyway - dropping a subscale because it is uninteresting is a deviation from
the instrument.

**Per-task predictions, also stated in advance:**

| Task | Prediction |
|---|---|
| 3, Phase 1 Gherkin | highest Mental Demand - the participant has to express a requirement precisely for the first time |
| 4, Phase 2 design | high Mental Demand, high Effort - most content to review, most decisions to accept or reject |
| 6, Phase 3 packs | moderate throughout - largely a review task |
| 7, Phase 4 QA | low across the board |
| 8, Phase 5 gate | **highest Frustration, lowest Performance** - this task is designed to be refused |
| 9, Export | lowest overall |

Task 8's Frustration score is the number to watch. A refusal that the interface
explains well should raise Frustration only modestly; a refusal that reads as a
bug will spike it. Cross-read that score against UX item A4 and the open
question about the same task.

Writing these predictions down before the study is what allows a mismatch to be
reported as a finding rather than rationalised afterwards.

## Practical note

If the study is run moderated and in person, print the original 20-interval
line and use it - it is the instrument, and it costs nothing. The online-form
compromise above exists only because the unmoderated arm cannot use paper. Where
both arms run, note in Chapter 9 that the two arms used different response
scales, and do not pool them into a single mean without saying so.
