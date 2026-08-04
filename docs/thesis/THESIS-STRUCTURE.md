# Thesis structure and writing roadmap

Working document for the MEIC-T dissertation. The LaTeX source lives in
`IST_UL___MEIC_Thesis___Dissertação_final/`; the PIC report it draws on lives in
`PIC_103641_Tomás_Taborda/` and is now a **source**, not a target — edit the thesis.

## Why this structure

DSRM prescribes six *activities*, not six chapters. The organisation below keeps a
1:1 readable mapping to those activities while staying a normal, defensible thesis
narrative. The mapping is stated in the thesis itself (Chapter 2,
`Table: dsrm_chapter_mapping`) so an examiner never has to infer it.

| # | Chapter | DSRM activity | Status |
|---|---------|---------------|--------|
| 1 | Introduction | framing | **written** |
| 2 | Research Methodology | (SLR + DSRM description) | **written**, from PIC |
| 3 | Research Background | — | **written**, from PIC |
| 4 | Related Work (SLR) | Problem Identification | **written**, from PIC |
| 5 | Research Problem and Objectives | Problem Identification + Objectives | **written**, from PIC |
| 6 | The Proposed Framework | Design & Development (method) | outlined |
| 7 | Apex: The Reference Implementation | Design & Development (instantiation) | outlined |
| 8 | Demonstration | Demonstration | outlined |
| 9 | Evaluation | Evaluation | outlined |
| 10 | Conclusion | Communication + limitations/future work | outlined |

Appendix A — SLR corpus. Appendix B — evaluation instruments (SUS, NASA-TLX,
interview guides, raw scores).

### Two artefacts, not one

The framework (a *method*) and Apex (an *instantiation*) are both legitimate DSRM
artefacts, and both are produced by the Design & Development activity. Splitting
them into Chapters 6 and 7 is what lets the thesis claim *"the framework is
implementable"* (RQ-C) as a result rather than as an assumption. Merging them would
make the framework look like documentation for a tool, which inverts the contribution.

### The interview history is evaluation, not a changelog

Feedback gathered while building Apex changed the *framework*, not only the tool
(a role was removed; a mandatory artefact became optional). That is formative
evaluation feeding back into design — exactly the iteration DSRM's arrows describe.
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
| 6 — Framework | `docs/framework/Apex-Framework-v2.docx` (authoritative; its §numbers are preserved in the chapter comments), `Apex-Framework-Grounding.docx` (citation trail, alternatives argument) |
| 7 — Apex | `Apex-Implementation-Report.docx` (architecture, testing, deployment, incident log), `Apex-Framework-v2.docx` §2, `docs/diagrams/architecture.puml`, `docs/diagrams/user-flow.puml` |
| 8 — Demonstration | not yet performed |
| 9 — Evaluation | not yet performed |

Diagrams still need rendering to `Images/` (PlantUML → PDF or PNG); the BPMN
`big-picture.bpmn` has no local renderer — see the verification technique noted in
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
5. **Bibliographies merged** — 32 SLR entries appended to the template's 62, no key
   collisions.
6. **Unescaped `&` in `.bib` journal names fixed** (14 of them, e.g. *ACM
   Transactions on Software Engineering & Methodology*). A bare `&` is an alignment
   tab; with IEEEtran this is a hard compile error. Fixed in both `.bib` files.

The template's lorem-ipsum example chapters are preserved unused in
`Chapters/Template-Examples/` — the template README recommends keeping them for
reference on packages and techniques.

## Build

```bash
cd IST_UL___MEIC_Thesis___Dissertação_final
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

Verified: **0 errors, 0 undefined references or citations, 85 pages.**

Two caveats about local builds:
- This machine lacks `texlive-lang-portuguese`, so `babel` fails on the
  `portuguese` option. Overleaf has it. Verification here was done on a scratch
  copy patched to English-only; the committed source is unchanged and correct.
- This machine also lacks `algorithm2e`. Same story — fine on Overleaf.

## Before submission

- [ ] `Front_Cover.tex` — name, title, supervisors, degree, date; set
      `\finalthesis{true}` and add the committee only after approval.
- [ ] `Acknowledgments.tex` — still template text.
- [ ] `Glossary.tex` — still template entries (LaTeX/maths examples).
- [ ] Disable `todonotes` and `changes` markup for the delivered PDF (see template
      README §1). Every `\todo` in Chapters 6–10 is a writing prompt and must be
      gone by then.
- [ ] Decide EN vs PT as main language in `Preamble_commands.tex`.
- [ ] Re-check the recent/preprint citations flagged in the framework document's
      Honest Limitations before final submission — several are 2025–2026 preprints
      or vendor-reported figures and must be cited as such.
