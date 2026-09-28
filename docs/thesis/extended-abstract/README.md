# Extended Abstract (resumo alargado)

IST/MEIC-T requires a second deliverable alongside the dissertation: an
extended abstract in the form of a scientific/technical article, up to 10 A4
pages, in English (Guia de Preparação da Dissertação; see
`docs/thesis/REGULATIONS.md` Section 2). It carries 20 per cent of the final
mark, the same weight as the entire public discussion. This directory is that
deliverable, as a scaffold.

## Format decision - ACM `acmart`, not the IST dissertation template

`docs/thesis/REGULATIONS.md` previously concluded, from the guide's fallback
clause alone, that the extended abstract should use the IST dissertation
template. **That conclusion was wrong and has been corrected** (dated
2026-08-19, see the "CORRECTED 2026-08-19" note in `REGULATIONS.md` Section 2).
The evidence is two files supplied directly for this task:

- `~/Downloads/110851_leonardo_cruz_resumo.pdf` - Leonardo Cruz's actual,
  accepted extended abstract. Same degree (MEIC), same supervisor (Prof.
  Miguel Mira da Silva), October 2025. It is not written in the IST
  dissertation template; it is a five-page **ACM `acmart` two-column**
  article, with an ACM abstract/CCS-concepts/keywords block, an "ACM
  Reference Format" line, and ACM-Reference-Format-style numbered citations.
- `~/Downloads/extended_abstract_template.pdf` - the ACM `acmart` sample
  article ("The Name of the Title Is Hope"), confirming the class and its
  standard front matter.

Observed MEIC practice under this supervisor is therefore ACM format, not the
dissertation template the guide's fallback clause would otherwise default to.
This scaffold follows that precedent. See `REGULATIONS.md` Section 2 for the
full correction, including the guide's fallback text kept verbatim as the
regulation's own wording.

## What was analysed in Cruz's abstract (the actual model)

