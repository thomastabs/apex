# Google Forms build sheet - every string, ready to paste

This is the click-by-click companion to `FORMS-BUILD-GUIDE.md`. That file says
*what* to build and in what order; this one holds *every literal string*, so you
can build all eight forms without opening another document.

**Authority order.** If this sheet ever disagrees with `instrument-sus.md`,
`instrument-nasa-tlx.md`, `instrument-apex-ux.md` or `consent-and-briefing.md`,
**the instrument file wins** and this sheet is the thing to fix. The instruments
are the record of what was administered; this is a transcription for convenience.

## Eight forms, not four

Four instruments times two languages. Do not build one bilingual form: mixing
languages inside a single instrument breaks the "EN and PT are strictly two
instruments" rule that Chapter 9 relies on, and makes the response sheet
unanalysable.

| ID | Form | Language | When | Submissions each |
|---|---|---|---|---|
| F0-EN / F0-PT | Consent and demographics | EN / PT | before anything | 1 |
| F1-EN / F1-PT | Raw NASA-TLX | EN / PT | after tasks 3, 4, 6, 7, 8, 9 | **6** |
| F2-EN / F2-PT | SUS | EN / PT | after task 9 | 1 |
| F3-EN / F3-PT | Apex UX | EN / PT | after SUS | 1 |

Build the EN set first, test-submit it, then duplicate each form (three-dot menu,
"Make a copy") and replace the strings with the PT block. Duplicating preserves
question types, scale ranges and required flags, which is where build errors
come from.

---

## Decisions affecting the build

1. **TLX response scale: DECIDED 2026-08-12.** Linear scale **0 to 10**,
   multiplied by ten at analysis time, on **Google Forms**. The original
   20-interval line cannot be reproduced there - no slider, and the linear scale
   stops at 10. This is a real deviation from the instrument; the disclosure
   wording for Chapter 9 is drafted in `EVALUATION-PLAN.md` section 6. **Frozen:
   it cannot change once the first participant has run.** Build F1 exactly as
   specified below.
2. **Arm split: still open.** If the moderated arm runs, F0 keeps the
   screen-recording consent item. If only the unmoderated arm runs, delete that
   item from F0 rather than leaving an unused checkbox on the consent form. This
   is the only thing on this sheet still waiting on a decision, and it affects
   one question on one form.

---

## Settings to apply to all eight forms

In the form's Settings tab:

- **Collect email addresses: OFF.** It contradicts the anonymity paragraph in the
  consent text. This is the single most damaging default.
- **Limit to 1 response: OFF.** It requires a Google sign-in, which also
  de-anonymises, and F1 legitimately needs six submissions per person.
- **Edit after submit: OFF.**
- **See summary charts: OFF.** Participants should not see each other's answers.
- **Shuffle question order: OFF everywhere.** SUS item order is part of the
  instrument.
- **Show progress bar: ON.** F1 is opened six times and people need to see it is
  short.
- **Confirmation message:** replace the default.
  - EN: `Thank you. Close this tab and return to the task script.`
  - PT: `Obrigado. Feche este separador e regresse ao guião de tarefas.`

Response destination: link all eight to **one** spreadsheet, one tab per form.
The participant code is the join key across tabs.

---

# F0 - Consent and demographics

Two sections. Section 1 is consent, section 2 is demographics. Nothing else goes
on this form.

## F0-EN

**Form title:** `Apex study - consent and about you`

**Form description:** paste the whole EN consent text from
`consent-and-briefing.md`, from `Study:` down to and including the `Risks.`
paragraph. Do not paste the signature block; it is replaced by the tick boxes
below.

### Section 1 questions

| Q | Type | Required | Question text |
|---|---|---|---|
| 1 | Short answer | yes | `Your participant code (printed on your card)` |
| 2 | Checkboxes, one option | yes | `I have read and understood the information above, and I agree to take part.` - single option: `I consent to participate` |
| 3 | Checkboxes, one option | no | `Optional permissions` - option: `I consent to anonymised quotations being used in the dissertation` |
| 4 | Checkboxes, one option | no | option: `I agree to be contacted about a follow-up interview` |
| 5 | Checkboxes, one option | no | option: `I consent to the session being screen and audio recorded` - **moderated arm only, delete otherwise** |

