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

## Instruções apresentadas ao participante (PT)

> **AVISO IMPORTANTE:** esta é uma tradução de trabalho, **não** é a versão
> validada em português europeu da SUS. Se for necessária uma versão validada,
> usar a redacção publicada tal como está e citá-la; não usar esta e apresentá-la
> como validada. Decisão pendente, ver `EVALUATION-PLAN.md` secção 6.

> Responda a cada afirmação sobre o **Apex**, a ferramenta que acabou de
> utilizar, marcando uma opção. Não há respostas certas. Registe a sua reacção
> imediata em vez de pensar muito tempo em cada uma. Se sentir que não consegue
> responder, marque o ponto central.

Escala: `1 = Discordo totalmente` ... `5 = Concordo totalmente`

| # | Afirmação | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | Penso que gostaria de utilizar o Apex com frequência. | | | | | |
| 2 | Considerei o Apex desnecessariamente complexo. | | | | | |
| 3 | Achei o Apex fácil de utilizar. | | | | | |
| 4 | Penso que precisaria do apoio de um técnico para conseguir utilizar o Apex. | | | | | |
| 5 | Considerei que as várias funcionalidades do Apex estavam bem integradas. | | | | | |
| 6 | Achei que havia demasiada inconsistência no Apex. | | | | | |
| 7 | Imagino que a maioria das pessoas aprenderia a utilizar o Apex muito rapidamente. | | | | | |
| 8 | Achei o Apex muito complicado de utilizar. | | | | | |
| 9 | Senti-me muito confiante a utilizar o Apex. | | | | | |
| 10 | Precisei de aprender muitas coisas antes de conseguir começar a usar o Apex. | | | | | |

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

**Sauro and Lewis curved grading scale** - roughly:

| Grade | SUS range |
|---|---|
| A+ | 84.1 and above |
| A | 80.8 - 84.0 |
| A- | 78.9 - 80.7 |
| B+ | 77.2 - 78.8 |
| B | 74.1 - 77.1 |
| B- | 72.6 - 74.0 |
| C+ | 71.1 - 72.5 |
| C | 65.0 - 71.0 |
| C- | 62.7 - 64.9 |
| D | 51.7 - 62.6 |
| F | below 51.7 |

The mean SUS across the published corpus is approximately 68, which is why 68
sits at grade C.

**Verify the exact band boundaries against the printed source before they go
into the thesis.** They are reproduced here from a secondary reading and are
close enough to plan with, not to publish unchecked.

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
