import type { CSSProperties } from "react";
import type { DesignSystemColor, ScreenBlock, TypographyScale, TypographyStyle } from "@/lib/api/types";

const DEFAULT_STYLE: Record<string, TypographyStyle> = {
  h1: { role: "h1", size_px: 32, weight: 700, line_height: 1.2 },
  h2: { role: "h2", size_px: 24, weight: 600, line_height: 1.25 },
  h3: { role: "h3", size_px: 18, weight: 600, line_height: 1.3 },
  body: { role: "body", size_px: 15, weight: 400, line_height: 1.5 },
  caption: { role: "caption", size_px: 12, weight: 400, line_height: 1.4 },
  button: { role: "button", size_px: 14, weight: 600, line_height: 1.2 },
};

function typeStyle(typography: TypographyScale, role: string): CSSProperties {
  const found = typography.styles.find((s) => s.role.toLowerCase() === role.toLowerCase());
  const style = found ?? DEFAULT_STYLE[role.toLowerCase()] ?? DEFAULT_STYLE.body;
  return {
    fontFamily: typography.font_family,
    fontSize: style.size_px,
    fontWeight: style.weight,
    lineHeight: style.line_height,
  };
}

function pickColor(colors: DesignSystemColor[], patterns: RegExp[], fallback: string): string {
  for (const p of patterns) {
    const found = colors.find((c) => p.test(c.name));
    if (found) return found.hex;
  }
  return fallback;
}

function findByVariant(colors: DesignSystemColor[], variant: string, fallback: string): string {
  if (!variant) return fallback;
  const exact = colors.find((c) => c.name.toLowerCase() === variant.toLowerCase());
  if (exact) return exact.hex;
  const partial = colors.find(
    (c) => c.name.toLowerCase().includes(variant.toLowerCase()) || variant.toLowerCase().includes(c.name.toLowerCase()),
  );
  return partial ? partial.hex : fallback;
}

type Tokens = {
  primary: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
};

function tokensFrom(colors: DesignSystemColor[]): Tokens {
  return {
    primary: pickColor(colors, [/^primary$/i, /primary/i], "#4F46E5"),
    surface: pickColor(colors, [/^surface$/i, /surface/i, /background/i], "#F8FAFC"),
    text: pickColor(colors, [/^text$/i, /^text-primary$/i, /^text(?!-muted)/i], "#0F172A"),
    textMuted: pickColor(colors, [/text-muted/i, /muted/i, /caption/i], "#64748B"),
    border: pickColor(colors, [/^border$/i, /border/i, /divider/i, /outline/i], "#E2E8F0"),
  };
}

export function ScreenBlockView({
  block,
  colors,
  typography,
  depth = 0,
}: {
  block: ScreenBlock;
  colors: DesignSystemColor[];
  typography: TypographyScale;
  depth?: number;
}) {
  if (depth > 4) return null;
  const t = tokensFrom(colors);
  const children = block.children.map((child, i) => (
    <ScreenBlockView key={i} block={child} colors={colors} typography={typography} depth={depth + 1} />
  ));

  switch (block.kind) {
    case "header":
      return (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-b"
          style={{ borderColor: t.border, background: t.surface }}
        >
          <span style={typeStyle(typography, "h3")}>{block.label}</span>
          <div className="flex items-center gap-3">{children}</div>
        </div>
      );

    case "nav":
      return (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2">
          {block.label && <span style={{ ...typeStyle(typography, "caption"), color: t.textMuted }}>{block.label}</span>}
          {block.children.length > 0 ? (
            children
          ) : (
            <span
              className="rounded-full px-3 py-1"
              style={{ ...typeStyle(typography, "caption"), background: `${t.primary}1A`, color: t.primary }}
            >
              nav
            </span>
          )}
        </div>
      );

    case "hero":
      return (
        <div className="rounded-lg p-8 text-center flex flex-col items-center gap-2" style={{ background: t.surface }}>
          <div style={{ ...typeStyle(typography, "h1"), color: t.text }}>{block.label}</div>
          <div className="flex flex-col gap-2 w-full">{children}</div>
        </div>
      );

    case "card_grid": {
      const cols = Math.max(1, Math.min(6, parseInt(block.variant, 10) || 3));
      return (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {block.children.length > 0
            ? block.children.map((child, i) => (
                <div
                  key={i}
                  className="rounded-md border p-3 flex flex-col gap-1"
                  style={{ borderColor: t.border, background: t.surface }}
                >
                  <ScreenBlockView block={child} colors={colors} typography={typography} depth={depth + 1} />
                </div>
              ))
            : null}
        </div>
      );
    }

    case "form":
      return (
        <div className="flex flex-col gap-3 rounded-md border p-4" style={{ borderColor: t.border }}>
          {block.label && <span style={typeStyle(typography, "h3")}>{block.label}</span>}
          {children}
        </div>
      );

    case "list":
      return (
        <div className="flex flex-col rounded-md border overflow-hidden" style={{ borderColor: t.border }}>
          {block.children.map((child, i) => (
            <div
              key={i}
              className="px-3 py-2 border-b last:border-b-0"
              style={{ borderColor: t.border, background: i % 2 === 0 ? "transparent" : `${t.border}33` }}
            >
              <ScreenBlockView block={child} colors={colors} typography={typography} depth={depth + 1} />
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <div className="rounded-md border overflow-hidden" style={{ borderColor: t.border }}>
          {block.children.map((child, i) => (
            <div
              key={i}
              className="grid grid-cols-3 gap-2 px-3 py-2 border-b last:border-b-0"
              style={{ borderColor: t.border }}
            >
              <ScreenBlockView block={child} colors={colors} typography={typography} depth={depth + 1} />
            </div>
          ))}
        </div>
      );

    case "button": {
      const bg = findByVariant(colors, block.variant, t.primary);
      return (
        <span
          className="inline-flex items-center justify-center rounded-md px-4 py-2 self-start"
          style={{ ...typeStyle(typography, "button"), background: bg, color: "#FFFFFF" }}
        >
          {block.label || "Button"}
        </span>
      );
    }

    case "image_placeholder":
      return (
        <div
          className="rounded-md flex items-center justify-center h-28"
          style={{ background: `${t.border}55`, ...typeStyle(typography, "caption"), color: t.textMuted }}
        >
          {block.label || "image"}
        </div>
      );

    case "stat_group":
      return (
        <div className="flex gap-4 flex-wrap">
          {block.children.length > 0 ? (
            children
          ) : (
            <div className="flex flex-col gap-1">
              <span style={{ ...typeStyle(typography, "h2"), color: t.text }}>{block.label || "0"}</span>
            </div>
          )}
        </div>
      );

    case "text":
      return (
        <span style={{ ...typeStyle(typography, block.variant || "body"), color: t.text }}>{block.label}</span>
      );

    case "container":
    default:
      return <div className="flex flex-col gap-2">{children}</div>;
  }
}