Q3 and Q4 can share one checkboxes question with two options if you prefer fewer
clicks. Q2 must stay separate and required.

### Section 2 - About you

Section title: `About you`
Section description: `Six quick questions. They are used only to describe the
participant group in aggregate.`

| Q | Type | Required | Question text | Options, in order |
|---|---|---|---|---|
| G1 | Multiple choice | yes | `Years of professional software development experience` | `Under 1` / `1 to 3` / `4 to 7` / `8 to 15` / `Over 15` / `Student` |
| G2 | Multiple choice | yes | `Current role` | `Developer` / `Tester or QA` / `Product owner` / `Designer` / `Engineering manager` / `Student` / `Other` (use the built-in "Other" option) |
| G3 | Multiple choice | yes | `How often do you use AI coding assistants?` | `Never` / `Tried once or twice` / `Monthly` / `Weekly` / `Daily` |
| G4 | Multiple choice | yes | `Familiarity with Gherkin or BDD` | `None` / `Have seen it` / `Use it regularly` |
| G5 | Multiple choice | yes | `Familiarity with the project management tool used today` | `None` / `Some` / `Use it regularly` |
| G6 | Multiple choice | yes | `Preferred language for this session` | `English` / `Português` |

## F0-PT

**Form title:** `Estudo Apex - consentimento e sobre si`

**Form description:** the PT consent text from `consent-and-briefing.md`, from
`Estudo:` to the end of the `Riscos.` paragraph.

| Q | Type | Required | Question text |
|---|---|---|---|
| 1 | Short answer | yes | `O seu código de participante (impresso no cartão)` |
| 2 | Checkboxes | yes | `Li e compreendi a informação acima e aceito participar.` - option: `Consinto em participar` |
| 3 | Checkboxes | no | `Autorizações opcionais` - option: `Consinto na utilização de citações anonimizadas na dissertação` |
| 4 | Checkboxes | no | option: `Aceito ser contactado para uma entrevista de seguimento` |
| 5 | Checkboxes | no | option: `Consinto na gravação de ecrã e áudio da sessão` - **apenas braço moderado** |

Section 2 title: `Sobre si`

| Q | Question text | Options |
|---|---|---|
| G1 | `Anos de experiência profissional em desenvolvimento de software` | `Menos de 1` / `1 a 3` / `4 a 7` / `8 a 15` / `Mais de 15` / `Estudante` |
| G2 | `Função actual` | `Programador` / `Tester ou QA` / `Product owner` / `Designer` / `Gestor de engenharia` / `Estudante` / `Outra` |
| G3 | `Com que frequência utiliza assistentes de programação com IA?` | `Nunca` / `Experimentei uma ou duas vezes` / `Mensalmente` / `Semanalmente` / `Diariamente` |
| G4 | `Familiaridade com Gherkin ou BDD` | `Nenhuma` / `Já vi` / `Utilizo regularmente` |
| G5 | `Familiaridade com a ferramenta de gestão de projecto utilizada hoje` | `Nenhuma` / `Alguma` / `Utilizo regularmente` |
| G6 | `Língua preferida para esta sessão` | `English` / `Português` |

---

# F1 - Raw NASA-TLX

**The form that must be right.** Six submissions per participant. If Q2 is wrong
or missing, the six-by-six matrix cannot be reassembled and the whole per-task
design is wasted.

Note the item order: **Performance is last, not fourth.** This is deliberate, so
the reversed anchors are not met mid-flow. Record the reordering in Chapter 9
alongside the scale deviation; it changes nothing in the scoring, but it is a
departure from the published order and should be stated rather than discovered.

## F1-EN

**Form title:** `Apex - workload after each task`

**Form description:**

```
We are interested in the workload you experienced during the task you have just
completed. Please rate each of the six aspects below. Read each description
before answering.

Note that the scale for Performance runs in the opposite direction to the
others.
```

