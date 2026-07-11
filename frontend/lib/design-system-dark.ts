import { hexToRgb } from "@/lib/wcag";
import type { DesignSystemColor } from "@/lib/api/types";

type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function channelToHex(c: number): string {
  return Math.round(c * 255).toString(16).padStart(2, "0");
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${channelToHex(f(0))}${channelToHex(f(8))}${channelToHex(f(4))}`.toUpperCase();
}

const SURFACE_RE = /surface|background|bg|canvas/i;
const TEXT_RE = /text|foreground|ink|label/i;
const BORDER_RE = /border|divider|outline/i;

function deriveDarkColor(color: DesignSystemColor): DesignSystemColor {
  const hsl = hexToHsl(color.hex);
  let l: number;
  if (SURFACE_RE.test(color.name)) {
    l = 12;
  } else if (TEXT_RE.test(color.name)) {
    l = 92;
  } else if (BORDER_RE.test(color.name)) {
    l = 25;
  } else {
    l = Math.min(85, hsl.l + 15);
  }
  return { ...color, hex: hslToHex({ h: hsl.h, s: hsl.s, l }) };
}

export function deriveDarkPalette(colors: DesignSystemColor[]): DesignSystemColor[] {
  return colors.map(deriveDarkColor);
}
