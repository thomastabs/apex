#!/usr/bin/env python3
"""Redraw the three legacy raster diagrams in the thesis house style.

Replaces low-resolution draw.io exports with vector-derived PNGs in the same
violet palette and Helvetica/Arial family as the Chapter 6 lifecycle figure:

  slr-phases.png      Figure 2.1  three phases of the SLR
  dsrm.png            Figure 2.2  phases of the DSRM
  article-filtering.png  Figure 4.1  article attrition through filtering

Every string is reproduced verbatim from the diagram it replaces; this is a
rendering change only.

Usage:  python3 chapter-diagrams.py <output-dir>
"""

import pathlib
import sys

from PIL import ImageFont

# ------------------------------------------------------------------ palette
# Black/white/grayscale only, 2026-09-14 (Tomás: Figures 2.1, 2.2 and 4.1 are
# the only diagrams in the thesis printed in grayscale - every other figure
# keeps the violet house style). No hue anywhere below, only black/gray/white.
FILL = "#FFFFFF"
FILL_HEAD = "#E5E5E5"
STROKE = "#000000"
TEXT = "#000000"
BODY = "#000000"
RULE = "#999999"
LOOP = "#666666"
LOOP_TEXT = "#333333"
SANS = "Helvetica, Arial, 'Liberation Sans', sans-serif"

_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
_CACHE = {}


def _font(bold, size):
    key = (bold, int(size))
    if key not in _CACHE:
        _CACHE[key] = ImageFont.truetype(_BOLD if bold else _REG, int(size))
    return _CACHE[key]


def width(s, size, bold=False):
    """Advance width of s at the given size, in user units."""
    return _font(bold, 200).getlength(s) * size / 200.0


def wrap(s, size, maxw, bold=False):
    """Greedy word wrap to maxw user units."""
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = w if not cur else cur + " " + w
        if width(trial, size, bold) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size, *, bold=False, fill=None, anchor="start", italic=False):
    fill = fill or (TEXT if bold else BODY)
    style = ' font-style="italic"' if italic else ""
    weight = ' font-weight="bold"' if bold else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{SANS}" '
            f'font-size="{size}"{weight}{style} fill="{fill}" '
            f'text-anchor="{anchor}">{esc(s)}</text>')


def svg(w, h, body):
    return "\n".join(
        [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" '
         f'width="{w:.0f}" height="{h:.0f}">',
         f'<rect x="0" y="0" width="{w:.0f}" height="{h:.0f}" fill="#FFFFFF"/>']
        + body + ["</svg>"])


def arrow_right(x1, x2, y, colour=STROKE, sw=3.5, head=19):
    """Horizontal arrow from x1 to x2 with a solid triangular head at x2."""
    return [f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2 - head:.1f}" y2="{y:.1f}" '
            f'stroke="{colour}" stroke-width="{sw}" stroke-linecap="round"/>',
            f'<polygon points="{x2:.1f},{y:.1f} {x2 - head:.1f},{y - head / 2:.1f} '
            f'{x2 - head:.1f},{y + head / 2:.1f}" fill="{colour}"/>']