| Q | Type | Required | Question text |
|---|---|---|---|
| 1 | Short answer | yes | `Your participant code` |
| 2 | Multiple choice | yes | `Which task are you answering about?` |
| 3 | Linear scale 0-10 | yes | `Mental Demand` |
| 4 | Linear scale 0-10 | yes | `Physical Demand` |
| 5 | Linear scale 0-10 | yes | `Temporal Demand` |
| 6 | Linear scale 0-10 | yes | `Effort` |
| 7 | Linear scale 0-10 | yes | `Frustration Level` |
| 8 | Linear scale 0-10 | yes | `Performance` |
| 9 | Paragraph | no | `Anything you want to say about this task` |
| 10 | Paragraph | no | `For Task 6 only: name the task you think must be done first, and say why in one sentence.` |
| 11 | Paragraph | no | `For Task 8 only: describe in your own words what happened when you tried to deploy.` |

Q10 and Q11 stay as plain optional questions on every submission. Conditional
section logic in Google Forms is fragile and a misconfiguration is silent.

**Q2 options, exactly these six, in this order:**

```
Task 3 - Turn a requirement into locked scenarios
Task 4 - Produce and lock the design
Task 6 - Break the work into implementation tasks
Task 7 - Test plan and QA sign-off
Task 8 - Deploy a different feature
Task 9 - Export what the tool produced
```

**Scale endpoint labels:**

| Q | Left label (0) | Right label (10) |
|---|---|---|
| 3 Mental Demand | `Very low` | `Very high` |
| 4 Physical Demand | `Very low` | `Very high` |
| 5 Temporal Demand | `Very low` | `Very high` |
| 6 Effort | `Very low` | `Very high` |
| 7 Frustration Level | `Very low` | `Very high` |
| 8 Performance | `Perfect` | `Failure` |

**Help text under each scale question, verbatim.** Nobody is present to explain
these, so none of them may be left blank.

- Q3 Mental Demand:
  `How much mental and perceptual activity was required? Was it easy or demanding, simple or complex, forgiving or exacting?`
- Q4 Physical Demand:
  `How much physical activity was required? Was the task easy or demanding, slow or brisk, restful or laborious?`
- Q5 Temporal Demand:
  `How much time pressure did you feel due to the rate or pace at which the task occurred? Was the pace slow and leisurely or rapid and frantic?`
- Q6 Effort:
  `How hard did you have to work, mentally and physically, to accomplish your level of performance?`
- Q7 Frustration Level:
  `How insecure, discouraged, irritated, stressed and annoyed, versus secure, gratified, content and relaxed, did you feel during this task?`
- Q8 Performance:
  `How successful do you think you were in accomplishing the goals of this task? How satisfied were you with your performance? NOTE: this scale is reversed. 0 means Perfect and 10 means Failure. Good performance is the LEFT end.`

## F1-PT

**Form title:** `Apex - carga de trabalho após cada tarefa`

**Form description:**

```
Interessa-nos a carga de trabalho que sentiu durante a tarefa que acabou de
realizar. Classifique cada um dos seis aspectos abaixo. Leia cada descrição
antes de responder.

Note que a escala do Desempenho corre no sentido inverso das restantes.
```

| Q | Question text |
|---|---|
| 1 | `O seu código de participante` |
| 2 | `A que tarefa se refere esta resposta?` |
| 3 | `Exigência Mental` |
| 4 | `Exigência Física` |
| 5 | `Exigência Temporal` |
| 6 | `Esforço` |
| 7 | `Nível de Frustração` |
| 8 | `Desempenho` |
| 9 | `Algo que queira dizer sobre esta tarefa` |
| 10 | `Apenas para a Tarefa 6: indique a tarefa que acha que tem de ser feita primeiro e diga porquê numa frase.` |
| 11 | `Apenas para a Tarefa 8: descreva por palavras suas o que aconteceu quando tentou colocar em produção.` |

**Q2 options:**

