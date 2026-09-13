#!/usr/bin/env python3
"""Generate the Chapter 6 lifecycle figure (6 phases + 3 named loop-backs)."""

# ---------------------------------------------------------------- palette
FILL        = "#F5F3FF"
FILL_HUB    = "#EDE9FE"
STROKE      = "#5B21B6"
TEXT        = "#2E1065"
LOOP        = "#64748B"
LOOP_TEXT   = "#475569"
SANS        = "Helvetica, Arial, 'Liberation Sans', sans-serif"

# ---------------------------------------------------------------- geometry
MARGIN   = 30
BW, BH   = 244, 112
GAP      = 42
BY       = 40                 # box top
BB       = BY + BH            # box bottom  = 152
MIDY     = BY + BH / 2        # 96

PHASES = [
    ["Discovery &", "Requirements"],
    ["Design,", "Prototyping &", "Architecture"],
    ["Implementation"],
    ["Testing"],
    ["Deployment"],
    ["Maintenance"],
]

left   = lambda i: MARGIN + i * (BW + GAP)
centre = lambda i: left(i) + BW / 2

W = left(5) + BW + MARGIN     # 1650
H = 524

# loop-back lanes: strictly nested, so no two paths ever cross.
# shallowest lane = shortest journey back (Implementation);
# deepest lane    = longest journey back (Discovery).
# exits are placed on Maintenance's bottom edge, left-to-right in the same
# order as the lanes, so the fan never doubles back on itself.
_MX = left(5)
LOOPS = [
    # (lane_y, exit_x on Maintenance's bottom edge, target phase index, label)
    (268, _MX + 52,  2, "production defect (Fix-Bolt)"),
    (362, _MX + 122, 1, "specification gap"),
    (456, _MX + 192, 0, "business deviation"),
]

R = 18            # corner radius on the orthogonal loop-back paths
LBL_SIZE = 27     # loop-back label size
# Arial advance widths (units/1000 em) for the characters actually used.
_AW = {
    " ": 278, "(": 333, ")": 333, "-": 333, "&": 667, ",": 278,
    "B": 667, "F": 611, "a": 556, "b": 556, "c": 500, "d": 556, "e": 556,
    "f": 278, "g": 556, "h": 556, "i": 222, "il": 444, "l": 222, "k": 500,
    "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333, "s": 500,
    "t": 278, "u": 556, "v": 500, "x": 500, "y": 500, "z": 500,
}
def text_w(s, size):
    return sum(_AW.get(ch, 556) for ch in s) / 1000.0 * size


out = []
add = out.append

add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
    f'width="{W}" height="{H}">')
add(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#FFFFFF"/>')

# ------------------------------------------------------- loop-backs (behind)
add(f'<g fill="none" stroke="{LOOP}" stroke-width="3.2" '
    f'stroke-dasharray="9 8" stroke-linecap="round">')
for lane_y, ex, tgt, _ in LOOPS:
    tx = centre(tgt)
    add(f'  <path d="M {ex} {BB} V {lane_y - R} '
        f'Q {ex} {lane_y} {ex - R} {lane_y} '
        f'H {tx + R} '
        f'Q {tx} {lane_y} {tx} {lane_y - R} '
        f'V 171"/>')
add('</g>')

# tails: a solid dot on Maintenance's bottom edge, so all three visibly
# originate from the same phase
for _, ex, _, _ in LOOPS:
    add(f'<circle cx="{ex}" cy="{BB}" r="6" fill="{LOOP}"/>')

# arrowheads pointing up into the target phase
for _, _, tgt, _ in LOOPS:
    tx = centre(tgt)
    add(f'<polygon points="{tx},153 {tx - 9.5},174 {tx + 9.5},174" fill="{LOOP}"/>')

# ------------------------------------------------------------- labels on lane
# Each label sits on its OWN lane, immediately after the turn up into its
# target phase, on a white knock-out so it never sits on a dashed line.
for lane_y, _, tgt, label in LOOPS:
    x = centre(tgt) + R + 36
    w = text_w(label, LBL_SIZE)
    add(f'<rect x="{x - 10:.1f}" y="{lane_y - 18}" width="{w + 20:.1f}" '
        f'height="36" rx="6" fill="#FFFFFF"/>')
    add(f'<text x="{x:.1f}" y="{lane_y + 9}" font-family="{SANS}" '
        f'font-size="{LBL_SIZE}" font-style="italic" fill="{LOOP_TEXT}">'
        f'{label.replace("&", "&amp;")}</text>')

# ------------------------------------------------------------- forward arrows
for i in range(5):
    x1 = left(i) + BW + 7
    x2 = left(i + 1) - 4
    add(f'<line x1="{x1}" y1="{MIDY}" x2="{x2 - 17}" y2="{MIDY}" '
        f'stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>')
    add(f'<polygon points="{x2},{MIDY} {x2 - 19},{MIDY - 9.5} '
        f'{x2 - 19},{MIDY + 9.5}" fill="{STROKE}"/>')

# -------------------------------------------------------------- phase boxes
for i, lines in enumerate(PHASES):
    fill = FILL_HUB if i == 5 else FILL
    add(f'<rect x="{left(i)}" y="{BY}" width="{BW}" height="{BH}" rx="14" '
        f'fill="{fill}" stroke="{STROKE}" stroke-width="3"/>')
    lh = 30
    y0 = MIDY - (len(lines) - 1) * lh / 2 + 9
    for j, ln in enumerate(lines):
        add(f'<text x="{centre(i)}" y="{y0 + j * lh}" text-anchor="middle" '
            f'font-family="{SANS}" font-size="25" font-weight="bold" '
            f'fill="{TEXT}">{ln.replace("&", "&amp;")}</text>')

add('</svg>')

import pathlib, sys
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "lifecycle.svg")
p.write_text("\n".join(out), encoding="utf-8")
print(f"wrote {p}  viewBox {W}x{H}")
