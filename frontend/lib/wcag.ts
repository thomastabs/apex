import type { ComponentStates, DesignSystemColor } from "@/lib/api/types";

export type WcagLevel = "AAA" | "AA" | "Fail";

export type ContrastCheck = {
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  level: WcagLevel;
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return { r, g, b };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagLevel(ratio: number, largeText = false): WcagLevel {
  const aaaThreshold = largeText ? 4.5 : 7;
  const aaThreshold = largeText ? 3 : 4.5;
  if (ratio >= aaaThreshold) return "AAA";
  if (ratio >= aaThreshold) return "AA";
  return "Fail";
}

function check(label: string, foreground: string, background: string): ContrastCheck {
  const ratio = contrastRatio(foreground, background);
  return { label, foreground, background, ratio, level: wcagLevel(ratio) };
}

export function checkComponentStates(componentStates: ComponentStates[]): ContrastCheck[] {
  const results: ContrastCheck[] = [];
  for (const c of componentStates) {
    (["default", "hover", "disabled", "error"] as const).forEach((state) => {
      const style = c[state];
      results.push(check(`${c.component} · ${state}`, style.text_color, style.background));
    });
  }
  return results;
}

const TEXT_NAME_RE = /text|foreground|ink|label/i;
const SURFACE_NAME_RE = /surface|background|bg|canvas/i;

export function checkPaletteTextOnSurface(colors: DesignSystemColor[]): ContrastCheck[] {
  const textColors = colors.filter((c) => TEXT_NAME_RE.test(c.name));
  const surfaceColors = colors.filter((c) => SURFACE_NAME_RE.test(c.name));
  const results: ContrastCheck[] = [];
  for (const text of textColors) {
    for (const surface of surfaceColors) {
      results.push(check(`${text.name} on ${surface.name}`, text.hex, surface.hex));
    }
  }
  return results;
}
