#!/usr/bin/env python3
"""Generate the participant code cards as a printable PDF.

One card per participant: code, tool link, shared Taiga sign-in credentials,
GitHub repo URL and PAT. Cards are laid out on A4 pages, several per page,
with dashed cut lines - print, cut, hand one per participant.

Codes: P0 (pilot, uncounted) + P1..P12 (Target N=12, EVALUATION-PLAN.md).
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
    <tr><td>GitHub PAT</td><td class="mono">{html.escape(GITHUB_PAT)}</td></tr>
  </table>
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
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }}
  .card {{
    border: 1px dashed #999;
    border-radius: 6px;
    padding: 10px 14px;
    page-break-inside: avoid;
  }}
  .code-row {{ display: flex; justify-content: space-between; align-items: baseline;
               border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 8px; }}
  .code {{ font-size: 22pt; font-weight: bold; }}
  .label {{ font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 9.5pt; }}
  td {{ padding: 3px 0; vertical-align: top; }}
  td:first-child {{ width: 34%; color: #555; white-space: nowrap; }}
  .mono {{ font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
           font-size: 9pt; word-break: break-all; }}
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
