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

> **The table in this section is the original 2026-08-19 measurement, kept for
> the record. It is superseded by §1a-bis's revised targets, which are in turn
> superseded by the 2026-09-01 numbers in that section, which are themselves
> superseded by §1a-ter's 2026-09-10 numbers** - read §1a-ter for the current
> state, not the table immediately below.

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

## 1a-bis. The operative targets, revised 2026-09-01

Three ceilings apply at once, and they are not the same number. Planning against
only one of them is how the earlier budgets in this file went wrong.

**Measured 2026-09-01, from the rendered PDF (`pdftotext`, chapter boundaries
found by first-line heading match per page, not estimated):**

| # | Ceiling | Source | Applies to | State on 2026-09-01 |
|---|---|---|---|---|
| 1 | **80 pages** | Guide §1, "texto principal" | main text alone, Chapters 1 to 10 | 70, compliant |
| 2 | **80 pages** | Tomas's target, matching Cruz | main text **plus bibliography** | 76, compliant |
| 3 | **100 pages** | Guide §1, "o conjunto" | the whole assembled PDF | 107, **over by 7** |

Ceiling 3 is now the one that binds, not ceiling 2: main text and main-plus-
bibliography both sit inside their targets already. What pushed the whole
document over is the appendices, now real content rather than `\todo` stubs (13
pages, against the 6-to-8 estimated in the paragraph below when this section
was first written) - and Chapters 9 and 10 both still carry unwritten `\todo`
sections (`sec:analytical`, `sec:eval_results`, `sec:threats`,
`sec:eval_discussion` in Ch9; the future-work list in Ch10) that will add pages
once filled, not subtract them. The 7-page overage today is the floor, not the
ceiling, of what has to come out.

Front matter: 18 pages. Bibliography: 6 pages (not 7). Appendices: 13 pages (A:
6, B: 7).

```
front matter 18 + bibliography 6 = 24 pages that are not main text or annex
ceiling 3 (100 total)  ->  main text + appendices <= 76
current: main text 70 + appendices 13 = 83, over by 7
```

Appendices are still not free, and are already past the old six-to-eight-page
estimate for Appendix B alone (it is 7 on its own; Appendix A adds another 6).
Every page moved out of a chapter and into an annex still counts against
ceiling 3.

| Chapter | Now (2026-09-01) | Budget (2026-08-19) | Delta |
|---|---|---|---|
| 1 Introduction | 2 | 2 | on target |
| 2 Research Methodology | 4 | 3 | +1 |
| 3 Research Background | 4 | 4 | on target |
| 4 Systematic Literature Review | 14 | 10 | +4 |
| 5 Research Problem | 2 | 2 | on target |
| 6 Research Proposal | 14 | 13 | +1 |
| 7 Apex | 12 | 11 | +1 |
| 8 Demonstration | 6 | 9 | -3, room to grow |
| 9 Evaluation | 10 | 11 | -1, but `\todo` sections still unwritten |
| 10 Conclusion | 2 | 3 | -1, but future-work `\todo` still unwritten |
| **Main text** | **70** | **68** | **+2** |

Chapters 4 and 6 were the ones flagged for the largest cuts on 2026-08-19 (24
and 28 pages respectively at the time) and have already come down to 14 each -
most of the earlier 22-page overage is already gone. What is left is smaller
and more evenly spread: about 7 pages need to come out of the document as it
stands, purely to reach ceiling 3 today, before Chapters 9 and 10 finish
growing into their still-open `\todo` sections and push the total back up.
Cutting redundancy and restated claims throughout, rather than any single
chapter, is the realistic source for that margin now.

## 1a-ter. All three ceilings now compliant, 2026-09-10

`main.tex` was forcing every main-body chapter onto a fresh odd page: the
documentclass `openright` option (each `\chapter` starts right-hand) plus an
explicit `\cleardoublepage` after every `\input{Chapter_N}`, which forced the
odd-page landing a second time regardless of the class option. Fixed both -
`openright` -> `openany` on the documentclass line (a supported pass-through
option `istulthesis.cls` already declares, not a template edit), and the 9
post-chapter `\cleardoublepage` calls -> `\clearpage`. Commit `bf9a49b`.

That left three more blank pages in the front matter, from the identical
cause: `\cleardoublepage` after the abstract/resumo block, after the resumo's
keywords, and after the table of contents. Same fix, `\clearpage`. A fourth
front-matter blank, after the Acronyms list, turned out to be a different bug
entirely: `Chapters/Glossary.tex` only ever held the template's own
placeholder entries (mathematics/LaTeX/formula), nothing in the thesis body
calls `\gls` on them, and no `main.gls` was even generated - so
`\printglossary` was rendering an empty page regardless of the
cleardoublepage/clearpage fix. Commented the whole Glossary section out,
same treatment already given to the unused algorithms/listings lists on
2026-08-19. Commit `e19d249`. Both passes verified the same way: rebuild,
`pdfinfo`/undefined-refs check, and a normalized `pdftotext` diff against the
pre-fix PDF confirming the only change is the removed blank-page folios, no
prose lost.

