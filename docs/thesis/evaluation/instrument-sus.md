# System Usability Scale - as administered for Apex

Source instrument: Brooke (1996). Free to use, requires acknowledgement of the
source. Ten items, five-point scale, alternating positive and negative polarity.

**Adaptation:** the only change from the standard wording is substituting
"Apex" for "the system". No item is reworded, reordered, added or dropped -
doing any of that invalidates the comparability that is the entire point of
using SUS. Item 8's wording is given in Brooke's original form
("cumbersome"); the widely used "awkward" variant is noted where relevant but
not used here, so that the reported score stays comparable to the standard
corpus.

Administer **after** Raw TLX, self-completed, unwatched.

---

## Instructions shown to the participant (EN)

> Please answer each statement about **Apex**, the tool you have just used, by
> marking one box. There are no right answers. Record your immediate reaction
> rather than thinking for a long time about each one. If you feel you cannot
> answer an item, mark the centre point.

Scale: `1 = Strongly disagree` ... `5 = Strongly agree`

| # | Item | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | I think that I would like to use Apex frequently. | | | | | |
| 2 | I found Apex unnecessarily complex. | | | | | |
| 3 | I thought Apex was easy to use. | | | | | |
| 4 | I think that I would need the support of a technical person to be able to use Apex. | | | | | |
| 5 | I found the various functions in Apex were well integrated. | | | | | |
| 6 | I thought there was too much inconsistency in Apex. | | | | | |
| 7 | I would imagine that most people would learn to use Apex very quickly. | | | | | |
| 8 | I found Apex very cumbersome to use. | | | | | |
| 9 | I felt very confident using Apex. | | | | | |
| 10 | I needed to learn a lot of things before I could get going with Apex. | | | | | |

---

## Versão portuguesa validada (PT)

**Source of record:** Martins, A. I., Rosa, A. F., Queirós, A., Silva, A., and
Rocha, N. P. (2015). *European Portuguese validation of the System Usability
Scale (SUS).* Procedia Computer Science, 67, 293-300.
DOI `10.1016/j.procs.2015.09.273`. Open access, CC BY-NC-ND.

Presented at DSAI 2015. The ten items below are their Table 1, transcribed
verbatim. This is the instrument; the provisional translation that previously
sat here has been discarded.

Note their generic referent is **"produto"**, not "sistema".

### Published items, verbatim

| # | Original item | Item correspondente em português |
|---|---|---|
| 1 | I think that I would like to use this system frequently. | Acho que gostaria de utilizar este produto com frequência. |
| 2 | I found the system unnecessarily complex. | Considerei o produto mais complexo do que necessário. |
| 3 | I thought the system was easy to use. | Achei o produto fácil de utilizar. |
| 4 | I think that I would need the support of a technical person to be able to use this system. | Acho que necessitaria de ajuda de um técnico para conseguir utilizar este produto. |
| 5 | I found the various functions in this system were well integrated. | Considerei que as várias funcionalidades deste produto estavam bem integradas. |
| 6 | I thought there was too much inconsistency in this system. | Achei que este produto tinha muitas inconsistências. |
| 7 | I would imagine that most people would learn to use this system very quickly. | Suponho que a maioria das pessoas aprenderia a utilizar rapidamente este produto. |
| 8 | I found the system very cumbersome to use. | Considerei o produto muito complicado de utilizar. |
| 9 | I felt very confident using the system. | Senti-me muito confiante a utilizar este produto. |
| 10 | I needed to learn a lot of things before I could get going with this system. | Tive que aprender muito antes de conseguir lidar com este produto. |

### As administered - substituting the system name

The only change is the referent: `este produto` / `o produto` becomes `o Apex`.
Nothing else moves. Same order, same polarity, same words. Declare the
substitution in one sentence in Chapter 9.

Escala: `1 = Discordo totalmente` ... `5 = Concordo totalmente`

| # | Afirmação | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | Acho que gostaria de utilizar o Apex com frequência. | | | | | |
| 2 | Considerei o Apex mais complexo do que necessário. | | | | | |
| 3 | Achei o Apex fácil de utilizar. | | | | | |
| 4 | Acho que necessitaria de ajuda de um técnico para conseguir utilizar o Apex. | | | | | |
| 5 | Considerei que as várias funcionalidades do Apex estavam bem integradas. | | | | | |
| 6 | Achei que o Apex tinha muitas inconsistências. | | | | | |
| 7 | Suponho que a maioria das pessoas aprenderia a utilizar rapidamente o Apex. | | | | | |
| 8 | Considerei o Apex muito complicado de utilizar. | | | | | |
| 9 | Senti-me muito confiante a utilizar o Apex. | | | | | |
| 10 | Tive que aprender muito antes de conseguir lidar com o Apex. | | | | | |

**Response anchors.** The paper does not print Portuguese anchor labels, only
that SUS is a five-point Likert scale of strength of agreement. `Discordo
totalmente` and `Concordo totalmente` are the conventional wording and are what
this study uses; say so rather than implying the anchors came from Martins et
al.

### What the validation actually established, and what it did not

State this in Chapter 9 **before** an examiner raises it. Citing a validated
instrument without knowing its reported limits is worse than using a translation
openly.

| Property | Reported |
|---|---|
| Semantic and content equivalence | established, pilot with 4 participants |
| Construct validity vs PSSUQ | r = 0.70, significant |
| Construct validity vs a general usability question | r = 0.48, p < 0.05 |
| Inter-rater reliability, ICC | **0.36, which the authors classify as weak** (CI 95%: 0.01 to 0.63) |
| Percentage of agreement | 76.67%, below the 80% they state as acceptable |

