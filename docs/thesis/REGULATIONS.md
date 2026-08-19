# Regulamento das Dissertações de Mestrado - binding constraints

Two sources, both read in full:

1. **Regulamento das Dissertações de Mestrado do IST**, 6 pages, 30 November
   2022. Local copy: `~/Downloads/regulamento-das-disserta-es-de-mestrado-2022.pdf`.
2. **Guia de Preparação da Dissertação**, Direção Académica, 7 pages, 20
   September 2021. Local copy: `~/Downloads/guia-disserta-o-mestrado.pdf`. The
   regulation defers to this guide for format, cover layout and the extended
   abstract, so where the two are read together the guide is the operative one.

This file records only what constrains our work. It is the authority; where
`THESIS-STRUCTURE.md` or any plan in `evaluation/` disagrees with it, this file
wins.

---

## 1. The page limit - currently violated

The guide settles what the 80 pages counts, which the regulation alone left
open. Its prescribed structure is explicit:

> capa; agradecimentos (facultativo); resumo e palavras-chave (em Português e em
> Inglês); índice; lista de quadros e figuras e lista de abreviações; **texto
> principal que não deverá ultrapassar 80 páginas**; referências bibliográficas;
> anexo(s), se existirem.
>
> "Os anexos, se existirem, devem ser juntos à dissertação de modo a que **o
> conjunto não exceda 100 páginas**."

So there are two separate ceilings:

- **Main text only, 80 pages.** Cover, acknowledgments, abstracts and keywords,
  table of contents, lists of figures/tables/abbreviations, bibliography and
  annexes all sit outside this count.
- **The whole assembled document, 100 pages.**

**Where the thesis stands, measured from the rendered PDF on 2026-08-19:**

| Section | Pages |
|---|---|
| Front matter (roman) | 22 |
| Chapter 1 Introduction | 6 |
| Chapter 2 Research Methodology | 4 |
| Chapter 3 Research Background | 4 |
| Chapter 4 Systematic Literature Review | 24 |
| Chapter 5 Research Problem | 4 |
| Chapter 6 Research Proposal | 28 |
| Chapter 7 Apex | 4 (skeleton) |
| Chapter 8 Demonstration | 2 (skeleton) |
| Chapter 9 Evaluation | 8 (results empty) |
| Chapter 10 Conclusion | 1 (skeleton) |
| **Body, Chapters 1 to 10** | **85** |
| Bibliography | 7 |
| Appendices A and B | 3 (both are `\todo` prompts) |
| **Total PDF** | **117** |

**Against the 80-page main-text ceiling: 85, over by 5** - and over while
Chapters 7, 8 and 10 are still skeletons and Chapter 9 has no results.

**Against the 100-page whole-document ceiling: 117, over by 17.**

The main-text number is the one that binds the writing. Written to the density
of Chapter 6, the four unfinished chapters land near this:

| Chapter | Now | Realistic when written |
|---|---|---|
| 7 Apex | 4 | 12 to 15 |
| 8 Demonstration | 2 | 8 to 10 |
| 9 Evaluation | 8 | 15 to 18 |
| 10 Conclusion | 1 | 5 to 6 |

That puts the main text near **110 pages against a ceiling of 80**, so roughly
**30 pages have to come out of what is already written**. Chapters 4 and 6, at 24
and 28 pages, are 52 of the current 85 and are the only realistic source of a cut
that size. Every chapter from here is written to a page budget, and Chapter 6
needs revisiting rather than defending: it was written before this constraint was
known.

Appendices belong in the annex either way, but note the guide's phrasing: annexes
are attached *to* the dissertation so that the whole stays under 100. Moving them
out of the 80 is legitimate; it does not make them free.

## 1b. Front matter limits - four violations, all trivially fixable

The guide caps two things the project has never checked:

> "O resumo analítico ... deve ser escrito em português e inglês, com um **máximo
> de 250 palavras cada** e acompanhado de **4 a 6 palavras-chave**."

Measured 2026-08-19:

| Item | Rule | Actual | Status |
|---|---|---|---|
| `EN-Abstract.tex` | max 250 words | **301** | over by 51 |
| `PT-Resumo.tex` | max 250 words | **360** | over by 110 |
| `EN-KeyWords.tex` | 4 to 6 keywords | **10** | over by 4 |
| `PT-PalavrasChave.tex` | 4 to 6 keywords | **10** | over by 4 |

The front matter was settled on 2026-08-05 without these limits in view. All four
need editing, and the keyword lists need a deliberate choice of which six of the
ten carry the work.