```
Tarefa 3 - Transformar um requisito em cenários bloqueados
Tarefa 4 - Produzir e bloquear o design
Tarefa 6 - Dividir o trabalho em tarefas de implementação
Tarefa 7 - Plano de testes e aprovação de QA
Tarefa 8 - Colocar em produção uma funcionalidade diferente
Tarefa 9 - Exportar o que a ferramenta produziu
```

**Endpoint labels:** `Muito baixa` / `Muito alta` for Q3 to Q5,
`Muito baixo` / `Muito alto` for Q6 and Q7, and `Perfeito` / `Fracasso` for Q8.

**Help text:**

- Q3: `Quanta actividade mental e perceptiva foi necessária? A tarefa foi fácil ou exigente, simples ou complexa, tolerante ou rigorosa?`
- Q4: `Quanta actividade física foi necessária? A tarefa foi fácil ou exigente, lenta ou rápida, repousante ou trabalhosa?`
- Q5: `Quanta pressão de tempo sentiu devido ao ritmo a que a tarefa decorreu? O ritmo foi lento e tranquilo ou rápido e frenético?`
- Q6: `Quanto teve de trabalhar, mental e fisicamente, para alcançar o seu nível de desempenho?`
- Q7: `Quão inseguro, desencorajado, irritado, tenso e incomodado, por oposição a seguro, satisfeito, contente e tranquilo, se sentiu durante esta tarefa?`
- Q8: `Em que medida acha que teve sucesso em atingir os objectivos desta tarefa? Quão satisfeito ficou com o seu desempenho? ATENÇÃO: esta escala está invertida. 0 significa Perfeito e 10 significa Fracasso. O bom desempenho está na extremidade ESQUERDA.`

## The six prefilled links

Do this once F1 is finished and never edit F1 afterwards - editing can
invalidate the entry IDs baked into the URLs.

1. Three-dot menu, **Get pre-filled link**.
2. Set Q2 to `Task 3 - Turn a requirement into locked scenarios`. Leave every
   other field empty.
3. **Get link**, then **Copy link**.
4. Repeat for tasks 4, 6, 7, 8 and 9.
5. Paste each into the matching task block in `task-script.md`, replacing the
   `<TLX FORM LINK>` placeholder in that task.
6. Repeat all six for F1-PT.

Twelve links in total. Open each one and confirm the task field arrives
pre-selected before you export the script to PDF.

---

# F2 - SUS

Ten items, in the published order, five-point scale. **Do not reword, reorder,
add or drop any item** - the comparability to the published corpus is the entire
reason for using SUS.

**Same endpoint labels on all ten items.** Alternating them to "match" the
negative items is the classic fatal build error: the scoring formula already
handles the polarity reversal, so alternating labels double-reverses half the
items and silently corrupts the score.

Use **Linear scale 1 to 5**, not multiple choice. There is no N/A on SUS.

## F2-EN

**Form title:** `Apex - System Usability Scale`

**Form description:**

```
Please answer each statement about Apex, the tool you have just used, by marking
one box. There are no right answers. Record your immediate reaction rather than
thinking for a long time about each one. If you feel you cannot answer an item,
mark the centre point.
```

Q1: Short answer, required, `Your participant code`.

Q2 to Q11: Linear scale 1 to 5, all required, left label `Strongly disagree`,
right label `Strongly agree`.

```
1.  I think that I would like to use Apex frequently.
2.  I found Apex unnecessarily complex.
3.  I thought Apex was easy to use.
4.  I think that I would need the support of a technical person to be able to use Apex.
5.  I found the various functions in Apex were well integrated.
6.  I thought there was too much inconsistency in Apex.
7.  I would imagine that most people would learn to use Apex very quickly.
8.  I found Apex very cumbersome to use.
9.  I felt very confident using Apex.
10. I needed to learn a lot of things before I could get going with Apex.
```

Strip the leading numbers when pasting; Google Forms numbers them itself.

## F2-PT

Validated European Portuguese version, Martins et al. (2015), with the single
permitted change: the referent `este produto` becomes `o Apex`.

**Form title:** `Apex - Escala de Usabilidade do Sistema`

**Form description:**