# =========================================================== Figure 2.1 (SLR)
def slr_phases():
    """Three phases of the Systematic Literature Review."""
    PHASES = [
        ("Planning the Review", [
            "Identifying the problem and motivation within the realm of the use "
            "of AI and LLMs in Software Development",
            "Specify the Research Questions, by identifying the benefits, "
            "consequences, methodologies, people's opinions and industry sectors "
            "about the use of AI and LLMs in Software Development",
            "Design a Review Protocol by creating the search string, identifying "
            "the literature database, inclusion and exclusion criteria",
        ]),
        ("Conducting the Review", [
            "Obtain the set of selected papers by filtering and article reading "
            "processes, coming down to 31 papers",
            "Perform Data Extraction and Analysis on the literature",
        ]),
        ("Reporting the Review", [
            "Summarize the Extracted Data into sections, each covering one "
            "research question findings",
            "Report the findings by answering the proposed research questions",
        ]),
    ]

    M = 26           # canvas margin
    BW = 466         # card width
    GAP = 96         # gap between cards (holds the arrow)
    HEAD_H = 62      # header band height
    PAD = 20         # inner padding
    TS = 29          # title size
    BS = 25          # body size
    LH = 31          # body line height
    CELL_PAD = 15    # vertical padding inside an activity cell

    W = M * 2 + 3 * BW + 2 * GAP

    # lay out each card's activity cells
    laid = []
    for title, cells in PHASES:
        rows, y = [], HEAD_H
        for c in cells:
            lines = wrap(c, BS, BW - 2 * PAD)
            h = CELL_PAD * 2 + len(lines) * LH
            rows.append((y, h, lines))
            y += h
        laid.append((title, rows, y))

    # cards are top-aligned and sized to their own content: an equal-height row
    # would leave two thirds of the second and third cards visibly empty
    H = M * 2 + max(h for _, _, h in laid)
    out = []

    # connectors first, so the cards sit on top of their ends
    midy = M + HEAD_H / 2
    for i in range(2):
        x1 = M + (i + 1) * BW + i * GAP + 8
        x2 = x1 + GAP - 16
        out += arrow_right(x1, x2, midy)

    for i, (title, rows, CARD_H) in enumerate(laid):
        x = M + i * (BW + GAP)
        out.append(f'<rect x="{x}" y="{M}" width="{BW}" height="{CARD_H}" rx="14" '
                   f'fill="{FILL}" stroke="{STROKE}" stroke-width="3"/>')
        # header band: rounded at the top, square at the bottom
        out.append(f'<path d="M {x} {M + HEAD_H} V {M + 14} '
                   f'a 14 14 0 0 1 14 -14 H {x + BW - 14} '
                   f'a 14 14 0 0 1 14 14 V {M + HEAD_H} Z" fill="{FILL_HEAD}"/>')
        out.append(f'<line x1="{x}" y1="{M + HEAD_H}" x2="{x + BW}" '
                   f'y2="{M + HEAD_H}" stroke="{STROKE}" stroke-width="3"/>')
        out.append(text(x + BW / 2, M + HEAD_H / 2 + TS * 0.35, title, TS,
                        bold=True, anchor="middle"))
        for j, (cy, h, lines) in enumerate(rows):
            if j:
                out.append(f'<line x1="{x + PAD}" y1="{M + cy}" '
                           f'x2="{x + BW - PAD}" y2="{M + cy}" '
                           f'stroke="{RULE}" stroke-width="1.6"/>')
            ty = M + cy + CELL_PAD + BS * 0.82
            for k, ln in enumerate(lines):
                out.append(text(x + PAD, ty + k * LH, ln, BS))
    return svg(W, H, out)