## 2. The extended abstract - a separate deliverable, 20 per cent of the grade

> "A dissertação ... deverá ser acompanhada de um **resumo alargado na forma de
> artigo científico/técnico até 10 páginas A4 redigido em inglês**."

A second document, not an abstract inside the thesis: a paper of up to 10 A4
pages, in English. Both the thesis and this article are uploaded through Fénix.

**The template question is answered by the guide**: "Este resumo deverá ser
elaborado de acordo com um modelo a definir para cada curso. Na ausência de
definição deverá ser adoptado o modelo seguido para a dissertação." If MEIC-T
defines no model, the dissertation template is used. So this is unblocked and can
be started whenever the content exists; only a course-specific model, if one
exists, would change it.

It carries **20 per cent of the final mark**, the same weight as the entire
public discussion and twice the weight of the presentation. Nothing in
`THESIS-STRUCTURE.md` or any plan in this repository mentions it. It is the
largest unplanned item in the project.

## 3. Grade weights

| Component | Weight | What is assessed |
|---|---|---|
| A - scientific and technical quality of the dissertation | **50 %** | Structure; quality of the literature review; clarity of objectives and their fulfilment; originality of problem, methods and proposed solutions; ability to apply knowledge to unfamiliar problems; scientific rigour; **critical analysis of the proposed solutions and of the results obtained**; clarity and quality of writing and presentation; relevant and comprehensive references |
| B - quality of the article / extended abstract | **20 %** | Structure; rigour; clarity and quality of writing |
| C - quality of the public presentation | **10 %** | Quality; clarity, **including the ability to communicate to non-specialists**; rigour; ability to synthesise |
| D - public discussion | **20 %** | Confidence; ability to argue |

Final mark is the weighted mean on a 0 to 20 scale, rounded to the nearest
integer.

Two items in A are worth reading as instructions rather than as criteria.
"Critical analysis of the proposed solutions and of the results obtained" is the
one the honest-limitations discipline in this project already serves. "Referências
relevantes e abrangentes" is why the preprint and vendor-reported caveats matter.

## 4. The jury

- Designated by the course coordinator, proposed by the supervisor, after the
  scientific committee is heard.
- **3 to 5 members**, obligatorily comprising: a president, who may be the course
  coordinator or a member of the scientific committee named by them; the
  supervisor (where there is more than one supervisor, only one may sit); and
  vogais who may be professors, doctoral researchers, or up to two specialists of
  recognised merit.
- **The supervisor may never preside.**
- Jury designation requires the proposal to be formalised in Fénix.

This confirms the cover-page item is genuinely a waiting item: the names are not
ours to choose. It also answers one of the two questions left open on
2026-08-15, that the chairperson is named by the school rather than chosen by us.

## 5. Confidentiality - CLOSED 2026-08-19, does not apply

**Decided: this dissertation is not developed in collaboration with a business
entity, so no confidentiality agreement is required.** The rule that would have
triggered it is the guide's, which is stronger than the regulation's:

> "Este acordo torna-se **obrigatório** nos casos em que os trabalhos de
> Dissertação/Projeto venham a ser desenvolvidos **em colaboração com entidades
> empresariais**."

The distinction that settles it: the partner organisation supplies people who
take part in a usability study, and uses Apex; it does not co-develop the
dissertation, fund it, own any part of it, or direct its scope. Study
participants are not a business collaboration. Nothing therefore has to be signed
by the President of IST or by the organisation, nothing has to be communicated to
the course coordinator on this front, and no jury-only annex volume is needed.

**What still constrains Chapter 8, from our own commitments rather than from the
regulation.** The consent form in `evaluation/consent-and-briefing.md` already
promises participants that "your name, your employer and any project details you
mention are not recorded in the results", and that identifying detail is removed
or generalised. That promise binds regardless of what the regulation requires, so
the demonstration setting is described generically and the organisation is not
named. This is a self-imposed constraint and Chapter 8 should read as one:
anonymised because participants were promised it, not because anyone demanded
secrecy.

For the record, had it applied: title, abstract and keywords could not have been
confidential in either language; jury members would have signed an undertaking;
the public text would have needed the organisation's authorisation; and
confidential results would have gone into a separate annex volume distributed
only to the jury.

## 6. Other binding items

- **Language.** The thesis may be written in Portuguese or English. English is
  already decided and in effect. The extended abstract must be in **English**
  regardless.
- **The Declaration inside the thesis.** Required verbatim, immediately before
  the Abstract, Resumo and Acknowledgments. **Already satisfied** - it renders on
  page 2 of the PDF, pulled in by `cover-titlepage.sty` from `Copyright.tex`, in
  the English form, extended with our acknowledgement of AI tool use.
