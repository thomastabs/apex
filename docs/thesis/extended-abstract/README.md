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
pages** (see "Verified build result (2026-09-15)" below): Chapters 7 and 9
of the dissertation now have real content to draw from, so Sections 5 and
the results half of Section 6 are drafted for real rather than placeholder
text. Chapter 8's Application/Observations/Summary and Chapter 10 remain
genuinely unwritten in the dissertation itself, so Sections 7-8 here are
drafted as far as that source material allows and no further.

| Section | Status | Approx. current share |
|---|---|---|
| Abstract + Keywords | Drafted; headline result now stated (constructs realised/proxy/partial, SUS, NASA-TLX), with the demonstration/synthesis gap named explicitly | front matter |
| 1 Motivation and Problem Statement | Drafted from Chapter 1 + Chapter 5; staleness-checked against current Chapters 1/4/6, unchanged | about 3/4 column |
| 2 Research Methodology | Drafted from Chapter 2; staleness-checked, unchanged | about 1/4 column |
| 3 Related Work (SLR findings) | Drafted from Chapter 4's Discussion + Chapter 3; staleness-checked against the corrected SLR funnel (117 duplicates, not 227), no stale number was actually present here to begin with | about 1/2 column |
| 4 Proposed Framework (4.1-4.5) | Drafted from Chapter 6 in full, including the phase table; staleness-checked against current Chapter 6 (8 principles, 6 phases, Trio/hats, 5 gates, 3 metrics, Siddeeq figures), unchanged | the largest section, over a page, mirroring Cruz's §3 |
| 5 Reference Implementation: Apex | **Drafted from Chapter 7**: the five architecture properties, a condensed DRQ3 construct-mechanism outcome count (10 realised / 1 proxy / 1 partial), the Spec-Anchored Continuity file-taxonomy liberty, and the practitioner-feedback design history | new, about a page |
| 6 Demonstration, Evaluation Design, and Results | Design paragraph updated to name the two-settings-plus-abandoned-third framing; **results now drafted from Chapter 9** (participants, SUS, NASA-TLX, UX trust-calibration pair and lost gate-comprehension measure, analytical assessment), with the Apex-demonstration-narrative-vs-real-evaluation-data scope seam stated explicitly | new, about a page |
| 7 Discussion and Threats to Validity | **Drafted from Chapter 9's Discussion/Threats and Chapter 8's researcher-role and abandoned-partner threats**: DRQ1/2/4 answered from Chapter 9, DRQ3 from Chapter 7's mapping, the demonstration boundary carried through explicitly | new, about 3/4 column |
| 8 Conclusion | Intro paragraph tightened to the current contribution counts; synthesis paragraph **remains a placeholder on purpose**, since Chapter 8's Application/Observations/Summary and Chapter 10 are still genuinely unwritten in the dissertation - the placeholder now says precisely what is answerable today (DRQ3 fully, DRQ1/2/4 partially) and what is not | placeholder, updated wording only |
| References | 33 entries (30 plus Martins:2015SUS, Lewis:2009SUS, J.Pries-Heje:2008SD, added for the Section 6 results), all reused verbatim from the thesis bibliography | - |

Remaining placeholders are limited to Section 8's synthesis paragraph, which
stays a visible red `[PLACEHOLDER - WAITING ON DATA: ...]` block (the small
custom command, not `todonotes`, see the "Known LaTeX issue" note below)
naming exactly what it is blocked on (Chapter 8's fieldwork and Chapter 10's
own drafting) and what it must contain once unblocked. Every other section
is now drafted from real, current dissertation content.

## Build

```bash
cd docs/thesis/extended-abstract
pdflatex -interaction=nonstopmode main.tex
bibtex main
pdflatex -interaction=nonstopmode main.tex
pdflatex -interaction=nonstopmode main.tex
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

## Files

- `main.tex` - the scaffold itself.
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