```
Responda a cada afirmação sobre o Apex, a ferramenta que acabou de utilizar,
marcando uma opção. Não há respostas certas. Registe a sua reacção imediata em
vez de pensar muito tempo em cada uma. Se sentir que não consegue responder,
marque o ponto central.
```

Q1: `O seu código de participante`.

Q2 to Q11: Linear scale 1 to 5, left `Discordo totalmente`, right
`Concordo totalmente`.

```
1.  Acho que gostaria de utilizar o Apex com frequência.
2.  Considerei o Apex mais complexo do que necessário.
3.  Achei o Apex fácil de utilizar.
4.  Acho que necessitaria de ajuda de um técnico para conseguir utilizar o Apex.
5.  Considerei que as várias funcionalidades do Apex estavam bem integradas.
6.  Achei que o Apex tinha muitas inconsistências.
7.  Suponho que a maioria das pessoas aprenderia a utilizar rapidamente o Apex.
8.  Considerei o Apex muito complicado de utilizar.
9.  Senti-me muito confiante a utilizar o Apex.
10. Tive que aprender muito antes de conseguir lidar com o Apex.
```

The anchors are the conventional Portuguese wording, not Martins et al.'s - the
paper does not print anchor labels. Chapter 9 says so rather than implying they
came from the validation.

---

# F3 - Apex UX

Eighteen closed items in five sections, then three open questions.

**Use Multiple choice with six options, not Linear scale.** A linear scale
cannot carry an N/A option, and several items refer to surfaces a participant may
never have opened. Forcing a centre point there manufactures data.

**The six options, identical on all eighteen items:**

EN: `1 Strongly disagree` / `2` / `3` / `4` / `5 Strongly agree` /
`N/A - did not use this`

PT: `1 Discordo totalmente` / `2` / `3` / `4` / `5 Concordo totalmente` /
`N/A - não utilizei`

Build one item, then use **Duplicate** seventeen times and edit only the question
text. Retyping the options eighteen times is how one of them ends up different.

## F3-EN

**Form title:** `Apex - your experience of the interface`

**Form description:**

```
These questions are about the tool itself. Answer for what you actually did
today. If a question refers to something you never used, choose N/A rather than
guessing.
```

Q1: Short answer, required, `Your participant code`.

**Section A - Knowing where you are**

```
A1  At any moment, I knew which phase of the process I was in.
A2  I understood what the tool expected me to do next.
A3  I could tell the difference between work the tool had finished and work it had not.
A4  When the tool refused to let me continue, I understood why.
```

**Section B - Working with AI-generated content**

```
B1  I could tell which parts of the content were generated by AI and which were mine.
B2  Reviewing the AI's output took less effort than writing it myself would have.
B3  I felt able to reject or change the AI's output when I disagreed with it.
B4  I trusted the generated content enough to use it in a real project.
B5  I could see what information the AI had been given as a basis for its output.
```

**Section C - Control and reversibility**

```
C1  I felt in control of what the tool did on my behalf.
C2  I was confident I could undo or redo a step if I made a mistake.
C3  I understood the consequences of locking a phase before I did it.
C4  Waiting for the AI to finish was acceptable.
```

**Section D - Feedback and errors**

```
D1  When something went wrong, the tool told me clearly what had happened.
D2  The messages the tool showed me told me what to do next, not only what failed.
```

**Section E - Fit to real work**

```
E1  The artefacts the tool produced are ones my team would actually use.
E2  The process the tool imposes fits the way my team works.
E3  The effort of following the process is worth what it produces.
```

**Section F - In your own words.** Three Paragraph questions, all required.

```
What was the single most confusing thing about using Apex?
Was there a point where you did not trust what the tool had produced? What made you doubt it?
If you could change one thing about the interface, what would it be?
```

Strip the `A1`, `B2` prefixes when pasting - keep them only in the response
spreadsheet's short-name header row, so the analysis can address items by code.

## F3-PT

**Form title:** `Apex - a sua experiência com a interface`

**Form description:**

```
Estas perguntas são sobre a ferramenta em si. Responda em relação ao que fez
hoje. Se uma pergunta se referir a algo que nunca utilizou, escolha N/A em vez
de adivinhar.
```

