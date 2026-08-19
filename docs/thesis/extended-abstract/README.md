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
results exist, per the task's guidance. Current compiled length is **5
pages**, roughly half of it results-dependent placeholder text rather than
findings, so there is real headroom to grow into once the usability study
runs without threatening the ceiling.

| Section | Status | Approx. current share |
|---|---|---|
| Abstract + Keywords | Drafted; final sentence is a placeholder for the headline result | front matter |
| 1 Motivation and Problem Statement | Drafted from Chapter 1 + Chapter 5 | about 3/4 column |
| 2 Research Methodology | Drafted from Chapter 2 | about 1/4 column |
| 3 Related Work (SLR findings) | Drafted from Chapter 4's Discussion + Chapter 3 | about 1/2 column |
| 4 Proposed Framework (4.1-4.5) | Drafted from Chapter 6 in full, including the phase table | the largest section, over a page, mirroring Cruz's §3 |
| 5 Reference Implementation: Apex | Placeholder only | waiting on Chapter 7 being written (currently a dissertation skeleton, not a results gap) |
| 6 Demonstration, Evaluation Design, and Results | Design paragraph drafted (instruments are already decided); results are a placeholder | waiting on the usability study being run |
| 7 Discussion and Threats to Validity | Placeholder only | waiting on the results above |
| 8 Conclusion | Placeholder only | waiting on the results above |
| References | 30 entries, all reused from the thesis bibliography | - |

Every placeholder in `main.tex` is a visible red `[PLACEHOLDER - WAITING ON
DATA: ...]` paragraph (a small custom command, not the `todonotes` package,
see the "Known LaTeX issue" note below) naming exactly what it is blocked on
and what it must contain once unblocked. Nothing is drafted for Chapters
7-10 beyond what the task scoped as safe to compress (Chapters 1-6 only);
Chapters 7, 8 and 10 of the dissertation are themselves still skeletons, and
Chapter 9 has no results, so there is nothing finished yet to compress into
those sections.

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
  PDF (`IST_UL___MEIC_Thesis___Dissertação_final/main.pdf`, `IEEEtran`
  style) has the identical pattern for citation-range compression, already
  unaddressed. Flagged rather than silently worked around; see the
  final report for this task for the explicit call-out. A fix, if wanted,
  would mean patching or replacing the `.bst` file to force a literal hyphen
  in ranges, which was not done here since it touches bibliography
  generation code, not this document's own content, and the same fix would
  then need making twice (`IEEEtran.bst` for the thesis, `ACM-Reference-
  Format.bst` here).

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