The authors' own conclusion, paraphrased: the Portuguese version can be used to
distinguish usable from non-usable applications, but the low ICC means they
intend to validate the all-positive variant of SUS and repeat the study with a
larger sample. They attribute the weak reliability to the alternating
positive/negative item polarity causing filling errors, and cite Sauro and Lewis
on the same problem.

Two consequences for this thesis:

1. **Do not overclaim.** Write "the European Portuguese version validated by
   Martins et al. (2015), whose authors report construct validity but weak
   inter-rater reliability (ICC = 0.36)". That sentence costs nothing and closes
   the line of attack completely.
2. **Their sample was drawn from the general community**, not software
   practitioners. The linguistic validation carries over; the reliability
   estimate was obtained in a different population from this study's. Worth one
   sentence in `\Cref{sec:threats}`.

Do **not** switch to the all-positive variant. It is not validated in European
Portuguese, and adopting an unvalidated variant to dodge a caveat about a
validated one is the wrong trade.

> **Instruções ao participante:** Responda a cada afirmação sobre o **Apex**, a
> ferramenta que acabou de utilizar, marcando uma opção. Não há respostas
> certas. Registe a sua reacção imediata em vez de pensar muito tempo em cada
> uma. Se sentir que não consegue responder, marque o ponto central.

---

## Scoring

For each participant:

1. **Odd items (1, 3, 5, 7, 9):** contribution = `response - 1`
2. **Even items (2, 4, 6, 8, 10):** contribution = `5 - response`
3. Sum the ten contributions. Range 0-40.
4. Multiply by 2.5. **Final range 0-100.**

Worked example - a participant answering `4,2,4,2,4,2,4,2,4,2`:
odd contributions `3,3,3,3,3` = 15; even contributions `3,3,3,3,3` = 15;
sum 30; SUS = **75**.

### The score is not a percentage

Say this explicitly in Chapter 9. A SUS of 75 does not mean "75% usable" and
does not sit at the 75th percentile. It is the single most common misreading of
the instrument and an examiner may well probe it.

### Interpretation

Report against two published scales rather than a bare number.

**Bangor et al. (2009) adjective ratings** - approximate mean SUS per adjective:

| Adjective | approx. SUS |
|---|---|
| Worst imaginable | 12.5 |
| Awful | 20.3 |
| Poor | 35.7 |
| OK | 50.9 |
| Good | 71.4 |
| Excellent | 85.5 |
| Best imaginable | 90.9 |

Note that "OK" sits near 51, not near 68. A score in the fifties is not
acceptable-but-fine; it is mediocre.

**Sauro and Lewis curved grading scale (CGS)** - derived from 241 studies and
surveys, published in Sauro and Lewis (2016), *Quantifying the User Experience*,
2nd ed., Morgan Kaufmann.

| Grade | SUS range | Percentile range |
|---|---|---|
| A+ | 84.1 - 100 | 96 - 100 |
| A | 80.8 - 84.0 | 90 - 95 |
| A- | 78.9 - 80.7 | 85 - 89 |
| B+ | 77.2 - 78.8 | 80 - 84 |
| B | 74.1 - 77.1 | 70 - 79 |
| B- | 72.6 - 74.0 | 65 - 69 |
| C+ | 71.1 - 72.5 | 60 - 64 |
| C | 65.0 - 71.0 | 41 - 59 |
| C- | 62.7 - 64.9 | 35 - 40 |
| D | 51.7 - 62.6 | 15 - 34 |
| F | 0 - 51.6 | 0 - 14 |

The mean SUS across the published corpus is approximately 68, which is why 68
sits inside grade C, at the 50th percentile. The scale is a curve fitted to that
corpus, not a linear mapping: 80.8 is grade A because it is in the top 10 per
cent of scores, not because 80 is "80 per cent".

### Verification status of these boundaries

**Checked 2026-08-12. Every boundary above is confirmed.** Two independent
reproductions of the table were compared against each other and against the
values previously recorded here; all three agree to the decimal:

1. Sauro, J., *5 Ways to Interpret a SUS Score*, MeasuringU. Sauro is a
   co-author of the scale, so this is the closest thing to the source that is
   openly available.
2. *How to use the System Usability Scale (SUS) in 2021*, Chuniversiteit, which
   reproduces the table and attributes it to the 2016 book.

Two details worth carrying into the thesis:

- **The percentile column is the honest way to report a grade.** "B (70th to
  79th percentile of 241 published studies)" is defensible in a way that a bare
  letter is not.
- MeasuringU splits F into `25.1 - 51.6` (percentile 2 - 14) and `0 - 25`
  (percentile 0 - 1.9). The split changes nothing for interpretation; the single
  F row above is the form the table is usually reproduced in.

**Still unverified: the page number inside the book.** Secondary sources point
at around p. 204 of the 2nd edition but this was not confirmed against the
printed text, so cite the book without a page locator, or check a physical or
library copy before adding one. The band values themselves need no further
checking.

### Sub-scales

Lewis and Sauro (2009) split SUS into Usability (items 1-3, 5-9) and Learnability
(items 4 and 10). Reporting the Learnability sub-scale separately is worthwhile
here, because Apex's phase-gate model is exactly the kind of thing that scores
well on usability and badly on learnability, and that split would be a genuine
finding rather than noise.

### Reporting

With N around 12, report:

- every individual score, in a table, anonymised as P1..Pn
- mean, median, standard deviation, minimum, maximum
- a dot plot of the distribution
- the adjective band and letter grade of the mean
- the Usability and Learnability sub-scale means, separately

Do **not** run t-tests, confidence intervals or significance claims on a sample
this size in a single setting. Descriptive reporting is defensible; inferential
reporting on N=12 non-random participants is not.