- **A second, separate Declaration**, which is *not* the one above and is not
  part of the thesis: the guide's §4, "Declaração respeitante à divulgação da
  dissertação", is the **last page of the guide itself** and must be **printed and
  signed**. It grants IST a perpetual non-exclusive licence to use the
  dissertation for teaching or research and to publish it, and the extended
  abstract, as PDF on tecnico.ulisboa.pt. Nothing to write; it is an administrative
  deliverable that is easy to forget because it lives outside the repository.
- **Cover layout** (guide §1.2, with a worked example on its page 5). Ten
  elements in order: IST logo, institution name, optional image, full title,
  optional subtitle, candidate's full name, full course name, supervisors
  (maximum 2, full names), the jury, and month and year. Note the jury
  requirement: "a composição do júri tem obrigatoriamente de ser indicada com
  **nome completo e categoria** de todos os elementos" - so the academic
  category, not only the name, is required for every member. That is more than
  `\finalthesis{true}` currently expects to be filled in.
- **Formatting** (guide §1.1): A4; white cover with a colour image; **Arial or
  similar**; black text; **1.5 line spacing**; **10 pt**; footnotes single-spaced
  and 9 pt, used sparingly; **2.5 cm margins on all four sides**; arabic page
  numbers bottom centre or bottom right; **no headers or footers except the page
  number at 9 pt**; oversize drawings go in an annex volume. Equations centred and
  consecutively numbered; tables and figures centred, numbered, captioned, placed
  near the text they belong to, colour permitted; citation style is whatever is
  standard for the field.

  **The template already satisfies almost all of this** and should not be
  fiddled with: `istulthesis.cls` loads `a4paper`, the `Helvetica` option maps
  `\rmdefault` to `phv`, the class is 10 pt, margins are set to 2.5 cm, and
  `Preamble_commands.tex` clears all headers and prints only a centred page
  number with no rules. Two cosmetic deviations exist - the page number is bold
  at body size rather than 9 pt, and `\baselineskip` is 18 pt where 1.5 spacing
  at 10 pt would be about 15 pt - but the regulation names this template as the
  model, so leave them.
- **Plagiarism detection.** Both the dissertation and the extended abstract may
  be run through plagiarism-detection software.
- **Graphic presentation** must follow the model in the Guia de Preparação de
  Dissertação *(guide)*. The IST template we are using is that model.
- **Public defence.** 90 minutes maximum, 60 recommended. The first **20 minutes**
  are the candidate's synthesis presentation, which "sem prejuízo de rigor
  científico/técnico, deve ser também dirigida a um público alvo constituído por
  não especialistas". The remaining 40 to 70 minutes are discussion, split
  equally between the jury and the candidate. Portuguese and English may both be
  used.
- **Missing the submission deadline** means re-enrolling in the dissertation
  course unit the following semester.

---

## What this changes in the plan

1. **Length is a hard constraint, not a style preference.** The main text is 85
   pages against a ceiling of 80, and needs to end near 80 with four more
   chapters written. That means finding roughly 30 pages in Chapters 4 and 6.
   Chapter 6 was written to a length brief that predates this constraint and
   should be revisited on those grounds, not defended.
2. **Every remaining chapter gets a page budget before it is written.** A
   workable split of an 80-page main text: Ch 1 six, Ch 2 four, Ch 3 four, Ch 4
   fifteen, Ch 5 four, Ch 6 sixteen, Ch 7 twelve, Ch 8 eight, Ch 9 sixteen, Ch 10
   five. That is 90 and still needs trimming, which is the measure of how tight
   this is.
3. **Fix the four front-matter violations** in §1b. Cheap, mechanical, and they
   are hard rules.
4. **Move Appendices A and B into the annex**, remembering the whole assembled
   document still has to fit 100 pages.
5. **Add the extended abstract to the plan.** 10 pages, English, 20 per cent of
   the mark, unplanned and unstarted. The template question is answered: use the
   dissertation model unless MEIC-T defines its own.
6. **Print and sign the divulgation declaration**, the last page of the guide.
   Administrative, outside the repository, easy to forget.
7. **Confidentiality is closed** (§5): not a business-entity collaboration, so
   no agreement, no jury-only annex, nothing to communicate to the coordinator.
   Chapter 8 still anonymises the setting, because the consent form promised it.
8. **One question left for the supervisor**: whether MEIC-T defines its own
   extended-abstract model. If not, the dissertation template is used and the
   article can be started as soon as there are results to report.