**Measured 2026-09-10, from the rendered PDF, same method as §1a-bis:**

| # | Ceiling | Applies to | State on 2026-09-10 |
|---|---|---|---|
| 1 | **80 pages** | main text alone, Chapters 1 to 10 | 65, compliant |
| 2 | **80 pages** | main text **plus bibliography** | 70, compliant |
| 3 | **100 pages** | the whole assembled PDF | 94, **compliant, 6 pages of margin** |

All three ceilings now hold. Front matter: 12 pages. Bibliography: 5 pages.
Appendices: 12 pages (A: 6, B: 6).

| Chapter | Now (2026-09-10) | Now (2026-09-01) | Delta |
|---|---|---|---|
| 1 Introduction | 2 | 2 | on target |
| 2 Research Methodology | 3 | 4 | -1 |
| 3 Research Background | 4 | 4 | on target |
| 4 Systematic Literature Review | 13 | 14 | -1 |
| 5 Research Problem | 2 | 2 | on target |
| 6 Research Proposal | 13 | 14 | -1 |
| 7 Apex | 12 | 12 | on target |
| 8 Demonstration | 5 | 6 | -1 |
| 9 Evaluation | 9 | 10 | -1 |
| 10 Conclusion | 2 | 2 | on target |
| **Main text** | **65** | **70** | **-5** |

The 5-page main-text drop is entirely the removed forced blanks between
chapters (one per Ch1-9 boundary that landed mid-chapter rather than exactly
on a page break); no prose was cut for this fix. The whole-document drop is
larger (107 -> 94, 13 pages): the extra 8 pages are front matter 18 -> 12
(-6, the openany/clearpage front-matter fix plus the Glossary removal) and
bibliography 6 -> 5 (-1), appendices 13 -> 12 (-1) shifting slightly on
re-measurement. No content was cut in any of those sections.

Ceiling 3 no longer binds tighter than the others - all three now have
margin, and ceiling 3's margin is the largest of the three (6 pages).
Chapters 9 and 10 still carry unwritten `\todo` sections (`sec:analytical`,
`sec:eval_results`, `sec:threats`, `sec:eval_discussion` in Ch9; the
future-work list in Ch10) that will add pages once filled; that margin is
what has to absorb that, not a cushion to spend elsewhere.

## 1a. The benchmark: what actually passed, from the same supervisor

`~/Downloads/110851_leonardo_cruz_dissertacao.pdf` - Leonardo Cruz, *Using
Artificial Intelligence for Evaluating Student Answers*, MEIC, October 2025,
supervised by Prof. Miguel Mira da Silva. Same degree, same supervisor, same
template, and it was accepted. It is already the reference for this thesis's
chapter structure; it is now also the reference for its length.

| | Cruz | Ours | Delta |
|---|---|---|---|
| 1 Introduction | 2 | 6 | +4 |
| 2 Research Methodology | 3 | 4 | +1 |
| 3 Research Background | 4 | 4 | = |
| 4 Systematic Literature Review | **10** | **24** | **+14** |
| 5 Research Problem | 2 | 4 | +2 |
| 6 Research Proposal | **11** | **28** | **+17** |
| 7 Apex (ours only) | - | 4 | skeleton |
| 8 Demonstration | **23** | 2 | skeleton |
| 9 Evaluation | 8 | 8 | = |
| 10 Conclusion | 4 | 1 | skeleton |
| **Main text** | **67** | **85** | **+18** |
| Front matter | 19 | 22 | +3 |
| Bibliography | 6 | 7 | +1 |
| Appendices | 5 | 3 | -2 |
| **Total PDF** | **98** | **117** | **+19** |

Two things this settles.

**The proportions are wrong, not just the total.** Cruz spent 21 of 67 main-text
pages, under a third, on the review and the proposal. We have spent 52 of 85,
over three fifths, on the same two chapters. He spent his budget where the marks
are: 23 pages on Demonstration, which is his results chapter. Assessment
criterion A rewards "análise crítica das soluções propostas e dos resultados
obtidos", and that is the part we have not written yet and are running out of
room for.

**The real ceiling is not 80.** The 100-page whole-document cap binds harder than
the 80-page main-text cap, because front matter, bibliography and annexes eat
into it:

```
front matter 22 + bibliography 7 + appendices 5 = 34 non-main pages
100 - 34 = 66 pages of main text, not 80
```

Cruz landed at 67 main text and 98 total. That is not a coincidence; it is what
fitting the rule looks like. **Plan against 66, not 80.**

### Proposed page budget

Derived from Cruz's proportions, adjusted for this thesis having a seventh
chapter he does not (Apex) and a heavier evaluation instrument set.

| Chapter | Now | Budget | Action |
|---|---|---|---|
| 1 Introduction | 6 | 4 | cut 2 |
| 2 Research Methodology | 4 | 3 | cut 1 |
| 3 Research Background | 4 | 4 | keep |
| 4 Systematic Literature Review | 24 | 10 | **cut 14** |
| 5 Research Problem | 4 | 2 | cut 2 |
| 6 Research Proposal | 28 | 13 | **cut 15** |
| 7 Apex | 4 | 8 | write to 8 |
| 8 Demonstration | 2 | 9 | write to 9 |
| 9 Evaluation | 8 | 10 | write to 10 |
| 10 Conclusion | 1 | 3 | write to 3 |
| **Main text** | **85** | **66** | **cut 34 from written** |

