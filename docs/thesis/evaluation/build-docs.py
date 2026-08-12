#!/usr/bin/env python3
"""Build the evaluation package as .docx and .pdf.

Markdown -> styled HTML -> LibreOffice -> docx and pdf.

Two outputs:
  Apex-Evaluation-Package.docx/.pdf  every document, for the researcher
  Apex-Task-Script.docx/.pdf         participant-facing script only

Usage:  python3 build-docs.py
Needs:  python3-markdown, libreoffice
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent

# Order matters: the TODO comes first so the reader lands on what to do next.
PACKAGE = [
    ("FORMS-BUILD-GUIDE.md", "Forms build guide and master TODO"),
    ("FORMS-BUILD-SHEET.md", "Google Forms build sheet"),
    ("EVALUATION-PLAN.md", "Evaluation plan"),
    ("task-set.md", "Task set, internal notes"),
    ("task-script.md", "Task script"),
    ("instrument-sus.md", "System Usability Scale"),
    ("instrument-nasa-tlx.md", "Raw NASA-TLX"),
    ("instrument-apex-ux.md", "Apex UI/UX questionnaire"),
    ("interview-guides.md", "Interview guides"),
    ("observer-sheet.md", "Observer sheet"),
    ("consent-and-briefing.md", "Consent, briefing and demographics"),
]

SCRIPT_ONLY = [("task-script.md", "Task script")]

CSS = """
@page { size: A4; margin: 2cm; }
body { font-family: "Liberation Sans", Arial, sans-serif; font-size: 10.5pt;
       line-height: 1.45; color: #111; }
h1 { font-size: 20pt; color: #1f3864; margin-top: 0; padding-bottom: 4pt;
     border-bottom: 2px solid #1f3864; }
h2 { font-size: 14pt; color: #1f3864; margin-top: 18pt; }
h3 { font-size: 12pt; color: #2f5496; margin-top: 14pt; }
h4 { font-size: 11pt; color: #2f5496; }
p, li { font-size: 10.5pt; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th, td { border: 1px solid #9aa5b1; padding: 4pt 6pt; font-size: 9.5pt;
         vertical-align: top; text-align: left; }
th { background: #e8edf5; font-weight: bold; }
code { font-family: "Liberation Mono", monospace; font-size: 9.5pt;
       background: #f2f4f7; }
pre { font-family: "Liberation Mono", monospace; font-size: 9pt;
      background: #f7f8fa; border: 1px solid #d7dce3; padding: 6pt;
      white-space: pre-wrap; }
blockquote { border-left: 3px solid #2f5496; margin-left: 0; padding-left: 10pt;
             color: #333; }
hr { border: 0; border-top: 1px solid #c8cfd8; }
.docbreak { page-break-before: always; }
.cover { text-align: center; margin-top: 5cm; }
.cover h1 { border: 0; font-size: 26pt; }
.cover .sub { font-size: 13pt; color: #444; margin-top: 6pt; }
.cover .meta { font-size: 11pt; color: #555; margin-top: 2.5cm; line-height: 1.8; }
.warn { border: 2px solid #a33; background: #fdf3f3; padding: 8pt; }
"""

COVER = """
<div class="cover">
  <h1>{title}</h1>
  <div class="sub">{sub}</div>
  <div class="meta">
    Tomas dos Santos Taborda<br/>
    MEIC-T, Instituto Superior Tecnico, Universidade de Lisboa<br/>
    Supervisors: Prof. Miguel Mira da Silva, Hugo de Sousa<br/><br/>
    <b>Draft. No data has been collected.</b><br/>
    Generated {date}
  </div>
</div>
"""

EXT = ["tables", "fenced_code", "sane_lists", "attr_list", "nl2br"]


def render(files):
    out = []
    for i, (name, _label) in enumerate(files):
        src = HERE / name
        if not src.exists():
            sys.exit(f"missing: {src}")
        text = src.read_text(encoding="utf-8")
        html = markdown.markdown(text, extensions=EXT)
        # LibreOffice ignores <hr> page hints; force a break between documents.
        cls = "docbreak" if i or True else ""
        out.append(f'<div class="{cls}">{html}</div>')
    return "\n".join(out)


def build(files, stem, title, sub):
    from datetime import date

    body = render(files)
    page = (
        "<html><head><meta charset='utf-8'>"
        f"<title>{title}</title><style>{CSS}</style></head><body>"
        + COVER.format(title=title, sub=sub, date=date.today().isoformat())
        + body
        + "</body></html>"
    )
    html_path = HERE / f"{stem}.html"
    html_path.write_text(page, encoding="utf-8")

    # The bare "docx" target has no export filter when the input is HTML;
    # the filter has to be named explicitly.
    for target in ("docx:MS Word 2007 XML", "pdf"):
        subprocess.run(
            ["soffice", "--headless", "--convert-to", target,
             "--outdir", str(HERE), str(html_path)],
            check=True, capture_output=True, timeout=300,
        )
    html_path.unlink()
    return HERE / f"{stem}.docx", HERE / f"{stem}.pdf"


if __name__ == "__main__":
    if not shutil.which("soffice"):
        sys.exit("libreoffice (soffice) not found")

    a = build(PACKAGE, "Apex-Evaluation-Package",
              "Apex Evaluation Package",
              "SUS, NASA-TLX, UI/UX instruments and study protocol")
    b = build(SCRIPT_ONLY, "Apex-Task-Script",
              "Apex Task Script",
              "Usability study, participant document")

    for p in (*a, *b):
        print(f"{p.name:38s} {p.stat().st_size / 1024:8.0f} KB")