Extracted with `pdftotext -layout` and read in full (5 pages, ACM `sigconf`
two-column, no ACM copyright/DOI/ISBN block, "MSc Thesis Summary, Lisbon,
Portugal" as the venue line). Section structure and approximate space budget,
measured against the rendered PDF pagination, not against the ACM template's
filler content:

| Cruz's section | Approx. share of the 5 pages |
|---|---|
| Title/Abstract/CCS Concepts/Keywords/ACM Reference Format | front matter, under half a page |
| 1 Motivation and Problem Statement | roughly half a page, one boxed italic research question |
| 2 Methods: SLR + DSRM | a short paragraph, well under a quarter page |
| 3 Artifact Overview (3.1 Scope, 3.2 Output Contract, 3.3 Architecture, 3.4 Model Policy/Cost) | his single largest section, well over a page, with a one-figure pipeline diagram |
| 4 Evaluation Setting and Metrics | a short paragraph |
| 5 Results: Accuracy, Rank, Shape (5.1-5.3) | over a page, two figures (case-mean and MAD-by-case charts) plus one OLS-parity table |
| 6 Behavior with Transparency | short, one figure |
| 7 Operational Performance, Cost, GDPR | short paragraph |
| 8 Student Perceptions and Qualitative Insights (8.1-8.3) | close to a page, one figure, one aggregation-rule table |
| 9 Threats to Validity and Limitations | one short paragraph |
| 10 Decision Guide for Adoption (10.1-10.4) | four short subsections, a few lines each |
| 11 Model Drift, Revalidation, Reproducibility | one short paragraph |
| Conclusion | one short paragraph |
| References | 8 entries, dense two-column list |
| 12 Expanded Analysis Details (appendix-like) | one table, tail end of page 5 |

Takeaways that shaped this scaffold, not the ACM sample's content:

- **The framework/artefact-description section is the single biggest block**
  (his Section 3), heavier than any individual results section. Section 4 of
  this scaffold ("Proposed Framework") is sized the same way.
- **Tables carry most of the density**, not prose. Cruz has three tables
  (OLS-parity fits, survey aggregation rule, per-case mean/MAD) and only one
  conceptual pipeline figure; the rest of his five figures are small bar/line
  charts summarising a results table that is also given in prose. This
  scaffold follows the table-first pattern (one condensed phase-mapping
  table) rather than committing to figures that do not exist yet.
- **Methods (SLR + DSRM) is intentionally terse** - a few sentences, not a
  section in its own right competing for space. Mirrored here as Section 2.
- **References are lean relative to the underlying work**: 8 entries compress
  a full dissertation. This thesis carries more grounding citations in its
  framework chapter (about 20) because the framework's Positioning Against
  Alternatives section depends on naming specific precedent (AI-DLC, the
  Spotify Model, NIST AI RMF, ISO/IEC 42001); this scaffold currently cites
  30 keys, all reused verbatim from the thesis's own bibliography, none
  invented.
- **Compression technique**: Cruz's §3 (Artifact Overview) and §5 (Results)
  read like a dissertation abstract's method/results sections rewritten at
  paragraph granularity rather than chapter granularity - one paragraph per
  dissertation subsection, with numbers kept and connecting prose cut. The
  same technique is applied to Chapter 6 in `main.tex` Section 4.

## Page budget for this scaffold (drafted vs. results-dependent)

10-page hard ceiling; Cruz landed at 5; this scaffold targets **6 to 8** once
results exist, per the task's guidance. Current compiled length is **7
pages** (see "Verified build result (2026-09-23)" below): Chapters 7, 8, 9
and 10 of the dissertation all now have real content to draw from, so every
section, including Section 8's synthesis paragraph, is drafted for real
rather than as a placeholder.

| Section | Status | Approx. current share |
|---|---|---|
| Abstract + Keywords | Drafted; headline result now stated (constructs realised/proxy/partial, SUS, NASA-TLX), with the demonstration/synthesis gap named explicitly | front matter |
| 1 Motivation and Problem Statement | Drafted from Chapter 1 + Chapter 5; staleness-checked against current Chapters 1/4/6, unchanged | about 3/4 column |
| 2 Research Methodology | Drafted from Chapter 2; staleness-checked, unchanged | about 1/4 column |
| 3 Related Work (SLR findings) | Drafted from Chapter 4's Discussion + Chapter 3; staleness-checked against the corrected SLR funnel (117 duplicates, not 227), no stale number was actually present here to begin with | about 1/2 column |
| 4 Proposed Framework (4.1-4.5) | Drafted from Chapter 6 in full, including the phase table; staleness-checked against current Chapter 6 (8 principles, 6 phases, Trio/hats, 5 gates, 3 metrics, Siddeeq figures), unchanged | the largest section, over a page, mirroring Cruz's §3 |
| 5 Reference Implementation: Apex | **Drafted from Chapter 7**: the five architecture properties, a condensed DRQ3 construct-mechanism outcome count (10 realised / 1 proxy / 1 partial), the Spec-Anchored Continuity file-taxonomy liberty, and the practitioner-feedback design history | new, about a page |
| 6 Demonstration, Evaluation Design, and Results | Design paragraph updated to name the two-settings-plus-abandoned-third framing; results drafted from Chapter 9 (participants, SUS, NASA-TLX, UX trust-calibration pair and lost gate-comprehension measure, analytical assessment); closing paragraph **now also reports the completed Outfolio demonstration** from Chapter 8/9's real numbers (nine days, six to nine epics, fifty stories, the three governance metrics), replacing the earlier "remains unwritten pending fieldwork" framing | about a page |
| 7 Discussion and Threats to Validity | Drafted from Chapter 9's Discussion/Threats and Chapter 8's researcher-role and abandoned-partner threats: DRQ1/2/4 answered from Chapter 9, DRQ3 from Chapter 7's mapping; the demonstration boundary now states plainly that Outfolio was observed (solo, one setting) rather than that no fieldwork happened at all | about 3/4 column |
| 8 Conclusion | Intro paragraph tightened to the current contribution counts; synthesis paragraph **now drafted for real** from Chapter 10's Summary/Limitations/Communication content (headline DRQ synthesis, the three carried-forward limitations, the SLR/abstract/defence dissemination status), replacing the placeholder entirely | about 3/4 column |
| References | 33 entries (30 plus Martins:2015SUS, Lewis:2009SUS, J.Pries-Heje:2008SD, added for the Section 6 results), all reused verbatim from the thesis bibliography | - |

No placeholders remain. Section 8's synthesis paragraph, the last one, was
replaced with real prose on 2026-09-23 once Chapter 8's fieldwork and
Chapter 10's own drafting both existed; see "Verified build result
(2026-09-23)" below. Every section is now drafted from real, current
dissertation content.

## Build

The source file is still `main.tex`; the compiled output is renamed via
`-jobname` (2026-09-27, same pattern as the dissertation's own
`ist1103641-tomas-taborda-dissertacao.pdf`), so the tracked PDF is
`ist1103641_TomasTaborda_resumo.pdf`, not `main.pdf`.

```bash
cd docs/thesis/extended-abstract
pdflatex -interaction=nonstopmode -jobname=ist1103641_TomasTaborda_resumo main.tex
bibtex ist1103641_TomasTaborda_resumo
pdflatex -interaction=nonstopmode -jobname=ist1103641_TomasTaborda_resumo main.tex
pdflatex -interaction=nonstopmode -jobname=ist1103641_TomasTaborda_resumo main.tex
```

`acmart.cls` is present on this system (`kpsewhich acmart.cls` resolves to
`/usr/share/texlive/texmf-dist/tex/latex/acmart/acmart.cls`), so no manual
install was needed here. If it is ever missing on a different machine (TeX
Live on Linux):

```bash
tlmgr install acmart
# acmart pulls in a number of dependencies (booktabs, xstring, etc.); if
# tlmgr reports any of those missing too:
tlmgr install booktabs xstring comment totpages textcase environ trimspaces
```

On a Debian/Ubuntu system without `tlmgr` configured for user-level installs,
the equivalent is `sudo apt install texlive-publishers` (acmart ships inside
the `texlive-publishers` collection), then re-run `kpsewhich acmart.cls` to
confirm.

### Verified build result (2026-08-19)

- **Page count: 5** (well under the 10-page ceiling; see budget table above
  for why this is expected to grow, not shrink dramatically, once results
  land).
- **LaTeX errors: 0.**
- **Undefined references: 0.** **Undefined citations: 0.** (Both checked via
  `grep -i undefined main.log` after a full `pdflatex` -> `bibtex` ->
  `pdflatex` -> `pdflatex` cycle; the first `pdflatex` pass alone reports
  undefined citations/labels as expected before `bibtex`/the second pass
  resolve them, which is normal and not an error.)
- **Dash check** (`pdftotext main.pdf - | grep -P "[\x{2013}\x{2014}]"`):
  **8 matches, all inside the auto-generated References list** (BibTeX's
  `ACM-Reference-Format.bst` renders a page range such as `114-123` from the
  `pages` field using the Unicode U+2013 dash character, per standard
  bibliographic typographic convention). **No en or em dash appears anywhere
  in the authored prose** (Sections 1-8, the abstract, the table). This is
  not a new problem introduced here: the main dissertation's own compiled
  PDF (`IST_UL___MEIC_Thesis___Dissertação_final/ist1103641-tomas-taborda-dissertacao.pdf`,
  `IEEEtran` style) has the identical pattern for citation-range compression, already
  unaddressed. Flagged rather than silently worked around; see the
  final report for this task for the explicit call-out. A fix, if wanted,
  would mean patching or replacing the `.bst` file to force a literal hyphen
  in ranges, which was not done here since it touches bibliography
  generation code, not this document's own content, and the same fix would
  then need making twice (`IEEEtran.bst` for the thesis, `ACM-Reference-
  Format.bst` here).

### Verified build result (2026-09-15)

Sections 5-8 rewritten from the now-real Chapters 7 and 9 (Chapter 7 fully
written, Chapter 9 fully written with N=13 evaluation data since
2026-09-13); Section 8's synthesis paragraph deliberately kept as a
placeholder since Chapter 8's Application/Observations/Summary and Chapter
10 are still genuinely unwritten in the dissertation. Full rebuild cycle
(`pdflatex` -> `bibtex` -> `pdflatex` -> `pdflatex`) from this directory.

- **Page count: 7** (up from 5; still 3 pages of headroom under the 10-page
  ceiling, and within the 6-8 page target this scaffold set for itself once
  results existed).
- **LaTeX errors: 0.**
- **Undefined references: 0. Undefined citations: 0.** (`grep -i undefined
  main.log` empty after the full cycle.)
- **Dash check** (`pdftotext main.pdf - | grep -P "[\x{2013}\x{2014}]"`):
  **10 matches, all inside the auto-generated References list** (the same
  `ACM-Reference-Format.bst` page-range rendering behaviour described below;
  the count rose from 8 to 10 only because three bibliography entries were
  added, not because any dash appeared in authored prose). No en or em dash
  appears anywhere in Sections 1-8, the abstract, or the table.
- **References**: three entries added, copied verbatim from the thesis
  bibliography (`Martins:2015SUS`, `Lewis:2009SUS`, `J.Pries-Heje:2008SD`),
  needed for the Section 6 SUS sub-scale and Portuguese-validation results.
  No entry was invented; all three are cited in the current Chapter 9 text
  this section draws from.
- **Fact-checking against current dissertation text**: every number in
  Sections 5-7 (the 10/1/1 construct-outcome split, the 44-story spec-drift
  cascade, SUS 56.73/grade D, the English/Portuguese sub-means, the NASA-TLX
  21.5 aggregate and subscale profile, the 13-participant sample breakdown,
  the analytical assessment's 2 met/3 partially met split) was read from the
  current text of `Chapter_7-Apex.tex` and `Chapter_9-Evaluation.tex` in this
  same pass, not carried over from an earlier draft or from
  `docs/thesis/evaluation/ch9-analytical-data.md`. The SLR duplicate-count
  figure (117, not the old 227) was checked against `Chapter_4-SLR.tex` and
  was already absent from this document's own Section 3, so no correction
  was needed there. The dissertation's renamed compiled PDF
  (`ist1103641-tomas-taborda-dissertacao.pdf`) was already the only filename
  referenced in this README; `main.tex` does not reference the dissertation's
  own PDF filename at all, so nothing needed fixing there either.

### Verified build result (2026-09-23)

Chapters 8 (Demonstration) and 10 (Conclusion) of the dissertation are now
both fully written from real fieldwork and evaluation data. Five targeted
edits followed: the abstract's closing clause, Section 6's closing
paragraph, Section 7's boundary paragraph, and Section 8's synthesis
paragraph were all updated to report the completed Outfolio demonstration
(nine calendar days, six to nine epics, fifty stories, none abandoned;
Context Traceability Rate 92.6 per cent, Spec Conformance 98.65 per cent, AI
Defect Escape Rate 1.85 per cent; the Testing Gate and stale-context
findings) in place of the earlier "remains unwritten pending fieldwork"
framing, while keeping the genuine remaining limitation, that Outfolio is
still a single operator in a single setting and no independent partner
organisation was observed, stated explicitly rather than dropped. Section
8's `\placeholder{}` block was deleted and replaced with three real
paragraphs: a headline DRQ synthesis, the three limitations Chapter 10
names, and the dissemination status of the SLR article, this extended
abstract and the defence per the dissertation's Communication activity. No
other section was touched. Full rebuild cycle (`pdflatex` -> `bibtex` ->
`pdflatex` -> `pdflatex`) from this directory.

- **Page count: 7** (unchanged from 2026-09-15; still within the 6-8 target
  and 3 pages under the 10-page ceiling).
- **LaTeX errors: 0. Undefined references: 0. Undefined citations: 0.**
- **Dash check**: all matches for `[\x{2013}\x{2014}]` in the rendered PDF
  fall inside the auto-generated References list (the same
  `ACM-Reference-Format.bst` page-range rendering already described above);
  none in authored prose, none introduced by this pass.
- **Fact-checking**: every number added (Outfolio's epic/story/day counts,
  the three governance-metric values, the Testing Gate and destructive-
  command findings) was taken from the current text of
  `Chapter_8-Demonstration.tex` and `Chapter_9-Evaluation.tex`'s
  `sec:results_demonstration`, and the DRQ synthesis, limitations and
  Communication content from the current text of `Chapter_10-Conclusion.tex`,
  not carried over from an earlier draft.

### Verified build result (2026-09-27)

The main dissertation went through a major cutting/editing pass on 2026-09-24
(`docs/thesis/REGULATIONS.md` `\S`1a-nonies, an agent-driven real-material cut,
then `\S`1a-decies, Tomás's own manual pass on Overleaf that superseded it as
the new baseline) that changed several numbers and findings this scaffold
draws from. Every fact in `main.tex` was re-checked against the current text
of `Chapter_1-Introduction.tex`, `Chapter_4-SLR.tex`, `Chapter_6-Proposal.tex`,
`Chapter_7-Apex.tex`, `Chapter_8-Demonstration.tex`, `Chapter_9-Evaluation.tex`
and `Chapter_10-Conclusion.tex`, not carried over from the 2026-09-23 pass.

Four discrepancies were found and fixed, all in the body text (the abstract
and keywords were already accurate and needed no change):

- **Design Principles count and naming (Section 4.1).** The cutting pass
  merged Chapter 6's "Hats, Not People" into "Explicit Responsibility and
  Accountability" as a single renamed principle, "Functional, Not Positional,
  Accountability", reducing the framework from eight principles to seven; this
  scaffold still said "Eight principles" and listed the two merged names
  separately. Before: `Eight principles, ... Hats, Not People; Explicit
  Responsibility and Accountability; Risk-Proportional...`. After: `Seven
  principles, ... Functional, Not Positional, Accountability;
  Risk-Proportional...`.
- **Jira adapter status (Section 5).** Chapter 7 now states the Jira adapter
  "was started but left incomplete once it became clear Taiga and Plane were
  the priority targets", a genuine correction made during the manual pass
  (previously it read as completed). This scaffold's architecture paragraph
  said the project-management adapter was "built against one tool first and
  extended to two more behind one interface", implying both Plane and Jira
  were finished. Before: `built against one tool first and extended to two
  more behind one interface`. After: `built against one tool first and
  extended behind the same interface to a second, with a third started but
  left incomplete`.
- **Siddeeq epic-organisation figures (Section 4.4, Governance Mechanisms).**
  Chapter 6's Work Organisation section was compressed during the cutting pass
  from a specific reported result (107 requirements; correctness 4.61 against
  4.14 of 5; completeness 4.31 against 3.50) to a qualitative statement
  ("supported by evidence of higher correctness and completeness than
  requirement-level decomposition"); this scaffold still carried the old,
  more specific figures, which no longer appear anywhere in the current
  dissertation text. Before: `across 107 requirements, an epic-organised
  generation pipeline outperformed a requirement-aligned baseline on
  expert-rated correctness (4.61 against 4.14 of 5) and completeness (4.31
  against 3.50)~\cite{Siddeeq:2026gh}`. After: `by evidence of higher
  expert-rated correctness and completeness than requirement-level
  decomposition~\cite{Siddeeq:2026gh}`.
- **Recruitment attribution (Section 6, Participants).** Chapter 9 now
  attributes recruitment to "the author's own professional and personal
  connections", a deliberate, confirmed-correct change from the earlier
  "supervisor's own professional connections" wording; this scaffold still
  said "the supervisor's own professional network". Before: `Participants
  were recruited through the supervisor's own professional network`. After:
  `Participants were recruited through the author's own professional and
  personal connections`.

Everything else checked out unchanged against the current chapter text: the
10/1/1 construct-outcome split (DRQ3), the SUS mean (56.73, grade D) and its
English/Portuguese sub-means (60.50/44.17), the Usability/Learnability
sub-scale split (59.86/44.23), the NASA-TLX grand aggregate (21.5/100) and its
subscale profile (mental demand 29.1 highest, frustration 16.7 among the
lowest), the two heaviest and lightest NASA-TLX tasks, the 2-met/3-partially-met
analytical assessment, the "44 stories flagged at once" spec-drift figure, the
Outfolio numbers (nine calendar days, six to nine epics, fifty stories, none
abandoned, Context Traceability Rate 92.6 per cent, Spec Conformance 98.65 per
cent, AI Defect Escape Rate 1.85 per cent), the Testing Gate and destructive-
command findings, the Future Work item count (six, referenced only implicitly
via the limitations this scaffold's Conclusion draws on, not enumerated by
number in `main.tex`), and the SLR dissemination status in Chapter 10's
Communication section ("submission was deferred... target venue remains to be
selected", consistent with this scaffold's "in preparation, with its target
venue still to be finalised"). No stale "unwritten"/"pending" placeholder
language was found anywhere in `main.tex`; Chapters 8 and 10 have been fully
written and heavily edited multiple times since the 2026-09-15 pass, and this
scaffold's Sections 6 and 8 already reflected that as of the 2026-09-23 pass.

- **Page count: 7** (unchanged from 2026-09-15/2026-09-23; still within the
  6-8 page target and 3 pages under the 10-page ceiling).
- **LaTeX errors: 0. Undefined references: 0. Undefined citations: 0.**
  (`grep -i undefined main.log` empty after the full `pdflatex` -> `bibtex` ->
  `pdflatex` -> `pdflatex` cycle.)
- **Dash check** (`pdftotext main.pdf - | grep -P "[\x{2013}\x{2014}]"`): 10
  matches, all falling after the "REFERENCES" heading in the rendered text
  (confirmed by line number against `grep -n "^REFERENCES$"`), i.e. all inside
  the auto-generated References list (the same `ACM-Reference-Format.bst`
  page-range rendering behaviour described above). No en or em dash appears
  anywhere in Sections 1-8, the abstract, or the table; none introduced by
  this pass's edits.
- **No emoji** in any edited text (visual check of the four changed passages).
- Each of the four edits was independently confirmed rendered correctly in
  the compiled PDF via `pdftotext` fragment matching, not just checked in the
  `.tex` source.

### Known LaTeX issue found and worked around

An initial version used the `todonotes` package (`\todo[inline]{...}`, the
same convention already used for the dissertation's own skeleton chapters,
e.g. `Chapter_7-Apex.tex`) for the results-pending placeholders. It compiled
the earlier, shorter sections fine but **fatally failed with `! LaTeX Error:
Float(s) lost.`** once enough content existed to make `acmart`'s end-of-
document `\balance` call (which balances the last page's two columns) do
real work, with no PDF produced. Bisected by truncating `main.tex` section by
section: the error reproduces with a single `todonotes` inline box added to
an otherwise-working multi-page two-column `acmart` document, independent of
this scaffold's own table or content, so it is a `todonotes`/`balance`
interaction, not a mistake in the drafted prose. Worked around by dropping
`todonotes` entirely and defining a two-line dependency-free `\placeholder{}`
command in the preamble instead. If `todonotes` is wanted back later (e.g.
for margin notes during review), keep it away from inline boxes in the
sections nearest the bibliography, or test a full clean build after adding
it back.

### Figures and table added (2026-09-27, same day as the build result above)

Tomás asked for the scaffold to stop being text-only, matching Cruz's own
precedent of carrying density through tables/figures rather than prose alone
(already noted under "What was analysed in Cruz's abstract" above). Before
this pass the scaffold had exactly one table (`tab:phases`) and zero figures
despite 3 pages of headroom under the 10-page ceiling.

Added, all sourced from the dissertation's own material, none newly drawn:

- **`Images/` subfolder**, new to this scaffold (it previously had none of its
  own), holding copies of two PNGs from
  `../IST_UL___MEIC_Thesis___Dissertação_final/Images/`: `lifecycle-diagram.png`
  and `demo-apex-phase5-deployment-gate.png`. Copied rather than referenced by
  relative path outside this directory, since this scaffold is periodically
  zipped standalone for Overleaf upload and a `../` path would break outside
  the zip's own root.
- **Figure 1** (`fig:lifecycle`, Section 4.2, spans both columns via
  `figure*`): the six-phase lifecycle diagram, the same one used as Figure 6.1
  and the cover diagram in the dissertation itself. Cross-referenced from the
  Lifecycle Phases paragraph alongside the existing `tab:phases`.
- **Table 2** (`tab:constructs`, Section 5): a new compact table condensing
  the twelve-construct DRQ3 mapping (10 realised / 1 proxy / 1 partial) that
  Section 5's prose already states in full sentences; the table adds a
  scannable summary, it does not replace the prose.
- **Figure 2** (`fig:deployment-gate`, Section 5): a real Apex screenshot of
  the Deployment Gate (delta verdict, deploy pack, traceability matrix, human
  gatekeeper sign-offs), cross-referenced from Section 4.4's quality-gates
  sentence.

Rebuilt (`pdflatex` -> `bibtex` -> `pdflatex` -> `pdflatex`) after the change:

- **Page count: 7** (unchanged - the added float content did not push a new
  page; still 3 pages under the 10-page ceiling).
- **LaTeX errors: 0. Undefined references: 0.**
- **Dash check**: unchanged, still only the pre-existing bibliography
  page-range matches after "REFERENCES".
- Both figures and both tables visually inspected in the rendered PDF at
  their assigned width and confirmed legible.

### Sections 5-7 rearranged into bullets and tables (2026-09-27, same day)

Tomás asked for more variety in Sections 5 (Reference Implementation), 6
(Demonstration/Evaluation) and 7 (Discussion/Threats), which were mainly
dense prose, taking the dissertation's own tables as the example. No fact
was added or removed; every bullet and table cell condenses text that was
already in the prose (checked against the pre-edit `.tex`), and the
surrounding prose was trimmed only where it would otherwise repeat a number
now sitting in a table cell, matching how the dissertation itself pairs a
table with explanatory prose rather than one replacing the other.

Added:

- **Section 5**: the five-architectural-properties paragraph became an
  `itemize` (mirroring `Chapter_7-Apex.tex`'s own bulleted properties list);
  Table 2 (`tab:constructs`) expanded from a 3-row status-grouped table to
  the full 12-row construct/outcome table (mirroring `tab:apex_mapping`'s
  Construct/Outcome columns); the two framework-level changes and three
  tool-level reversals became a 5-item `itemize`.
- **Section 6**: a new Table 3 (`tab:instruments`, mirrors
  `tab:eval_instruments`) states which instrument evaluates which artefact;
  the participant-demographics paragraph became a 4-item `itemize`; a new
  Table 4 (`tab:sus_tlx`) summarises the SUS/NASA-TLX numbers the prose
  around it used to spell out sentence by sentence; the analytical
  assessment's five criteria (previously one sentence naming ratings) became
  Table 5 (`tab:analytical`, mirrors `tab:analytical` in the dissertation,
  condensing each row's real justification rather than inventing one); the
  Outfolio governance-export numbers became a 3-item `itemize`.
- **Section 7**: the four-DRQ paragraph (previously four inline `\textbf{}`
  labels run together) became Table 6 (`tab:drq`, DRQ/Verdict), with the two
  interview-derived qualifications that do not fit a table cell kept as
  trailing prose; the four validity-type paragraph became a 4-item
  `itemize`.

One real build fix needed: `\usepackage{enumitem}` was missing from the
preamble, so the first compile after adding `itemize` environments with
`[leftmargin=..., itemsep=...]` optional arguments failed with a cascade of
`! LaTeX Error: Something's wrong--perhaps a missing \item.` (plain LaTeX
`itemize` does not accept that optional argument at all; without `enumitem`
loaded, the parser desyncs from the first such environment onward). Added
`\usepackage{enumitem}` next to the existing `booktabs`/`cleveref`/`float`
lines; the same fix the dissertation's own preamble already carries.

Rebuilt (`pdflatex` -> `bibtex` -> `pdflatex` -> `pdflatex`):

- **Page count: 8** (up from 7; the added floats' own spacing overhead cost
  one page, still 2 pages under the 10-page ceiling).
- **LaTeX errors: 0** (after the `enumitem` fix). **Undefined references: 0.**
- **Dash check**: 10 matches, all after the "REFERENCES" heading (confirmed
  by line number), same as every prior pass.
- All six tables and both figures visually inspected page by page in the
  rendered PDF and confirmed legible and correctly numbered.

### Full reanalysis against the current dissertation + PDF renamed (2026-09-27)

Tomás asked whether the scaffold is "on pair" with the dissertation and to
rename the compiled output to `ist1103641_TomasTaborda_resumo.pdf`. No thesis
chapter had changed since the last full audit (`7fac3e0`), so this was a
fact-by-fact spot check of every claim carried over this session's edits,
cross-read against the current `.tex` chapter files rather than against
memory of an earlier read:

- Motivation statistics (§1): 84/76 per cent, 40/29 per cent, 90 per cent,
  61/10.5 per cent, 45 per cent OWASP, 72 per cent Java, 55.8 per cent, 19/20
  per cent, 1,255 teams, 98/91 per cent - all verified verbatim against
  `Chapter_1-Introduction.tex` and `Chapter_6-Proposal.tex`.
- Seven Design Principles: names and order verified identical against
  `tab:principles` in `Chapter_6-Proposal.tex`.
- Six lifecycle phases and gate names (Table 1): verified identical against
  `Chapter_6-Proposal.tex`'s own phase-mapping table.
- Twelve mapped constructs and their outcomes (Table 2): verified row by row
  against `tab:apex_mapping` in `Chapter_7-Apex.tex` - all twelve names and
  all twelve outcomes (ten realised, one proxy, one partial) match exactly.
- Participant demographics, SUS/NASA-TLX numbers, the analytical-assessment
  table, the Outfolio governance numbers, the Testing Gate and
  destructive-command findings, and the Conclusion's dissemination
  paragraph: all verified verbatim or faithfully condensed against
  `Chapter_8-Demonstration.tex`, `Chapter_9-Evaluation.tex` and
  `Chapter_10-Conclusion.tex`.

**One real drift found and fixed.** The Section 5 reversals list (added this
session) named one tool-level change as "an OAuth-based integration reverted
in favour of a simpler token" - accurate against the project's real history,
but the word "OAuth" no longer appears anywhere in the current dissertation
text: `Chapter_7-Apex.tex`'s own account of that reversal was compressed
during the manual editing pass to a generic description with no product name
attached (`grep -rn "OAuth" *.tex` returns zero matches dissertation-wide).
Carrying a named detail the dissertation itself no longer states broke
pair-parity, so the item was reworded to mirror the dissertation's own
current, generic phrasing: "An authentication flow requiring an
operator-registered application and backend-held secret was reverted for
conflicting with Apex's zero-configuration deployment model." No other
discrepancy was found across the sections checked.

**PDF renamed.** The compiled output is now
`ist1103641_TomasTaborda_resumo.pdf`, produced via `-jobname` from the same
`main.tex` source (identical pattern to the dissertation's own
`ist1103641-tomas-taborda-dissertacao.pdf` rename); see "Build" above for the
updated commands. The old `main.pdf` was removed from git tracking; `main.tex`
is unchanged as the canonical source filename.

Rebuilt with the new jobname: page count unchanged at 8, 0 errors, 0
undefined references, dash sweep unchanged (10 matches, all after the
References heading, which itself now also renders in title case rather than
all caps, since ACM's `\refname` heading uses the same `\@secfont` this
session's caps fix already overrode).

### Running header matching Leonardo Cruz's precedent, and a font-package environment fix (2026-09-28)

Tomás asked for the same per-page running header his supervisor's other
advisee (Leonardo Cruz) used: title top-left, venue line top-right on odd
pages; venue line top-left, "Taborda, Mira da Silva, and de Sousa" top-right
on even pages; nothing on page 1. Read Cruz's actual accepted PDF
(`110851_leonardo_cruz_resumo.pdf`) directly to confirm the exact mechanism
rather than guessing from the `acmart.cls` source alone.

**Two wrong attempts before the real fix, both caused by guessing without a
working compiler** (a missing `texlive-fonts-extra` install meant `libertine`/
`newtxmath`, both required by `acmart`, silently fell back to Computer Modern
and then fatally errored under `acmart`'s font-expansion setup - confirmed on
a byte-identical unmodified copy, so not caused by any edit; fixed by Tomás
running `sudo apt-get install -y texlive-fonts-extra`):

1. First attempt manually forced the same two strings into all four header
   corners via `\fancyhead[LO,LE]{...}\fancyhead[RO,RE]{...}` after
   `\maketitle`, based on a wrong assumption from the class source (that
   `\shorttitle` sits top-left on every page) rather than Cruz's real,
   alternating pattern. Result: the untrimmed full title collided with the
   forced venue string on every page - illegible.
2. Second attempt added `\renewcommand`-less `\shorttitle{...}` after
   `\title{...}`, plus `\acmConference[...]` and a longer `\shortauthors`,
   removing `nonacm=true` to let `acmart`'s native alternating header render
   (the right mechanism). But `\shorttitle{ARG}` was the wrong syntax:
   probed with `\show\shorttitle` once the compiler was fixed and confirmed
   `\title{...}` itself auto-defines `\shorttitle` as a *zero-argument*
   macro holding the full title, so calling it with a brace-argument just
   printed the full title followed by the literal argument text as plain
   document content, right in the title block - the visible "doubled title"
   bug, plus header text incorrectly appearing on page 1.

**The real fix**, verified by compiling (the earlier two were not, and both
were wrong):

- `\documentclass[sigconf,review=false]{acmart}` - dropped `nonacm=true`.
  Traced in `acmart.cls`: `nonacm` is what suppresses the native alternating
  venue-line header; the ACM copyright/DOI/ISBN suppression this project
  wants is independently controlled by `\setcopyright{none}`,
  `printacmref=false` and the existing `\renewcommand\footnotetextcopyrightpermission[1]{}`,
  none of which depend on `nonacm` - confirmed by reading the exact
  conditional branches, then confirmed empirically in the recompiled PDF
  (no boilerplate came back).
- `\acmConference[MSc Thesis Summary]{}{October 2026}{Lisbon, Portugal}`
  (was `[MSc Thesis Extended Abstract]{}{}{}` with empty date/venue, which is
  exactly why the venue line had nothing to render even before `nonacm` was
  considered).
- `\renewcommand{\shorttitle}{Governed Human-AI Collaboration Across the SDLC}`
  right after `\title{...}` - `\renewcommand`, not a bare call, and a
  short header-only version since the real title is too long for one line
  next to anything else.
- `\renewcommand{\shortauthors}{Taborda, Mira da Silva, and de Sousa}`
  (was `{Taborda}`) - surname-only list matching Cruz's own
  "Cruz, Mira da Silva, and São Mamede" convention exactly (same supervisor,
  same surname format).

Recompiled and visually inspected page 1 (confirmed blank corners, single
undoubled title), page 2 (confirmed "MSc Thesis Summary, October 2026,
Lisbon, Portugal" left / "Taborda, Mira da Silva, and de Sousa" right), and
page 3 (confirmed short title left / venue line right, no collision):
page count unchanged at 8, 0 errors, 0 undefined references, dash sweep
unchanged (10 matches, all after the References heading).

## Files

- `main.tex` - the scaffold itself.
- `Images/` - the two PNGs described above, copied verbatim from the
  dissertation's own `Images/` folder.
- `references.bib` - a **subset copy**, extracted verbatim (unedited BibTeX
  entries) from `../IST_UL___MEIC_Thesis___Dissertação_final/Bibliography.bib`,
  limited to the 30 keys actually `\cite`'d in `main.tex`. No entry was
  invented, reworded, or hand-typed; if a citation is added to `main.tex`,
  copy the matching entry from the thesis bibliography by hand rather than
  writing a new BibTeX entry from memory or from the web.
- `README.md` - this file.

## What this scaffold does not do

- It does not touch anything inside
  `../IST_UL___MEIC_Thesis___Dissertação_final/`. Chapter 6 of the
  dissertation was read for source content only, never written to (it was
  being actively edited elsewhere at the time this scaffold was built).
- It does not fabricate results, participant counts, SUS/NASA-TLX scores, or
  interview findings. Every sentence that would need such data is a visible
  placeholder, not a plausible-sounding guess.
