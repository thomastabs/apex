#!/usr/bin/env python3
"""Generate the participant code cards as a printable PDF.

One card per participant: code, tool link, shared Taiga sign-in credentials,
GitHub repo URL and PAT. Cards are laid out on A4 pages, several per page,
with dashed cut lines - print, cut, hand one per participant.

Codes: P0 (pilot, counted as a full participant since 2026-09-02, see
EVALUATION-PLAN.md's Participants section) + P1..P12 (pre-registered Target
N=12, unchanged; achieved N can now reach 13 with P0 included).
Sign-in credentials are the single shared dummyApex Taiga account - decided
2026-08-30 (sequential/unmoderated study, no real session-overlap risk).

Usage:  python3 build-cards.py
Needs:  google-chrome (headless print-to-pdf)

The GitHub PAT is read from a local, gitignored secrets file next to this
script (.cards-secrets.local: one line, GITHUB_PAT=<token>) rather than
hardcoded here - this repo (thomastabs/apex) is public, and a token baked
into tracked source would leak into git history the moment it's committed.
Create that file yourself; it is never read by anything else and never
committed (see .gitignore).
"""

import html
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SECRETS_FILE = HERE / ".cards-secrets.local"

TOOL_LINK = "https://apex-bolt.com"
TAIGA_USERNAME = "dummyApex"
TAIGA_PASSWORD = "dummytest123!"
GITHUB_REPO = "https://github.com/thomastabs/dummyREPO"


def load_github_pat() -> str:
    if SECRETS_FILE.exists():
        for line in SECRETS_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("GITHUB_PAT="):
                return line.split("=", 1)[1].strip()
    return "<GITHUB PAT — put GITHUB_PAT=... in .cards-secrets.local>"


GITHUB_PAT = load_github_pat()

CODES = ["P0 (pilot)"] + [f"P{i}" for i in range(1, 13)]


def card_html(code: str) -> str:
    is_pilot = "pilot" in code
    label = "PILOT — not counted" if is_pilot else "Participant"
    return f"""
<div class="card">
  <div class="code-row">
    <span class="code">{code.split(" ")[0]}</span>
    <span class="label">{label}</span>
  </div>
  <table>
    <tr><td>Tool link</td><td class="mono">{TOOL_LINK}</td></tr>
    <tr><td>Sign-in username</td><td class="mono">{TAIGA_USERNAME}</td></tr>
    <tr><td>Sign-in password</td><td class="mono">{TAIGA_PASSWORD}</td></tr>
    <tr><td>Project</td><td>Demo Project</td></tr>
    <tr><td>GitHub repo</td><td class="mono">{GITHUB_REPO}</td></tr>
  </table>
  <div class="pat-row">
    <div class="pat-label">GitHub PAT</div>
    <div class="pat-value">{html.escape(GITHUB_PAT)}</div>
  </div>
</div>
"""


def build() -> str:
    cards = "\n".join(card_html(c) for c in CODES)
    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<title>Apex Participant Cards</title>
<style>
  @page {{ size: A4; margin: 10mm; }}
  body {{ font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; }}
  /* Single column, full page width: the PAT below needs enough horizontal
     room to render as one unbroken line. A wrapped mono string still LOOKS
     copyable in a PDF viewer, but Chrome's text layer inserts a real break
     at the wrap point, so pasting it elsewhere corrupts the token (e.g.
     GitHub then rejects it as a malformed credential). Never let it wrap. */
  .grid {{ display: grid; grid-template-columns: 1fr; gap: 4mm; }}
  .card {{
    border: 1px dashed #999;
    border-radius: 6px;
    padding: 8px 14px;
    page-break-inside: avoid;
  }}
  .code-row {{ display: flex; justify-content: space-between; align-items: baseline;
               border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 6px; }}
  .code {{ font-size: 20pt; font-weight: bold; }}
  .label {{ font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 9.5pt; }}
  td {{ padding: 2px 0; vertical-align: top; }}
  td:first-child {{ width: 20%; color: #555; white-space: nowrap; }}
  .mono {{ font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
           font-size: 9pt; white-space: nowrap; }}
  .pat-row {{ display: flex; align-items: baseline; gap: 8px; margin-top: 2px; }}
  .pat-label {{ font-size: 9.5pt; color: #555; white-space: nowrap; }}
  .pat-value {{ font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
                font-size: 8pt; white-space: nowrap; }}
</style>
</head><body>
<div class="grid">
{cards}
</div>
</body></html>"""


def main() -> int:
    html_path = HERE / "_participant-cards-render.html"
    pdf_path = HERE / "participant-cards.pdf"
    html_path.write_text(build(), encoding="utf-8")

    result = subprocess.run(
        ["google-chrome", "--headless", "--disable-gpu", "--no-sandbox",
         f"--print-to-pdf={pdf_path}", "--print-to-pdf-no-header", str(html_path)],
        capture_output=True, text=True,
    )
    html_path.unlink()
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        return 1

    if GITHUB_PAT.startswith("<GITHUB PAT"):
        print("WARNING: GITHUB_PAT is still a placeholder. Edit build-cards.py with the real "
              "value and re-run before printing/handing out any card.", file=sys.stderr)
    print(f"wrote {pdf_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