# ========================================================== Figure 2.2 (DSRM)
def dsrm():
    """Phases of the Design Science Research Methodology."""
    PHASES = [
        ("Problem Identification and Motivation",
         "Lack of established, solid and clear methodologies, that shape the "
         "proper use of AI and LLMs within the Software Development realm and "
         "across the industry and professional practice."),
        ("Definition of the Goal for a Solution",
         "Guide organizations and professionals to fully utilize and embrace the "
         "implementation and incorporation of proper AI and LLMs usage in a "
         "Software Development environment."),
        ("Design and Development",
         "Design a framework that defines a patterned methodology to manage, "
         "incorporate, implement and allow proper use of AI with Human-AI "
         "collaboration"),
        ("Demonstration",
         "Application of the designed framework in a real-world scenario"),
        ("Evaluation",
         "Demonstration\n\nInterviews with Experts and Practicioners"),
        ("Communication", "Dissertation\n\nPapers"),
    ]

    M = 18
    BW = 372
    GAP = 40
    PAD = 12
    TS = 32
    BS = 33
    LH = 40
    HEAD_PAD = 14      # vertical padding around the header text
    RAIL_H = 74        # space above the cards for the "Iterative Process" rail
    # Per-box feedback connectors below the row (one lane per phase after the
    # first, stepping down like a staircase) removed 2026-09-14 (Tomás: they
    # read as confusing) - the "Iterative Process" rail above the cards
    # already states the loop; five extra dashed lanes crossing under the row
    # were redundant with it, not a second independent claim.
    LOOP_H = 0

    W = M * 2 + 6 * BW + 5 * GAP

    # header and body wrapped independently; all cards share the tallest layout
    laid = []
    for title, bodytxt in PHASES:
        tl = wrap(title, TS, BW - 2 * PAD, bold=True)
        bl = []
        for para in bodytxt.split("\n"):
            bl += wrap(para, BS, BW - 2 * PAD) if para.strip() else [""]
        laid.append((tl, bl))
    head_h = HEAD_PAD * 2 + max(len(tl) for tl, _ in laid) * (TS + 5)
    body_h = PAD * 2 + max(len(bl) for _, bl in laid) * LH
    CARD_H = head_h + body_h

    top = M + RAIL_H
    H = top + CARD_H + LOOP_H + M
    out = []

    def cx(i):
        return M + i * (BW + GAP) + BW / 2

    # ---- iterative-process rail above the row. Originates at Communication
    # (index 5, the circle marks the loop's source) and drops back into three
    # earlier phases genuinely re-entered by iteration - Definition of the
    # Goal, Design and Development, and Evaluation (2026-09-14, Tomás: the
    # rail should connect to those steps too, not only the first) - each drop
    # arrowed the same way so all three read as equally real entry points.
    rail_y = M + 26
    out.append(f'<path d="M {cx(5):.1f} {top:.1f} V {rail_y:.1f} '
               f'H {cx(1):.1f}" fill="none" stroke="{LOOP}" '
               f'stroke-width="2.6" stroke-dasharray="9 8" '
               f'stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(f'<circle cx="{cx(5):.1f}" cy="{top:.1f}" r="5.5" fill="{LOOP}"/>')
    for i in (1, 2, 4):
        out.append(f'<line x1="{cx(i):.1f}" y1="{rail_y:.1f}" '
                   f'x2="{cx(i):.1f}" y2="{top - 20:.1f}" stroke="{LOOP}" '
                   f'stroke-width="2.6" stroke-dasharray="9 8" '
                   f'stroke-linecap="round"/>')
        out.append(f'<polygon points="{cx(i):.1f},{top - 2:.1f} '
                   f'{cx(i) - 9:.1f},{top - 22:.1f} {cx(i) + 9:.1f},{top - 22:.1f}" '
                   f'fill="{LOOP}"/>')
    lbl = "Iterative Process"
    lw = width(lbl, 25, bold=False)
    lx = (cx(1) + cx(5)) / 2
    out.append(f'<rect x="{lx - lw / 2 - 12:.1f}" y="{rail_y - 18:.1f}" '
               f'width="{lw + 24:.1f}" height="36" rx="6" fill="#FFFFFF"/>')
    out.append(text(lx, rail_y + 9, lbl, 25, fill=LOOP_TEXT, anchor="middle",
                    italic=True))

    # ---- forward arrows between the cards. Thickened and given a real
    # visible shaft (2026-09-14, Tomás: hard to spot) - the previous GAP (24)
    # left only about a pixel of line showing past the arrowhead; GAP is now
    # 40 and the arrow is drawn with more headroom on each side so the shaft
    # itself is unmistakable, not just a wedge touching both boxes.
    for i in range(5):
        x1 = M + (i + 1) * BW + i * GAP + 3
        out += arrow_right(x1, x1 + GAP - 6, top + head_h / 2, sw=4.5, head=18)

    # ---- the cards
    for i, ((tl, bl), _) in enumerate(zip(laid, PHASES)):
        x = M + i * (BW + GAP)
        out.append(f'<rect x="{x}" y="{top}" width="{BW}" height="{CARD_H}" '
                   f'rx="13" fill="{FILL}" stroke="{STROKE}" stroke-width="2.8"/>')
        out.append(f'<path d="M {x} {top + head_h} V {top + 13} '
                   f'a 13 13 0 0 1 13 -13 H {x + BW - 13} '
                   f'a 13 13 0 0 1 13 13 V {top + head_h} Z" fill="{FILL_HEAD}"/>')
        out.append(f'<line x1="{x}" y1="{top + head_h}" x2="{x + BW}" '
                   f'y2="{top + head_h}" stroke="{STROKE}" stroke-width="2.8"/>')
        ty = top + head_h / 2 - (len(tl) - 1) * (TS + 5) / 2 + TS * 0.35
        for k, ln in enumerate(tl):
            out.append(text(x + BW / 2, ty + k * (TS + 5), ln, TS, bold=True,
                            anchor="middle"))
        by = top + head_h + body_h / 2 - (len(bl) - 1) * LH / 2 + BS * 0.34
        for k, ln in enumerate(bl):
            if ln:
                out.append(text(x + BW / 2, by + k * LH, ln, BS, anchor="middle"))

    return svg(W, H, out)


# ================================================ Figure 4.1 (article filtering)
def article_filtering():
    """Attrition of the retrieved articles through the filtering steps."""
    NODES = ["646", "467", "350", "64", "44", "31"]
    STEPS = ["Article Downloading from EBSCO", "Duplicate Removal",
             "Abstract Reading", "Introduction and Conclusion", "Article Reading"]

    M = 20
    BW, BH = 224, 168
    GAP = 210        # wide enough for "Downloading", the longest single word
    FOLD = 38        # folded-corner size on the document shape
    NS = 38          # count size
    US = 31          # "articles" size
    LS = 30          # step-label size
    LH = 36

    W = M * 2 + 6 * BW + 5 * GAP
    wrapped = [wrap(s, LS, GAP - 30) for s in STEPS]
    label_drop = 26 + LS * 0.8 + (max(len(w) for w in wrapped) - 1) * LH + LS * 0.3
    H = M * 2 + max(BH, BH / 2 + label_drop)
    out = []
    midy = M + BH / 2

    def x(i):
        return M + i * (BW + GAP)

    for i, lines in enumerate(wrapped):
        x1 = x(i) + BW + 14
        x2 = x(i + 1) - 14
        out += arrow_right(x1, x2, midy, sw=3.0, head=16)
        ly = midy + 30 + LS * 0.8
        for k, ln in enumerate(lines):
            out.append(text((x1 + x2) / 2, ly + k * LH, ln, LS, fill=LOOP_TEXT,
                            anchor="middle"))

    for i, n in enumerate(NODES):
        xi = x(i)
        out.append(f'<path d="M {xi} {M + 10} a 10 10 0 0 1 10 -10 '
                   f'H {xi + BW - FOLD} L {xi + BW} {M + FOLD} '
                   f'V {M + BH - 10} a 10 10 0 0 1 -10 10 H {xi + 10} '
                   f'a 10 10 0 0 1 -10 -10 Z" '
                   f'fill="{FILL}" stroke="{STROKE}" stroke-width="3"/>')
        out.append(f'<path d="M {xi + BW - FOLD} {M} V {M + FOLD} '
                   f'H {xi + BW} Z" fill="{FILL_HEAD}" stroke="{STROKE}" '
                   f'stroke-width="3" stroke-linejoin="round"/>')
        out.append(text(xi + BW / 2 - FOLD / 3, midy - 4, n, NS, bold=True,
                        anchor="middle"))
        out.append(text(xi + BW / 2 - FOLD / 3, midy + 26, "articles", US,
                        anchor="middle"))
    return svg(W, H, out)


# ----------------------------------------------------------------------- main
if __name__ == "__main__":
    import cairosvg

    outdir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    outdir.mkdir(parents=True, exist_ok=True)
    PX = 2600      # rendered width, about 410 dpi at the 16 cm print width
    for name, fn in [("slr-phases", slr_phases),
                     ("dsrm-phases", dsrm),
                     ("article-filtering", article_filtering)]:
        svg_path = outdir / f"{name}.svg"
        svg_path.write_text(fn(), encoding="utf-8")
        png_path = outdir / f"{name}.png"
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path), output_width=PX)
        print(f"wrote {svg_path} and {png_path}")