Roughly 34 pages have to come out of Chapters 1 to 6. Chapters 4 and 6 are 29 of
those 34. Every unwritten chapter is written to its budget, not to length, and
checked against it before moving on.

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

**Template - CORRECTED 2026-08-19.** An earlier version of this section closed
the template question as "use the dissertation model" and is wrong. It is
recorded below, struck through rather than deleted, because the point of a
regulations file is to be trusted, and a silent rewrite would hide that a
wrong conclusion was ever reached here.

> ~~Decided: use the dissertation model, which for this degree is the IST
> template already in `IST_UL___MEIC_Thesis___Dissertação_final/`, the same
> one Leonardo Cruz's accepted MEIC dissertation uses. No separate template is
> being sought and the supervisor does not need to be asked.~~

The regulation's own text is the guide's fallback clause, and it is not in
dispute:

> "Este resumo deverá ser elaborado de acordo com um modelo a definir para
> cada curso. Na ausência de definição deverá ser adoptado **o modelo seguido
> para a dissertação**."

What was missing earlier was a second document: not Cruz's 98-page
dissertation, but his actual **extended abstract**,
`~/Downloads/110851_leonardo_cruz_resumo.pdf`, the accompanying article he
submitted alongside that dissertation, same degree (MEIC), same supervisor
(Prof. Miguel Mira da Silva), October 2025, accepted. Read against
`~/Downloads/extended_abstract_template.pdf` (the ACM `acmart` sample
article, confirming the class), the evidence is unambiguous: Cruz's extended
abstract is not written in the IST dissertation template. It is a five-page
**ACM `acmart` two-column** article, with an ACM abstract/CCS-concepts/
keywords block, an "ACM Reference Format" line, and ACM-Reference-Format-
style numbered citations, no thesis-template front matter and no
thesis-template chapter or heading style at all.

**Corrected decision: for this degree, under this supervisor, "the model
followed for the dissertation" does not mean the IST dissertation `.cls` file
applied a second time to a shorter document. It means whatever the
demonstrated, accepted practice for this degree and supervisor actually is,
and that practice is the ACM `acmart` template.** The guide's fallback clause
is satisfied by ACM `acmart`, not contradicted by it; the earlier reading
conflated "the model followed for the dissertation" with "the dissertation's
own template file," which is exactly the reading the Cruz evidence rules out.

**One deviation to note, with precedent.** Both the regulation and the guide
say the extended abstract is up to ten pages **A4**. The ACM `acmart` class
typesets US Letter (612 by 792 points) and offers no supported A4 option, so
the scaffold in `extended-abstract/` renders on Letter. Cruz's accepted
extended abstract is Letter for the same reason, while his dissertation is
A4. The precedent therefore says this is tolerated in practice, but it is a
literal departure from the stated rule and is recorded here rather than left
to be discovered. If it ever has to be corrected, the fix is a page-geometry
override rather than a change of template, and the page budget must be
re-measured afterwards, since A4 is taller and narrower than Letter.
A scaffold built on this corrected decision lives in
`docs/thesis/extended-abstract/` (`main.tex`, `acmart`, `sigconf`), with the
evidence and the build verification recorded in that directory's `README.md`.

Note precisely what each Cruz file does and does not give us. The
dissertation (`~/Downloads/110851_leonardo_cruz_dissertacao.pdf`) is a full
98-page document, not an extended abstract, so it is **not** an example of
what a ten-page article looks like, and it remains the correct source for the
page benchmark in §1a and for the dissertation's own template, which the
guide's fallback clause does still govern. The extended abstract
(`110851_leonardo_cruz_resumo.pdf`) is the one that settles the template
question for *this* deliverable, and it is a different template from the one
the dissertation uses. If a second precedent is wanted before treating this as
fully settled, it has to come from another accepted MEIC extended abstract
under the same supervisor; none has been sought yet.

The article is a compression problem, not a writing-from-scratch problem: ten
pages covering problem, method, artefact, demonstration, evaluation and
conclusion. It cannot be started until there are results to report, but its
structure can be planned as soon as the page budget above is settled, since both
are the same exercise of deciding what the contribution actually is.

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
8. **The extended-abstract template is closed, and corrected 2026-08-19**: the
   guide's fallback applies, but "the model followed for the dissertation"
   means the demonstrated accepted practice for this degree and supervisor,
   which is **ACM `acmart`**, not a second application of the IST dissertation
   `.cls`. Evidence and scaffold are in `docs/thesis/extended-abstract/`; see
   §2 above for the correction and what was wrong in the earlier reading.
9. **Plan against 66 pages of main text, not 80** (§1a). The whole-document cap
   is the binding one, and the accepted benchmark from the same supervisor landed
   at 67 main text and 98 total.