Q1: `O seu código de participante`.

**Secção A - Perceber onde se está**

```
A1  Em qualquer momento, soube em que fase do processo estava.
A2  Percebi o que a ferramenta esperava que eu fizesse a seguir.
A3  Consegui distinguir o trabalho que a ferramenta tinha concluído daquele que não tinha.
A4  Quando a ferramenta me impediu de continuar, percebi porquê.
```

**Secção B - Trabalhar com conteúdo gerado por IA**

```
B1  Consegui distinguir que partes do conteúdo foram geradas por IA e quais eram minhas.
B2  Rever o resultado da IA exigiu menos esforço do que escrevê-lo eu próprio.
B3  Senti que podia rejeitar ou alterar o resultado da IA quando discordava.
B4  Confiei no conteúdo gerado o suficiente para o usar num projecto real.
B5  Consegui ver que informação tinha sido dada à IA como base para o resultado.
```

**Secção C - Controlo e reversibilidade**

```
C1  Senti-me no controlo do que a ferramenta fazia em meu nome.
C2  Senti confiança em conseguir desfazer ou repetir um passo se cometesse um erro.
C3  Percebi as consequências de bloquear uma fase antes de o fazer.
C4  O tempo de espera pela IA foi aceitável.
```

**Secção D - Feedback e erros**

```
D1  Quando algo correu mal, a ferramenta disse-me claramente o que tinha acontecido.
D2  As mensagens que a ferramenta mostrou diziam-me o que fazer a seguir, e não apenas o que falhou.
```

**Secção E - Adequação ao trabalho real**

```
E1  Os artefactos produzidos pela ferramenta são artefactos que a minha equipa usaria de facto.
E2  O processo que a ferramenta impõe encaixa na forma como a minha equipa trabalha.
E3  O esforço de seguir o processo compensa aquilo que produz.
```

**Secção F - Por palavras suas.** Três perguntas de parágrafo, obrigatórias.

```
Qual foi a coisa mais confusa em utilizar o Apex?
Houve algum momento em que não confiou naquilo que a ferramenta produziu? O que o levou a duvidar?
Se pudesse mudar uma coisa na interface, o que mudaria?
```

---

# Acceptance check before the pilot

Do all of this yourself, in one sitting, with a throwaway code like `TEST1`.

**Per form**

- [ ] Submit each of the eight forms once. F1 six times, once per task option.
- [ ] Collect email addresses is OFF on all eight. Check it, do not assume it.
- [ ] Every required field is actually marked required, and every optional one is
      not. A required Q10 on F1 blocks five of the six submissions.
- [ ] F2: all ten items read `Strongly disagree` on the left. Scroll the live
      form and check every one; this is the error that silently ruins the score.
- [ ] F1 Q8 Performance reads `Perfect` on the left and `Failure` on the right,
      and its help text says the scale is reversed.
- [ ] F3: all eighteen items offer the N/A option.

**Per response sheet**

- [ ] Open the spreadsheet. Every form has its own tab.
- [ ] The participant code column is present and first on every tab.
- [ ] F1 produced six rows for `TEST1`, each with a different, correctly spelled
      task label.
- [ ] Add a short-name header row in a **copy** of the sheet:
      `code`, `task`, `mental`, `physical`, `temporal`, `effort`, `frustration`,
      `performance` for F1; `code`, `sus1` to `sus10` for F2; `code`, `A1` to
      `E3` for F3. Never edit the raw response sheet.
- [ ] Score the `TEST1` SUS row by hand using the formula in `instrument-sus.md`
      and confirm you get the number you expect. If the sheet cannot reproduce a
      score you computed by hand, the form is wrong, not the formula.

**Then**

- [ ] Delete every `TEST1` row from the raw sheets.
- [ ] Paste the twelve prefilled F1 links into `task-script.md`, plus the F2 and
      F3 links, and re-export the script to PDF.
- [ ] Freeze. After the pilot, no wording changes at all - a mid-study edit makes
      the earlier and later responses two different instruments.
