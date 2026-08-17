# Thesis structure and writing roadmap

Working document for the MEIC-T dissertation. The LaTeX source lives in
`IST_UL___MEIC_Thesis___Dissertação_final/`; the PIC report it draws on lives in
`PIC_103641_Tomás_Taborda/` and is now a **source**, not a target - edit the thesis.

## Why this structure

DSRM prescribes six *activities*, not six chapters. The organisation below keeps a
1:1 readable mapping to those activities while staying a normal, defensible thesis
narrative. The mapping is stated in the thesis itself (Chapter 2,
`Table: dsrm_chapter_mapping`) so an examiner never has to infer it.

Chapter numbering, titles, and ordering for Chapters 1-6 and 8-10 follow the
department's DSRM-thesis convention, cross-checked against Leonardo Cruz's
dissertation (IST, 2025, "Using Artificial Intelligence for Evaluating Student
Answers") - the reference example for this methodology at IST: Research
Methodology and Research Background as their own chapters before the review;
the review chapter titled plainly *Systematic Literature Review*, not "Related
Work"; a lean *Research Problem* chapter with no subsections; and objectives
folded into the *Research Proposal* chapter alongside Design & Development
(DSRM activities 2 and 3 together), rather than into the Problem chapter.
Chapter 7 (Apex) is this thesis's own addition, not present in that reference -
see "Two artefacts, not one" below for why it stays a separate chapter rather
than being folded into Chapter 6 the way the reference folds its single
artefact's design and implementation plan into one chapter.

| # | Chapter | DSRM activity | Status |
|---|---------|---------------|--------|
| 1 | Introduction | framing | **written** |
| 2 | Research Methodology | (SLR + DSRM description) | **written**, from PIC |
| 3 | Research Background | - | **written**, from PIC |
| 4 | Systematic Literature Review | Problem Identification | **written**, from PIC |
| 5 | Research Problem | Problem Identification | **written**, from PIC |
| 6 | Research Proposal | Objectives + Design & Development (method) | objectives written (from PIC), design outlined |
| 7 | Apex: The Reference Implementation | Design & Development (instantiation) | outlined |
| 8 | Demonstration | Demonstration | outlined |
| 9 | Evaluation | Evaluation | outlined |
| 10 | Conclusion | Communication + limitations/future work | outlined |

Appendix A - SLR corpus. Appendix B - evaluation instruments (SUS, NASA-TLX,
interview guides, raw scores). The reference dissertation has only the SLR
appendix, since its single evaluation instrument was live grading data rather
than standardised questionnaires; this thesis keeps Appendix B because SUS,
NASA-TLX, and the interview guides genuinely need to be reproduced.

### Two artefacts, not one

The framework (a *method*) and Apex (an *instantiation*) are both legitimate DSRM
artefacts, and both are produced by the Design & Development activity. Splitting
them into Chapters 6 and 7 is what lets the thesis claim *"the framework is
implementable"* (DRQ3) as a result rather than as an assumption, and to report
honestly which constructs did *not* survive implementation. Merging them would
make the framework look like documentation for a tool, which inverts the contribution.

### The interview history is evaluation, not a changelog

Feedback gathered while building Apex changed the *framework*, not only the tool
(a role was removed; a mandatory artefact became optional). That is formative
evaluation feeding back into design - exactly the iteration DSRM's arrows describe.
Chapter 7 §Design History should be written that way: each entry as
*observation → design change → rationale*, including changes rejected or reverted.
Written as a changelog it is filler; written as iteration it is methodology.

### SUS and NASA-TLX measure the tool, not the framework

This is the sharpest methodological point in the evaluation and Chapter 9 states it
up front rather than conceding it under questioning. A good SUS score for Apex is
**not** evidence that the framework is sound. Chapter 9 `Table: eval_instruments`
assigns each instrument to the artefact it actually evaluates:

- **Apex (instantiation)** → SUS, NASA-TLX
- **Framework (method)** → practitioner interviews, Agile-expert interviews,
  analytical assessment against pre-stated criteria
- **Both** → the demonstration

The study that produces this evidence is designed in `evaluation/`:
`EVALUATION-PLAN.md` (design, session timetable, analysis, missing bibliography
entries), `task-set.md`, `instrument-sus.md`, `instrument-nasa-tlx.md`,
`instrument-apex-ux.md`, `interview-guides.md`, `observer-sheet.md`,
`consent-and-briefing.md`. Those files are the source for Appendix B, which is
still four `\todo` prompts. Nothing has been administered yet.

Practical notes for when you run these:
- SUS is generally considered stable from ~12 respondents. Report the distribution,
  not just the mean, and interpret via the adjective/percentile bands rather than
  letting one number speak for itself.
- Report NASA-TLX **per subscale**, not only the aggregate. The subscale profile is
  the finding: a tool that raises mental demand while lowering frustration and effort
  tells a specific story about where the framework moves the burden.
- Administer both against an identical, defined task set across all participants.
- Pre-register what the demonstration will observe **before** running it. Otherwise
  the observations look selected after the fact to suit the artefact.

## Source material for the unwritten chapters

| Chapter | Draw from |
|---------|-----------|
| 6 - Research Proposal | `docs/framework/Apex-Framework-v2.docx` (authoritative; its §numbers are preserved in the chapter comments), `Apex-Framework-Grounding.docx` (citation trail, alternatives argument) |
| 7 - Apex | `Apex-Implementation-Report.docx` (architecture, testing, deployment, incident log), `Apex-Framework-v2.docx` §2, `docs/diagrams/architecture.puml`, `docs/diagrams/user-flow.puml` |
| 8 - Demonstration | not yet performed |
| 9 - Evaluation | not yet performed |

Diagrams still need rendering to `Images/` (PlantUML → PDF or PNG); the BPMN
`big-picture.bpmn` has no local renderer - see the verification technique noted in
project memory if it needs to become a figure.

## What was changed mechanically, and why

Carrying the SLR across was not a copy-paste; the following had to be corrected or
it would have been silently wrong in the thesis:

1. **Heading levels promoted.** It was a `\section` of an `article`; it is now a
   `\fancychapter` of a `report`, with everything below it moved up one level.
2. **Hardcoded cross-references converted to `\Cref`.** The source said "Table 5",
   which was correct in a flat article but points at the wrong table under
   chapter-based numbering, where the same table is Table 4.5. All 16 occurrences
   converted.
3. **Missing and duplicate labels fixed.** Seven tables had no `\label` at all;
   `tab:RQs` and `fig:placeholder` were each defined twice. `\Cref` cannot work
   against duplicate or absent labels.
4. **Figure paths rebased** on `./Images/`, and the five PIC images copied over.
5. **Bibliographies merged** - 32 SLR entries appended to the template's 62, no key
   collisions.
6. **Unescaped `&` in `.bib` journal names fixed** (14 of them, e.g. *ACM
   Transactions on Software Engineering & Methodology*). A bare `&` is an alignment
   tab; with IEEEtran this is a hard compile error. Fixed in both `.bib` files.

The template's lorem-ipsum example chapters are preserved unused in
`Chapters/Template-Examples/` - the template README recommends keeping them for
reference on packages and techniques.

## Build

```bash
cd IST_UL___MEIC_Thesis___Dissertação_final
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

Verified on the committed source, unpatched: **0 errors, 0 undefined references or
citations, 87 pages, A4.** The Portuguese resumo and Palavras Chave render with
correct accents and hyphenation, and all `\Cref` cross-references resolve under
chapter-based numbering (Tables 2.1, 4.1-4.12, 6.1, 9.1; Figures 2.1-2.2, 4.1-4.2).
`tab:rq_objective_mapping` (the RQ-to-objective mapping) now lives in Chapter 6
(Table 6.1), not Chapter 5, following the chapter restructuring described above.

Local builds need two TeX Live packages beyond a base install:

```bash
sudo apt install texlive-lang-portuguese texlive-science
```

Without the first, `babel` fails on the `portuguese` option; without the second,
`algorithm2e` is missing. Overleaf has both.

## Before submission

- [x] `Front_Cover.tex` - title, author and supervisors filled in from the PIC
      report; decorative cover image removed (IST logo kept, it is required).
- [ ] `Front_Cover.tex` - Examination Committee. Asked the supervisor
      2026-08-11; **answered 2026-08-15: the committee has NOT been assigned
      yet.** So there are no names to fill in, and this cannot close on our
      side - it has to be asked again once the school assigns the jury. Two
      sub-questions were not answered and should be re-asked at the same time:
      1. Whether the chairperson is named by the school rather than chosen, in
         which case that name arrives separately and later.
      2. Whether Hugo de Sousa carries an academic title on the cover. He is
         currently printed with no prefix, unlike `Prof. Miguel Mira da Silva`,
         and the cover renders `Supervisors: Prof. Miguel Mira da Silva /
         Hugo de Sousa`, which looks inconsistent if a title is in fact due.

      Until then `\finalthesis{false}` stays, which correctly suppresses the
      block. `\chairperson` and `\vogalone` still hold the template's literal
      placeholder names (`Prof. Name of the Chairperson`), so flipping the flag
      before the names are real would print those placeholders on the cover.
      Fill both, then set `\finalthesis{true}`, then rebuild and check page 1.
      This is now a waiting item, not a work item.
- [x] `Copyright.tex` - declaration extended with the acknowledgement of AI
      tool use. The Portuguese variant is translated and kept commented out
      alongside the English one, so switching language does not lose it.
- [ ] `Acknowledgments.tex` - still template text.
- [ ] `Glossary.tex` - still template entries (LaTeX/maths examples).
- [ ] Disable `todonotes` and `changes` markup for the delivered PDF (see template
      README §1). The 51 `\todo` prompts in Chapters 6-10 (12/11/9/15/4) are writing
      instructions, not content, and must all be gone by then - disabling the package
      hides them but does not mean the chapters are written.
- [x] EN vs PT main language: **English**, decided 2026-08-11. Already in
      effect (`Preamble_commands.tex`, `\usepackage[main=english,portuguese]{babel}`)
      and verified in the rendered PDF: cover, Acknowledgments heading, Contents,
      Acronyms and the degree line all render in English, while `PT-Resumo.tex`
      and `PT-PalavrasChave.tex` still typeset correctly in Portuguese via
      `\selectlanguage`. Nothing further to change.
- [ ] Re-check the recent/preprint citations flagged in the framework document's
      Honest Limitations before final submission - several are 2025-2026 preprints
      or vendor-reported figures and must be cited as such.
