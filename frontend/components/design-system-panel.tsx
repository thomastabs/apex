"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Palette, Plus, RefreshCw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import { Input, Textarea } from "@/components/ui/primitives";
import { GuideTheAI } from "@/components/guide-the-ai";
import {
  useGenerateDesignSystem,
  useGenerateDesignSystemScreen,
  useLoadDesignSystem,
  useSaveDesignSystem,
} from "@/lib/hooks/use-phase2";
import { ScreenBlockView } from "@/components/design-system-block";
import { deriveDarkPalette } from "@/lib/design-system-dark";
import { checkComponentStates, checkPaletteTextOnSurface, type WcagLevel } from "@/lib/wcag";
import type {
  ComponentStateStyle,
  ComponentStates,
  DesignSystemColor,
  DesignSystemResponse,
  DesignSystemScreen,
  NavigationPattern,
  TypographyStyle,
} from "@/lib/api/types";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";

const DESIGN_SYSTEM_STEPS = [
  "Reading the UX brief…",
  "Choosing colors and typography…",
  "Picking a navigation pattern…",
  "Composing screen mockups…",
];

const NAV_PATTERNS: NavigationPattern["pattern"][] = ["topbar", "sidebar", "tabs", "bottom_nav"];

const TABS = ["Overview", "Screens", "Components", "Accessibility"] as const;
type Tab = (typeof TABS)[number];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function safeSwatch(hex: string, fallback: string): string {
  return HEX_RE.test(hex) ? hex : fallback;
}

const LEVEL_TONE: Record<WcagLevel, string> = {
  AAA: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  AA: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Fail: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function LevelBadge({ level }: { level: WcagLevel }) {
  return (
    <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-semibold", LEVEL_TONE[level])}>
      {level}
    </span>
  );
}

function iconButtonClass(dark: boolean) {
  return cn(
    "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    dark
      ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200",
  );
}

function NavSchematic({ navigation, dark }: { navigation: DesignSystemResponse["navigation"]; dark: boolean }) {
  const chip = cn(
    "rounded px-2 py-1 text-[10px] font-medium",
    dark ? "bg-neutral-800 text-neutral-300" : "bg-white text-slate-600 shadow-sm",
  );
  const frame = cn("rounded-md border p-3", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-100");

  if (navigation.pattern === "sidebar") {
    return (
      <div className={cn(frame, "flex gap-2")}>
        <div className="flex max-h-40 w-20 flex-col gap-1 overflow-y-auto">
          {navigation.items.map((item, i) => (
            <span key={`${item}-${i}`} className={chip}>{item}</span>
          ))}
        </div>
        <div className={cn("min-h-32 flex-1 rounded", dark ? "bg-neutral-800" : "bg-white")} />
      </div>
    );
  }

  if (navigation.pattern === "bottom_nav") {
    return (
      <div className={cn(frame, "flex min-h-32 flex-col justify-between")}>
        <div className={cn("flex-1 rounded mb-2", dark ? "bg-neutral-800" : "bg-white")} />
        <div className="flex flex-wrap justify-center gap-2">
          {navigation.items.map((item, i) => (
            <span key={`${item}-${i}`} className={chip}>{item}</span>
          ))}
        </div>
      </div>
    );
  }

  if (navigation.pattern === "tabs") {
    return (
      <div className={frame}>
        <div className="flex flex-wrap gap-2 mb-2">
          {navigation.items.map((item, i) => (
            <span key={`${item}-${i}`} className={cn(chip, i === 0 && "ring-1 ring-violet-500")}>{item}</span>
          ))}
        </div>
        <div className={cn("h-16 rounded", dark ? "bg-neutral-800" : "bg-white")} />
      </div>
    );
  }

  // topbar (default)
  return (
    <div className={frame}>
      <div className="flex gap-2 mb-2 flex-wrap">
        {navigation.items.map((item, i) => (
          <span key={`${item}-${i}`} className={chip}>{item}</span>
        ))}
      </div>
      <div className={cn("h-16 rounded", dark ? "bg-neutral-800" : "bg-white")} />
    </div>
  );
}

type Updater = (fn: (d: DesignSystemResponse) => DesignSystemResponse) => void;

function OverviewTab({ data, dark, onChange }: { data: DesignSystemResponse; dark: boolean; onChange: Updater }) {
  const updateColor = (i: number, patch: Partial<DesignSystemColor>) =>
    onChange((d) => ({ ...d, colors: d.colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const removeColor = (i: number) =>
    onChange((d) => ({ ...d, colors: d.colors.filter((_, idx) => idx !== i) }));
  const addColor = () =>
    onChange((d) => ({ ...d, colors: [...d.colors, { name: "New color", hex: "#888888", usage: "" }] }));

  const setFontFamily = (font_family: string) =>
    onChange((d) => ({ ...d, typography: { ...d.typography, font_family } }));
  const updateStyle = (i: number, patch: Partial<TypographyStyle>) =>
    onChange((d) => ({
      ...d,
      typography: { ...d.typography, styles: d.typography.styles.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) },
    }));
  const removeStyle = (i: number) =>
    onChange((d) => ({ ...d, typography: { ...d.typography, styles: d.typography.styles.filter((_, idx) => idx !== i) } }));
  const addStyle = () =>
    onChange((d) => ({
      ...d,
      typography: { ...d.typography, styles: [...d.typography.styles, { role: "body", size_px: 16, weight: 400, line_height: 1.5 }] },
    }));

  const setNavPattern = (pattern: NavigationPattern["pattern"]) =>
    onChange((d) => ({ ...d, navigation: { ...d.navigation, pattern } }));
  const setNavJustification = (justification: string) =>
    onChange((d) => ({ ...d, navigation: { ...d.navigation, justification } }));
  const updateNavItem = (i: number, value: string) =>
    onChange((d) => ({ ...d, navigation: { ...d.navigation, items: d.navigation.items.map((it, idx) => (idx === i ? value : it)) } }));
  const removeNavItem = (i: number) =>
    onChange((d) => ({ ...d, navigation: { ...d.navigation, items: d.navigation.items.filter((_, idx) => idx !== i) } }));
  const addNavItem = () =>
    onChange((d) => ({ ...d, navigation: { ...d.navigation, items: [...d.navigation.items, "New item"] } }));

  const labelClass = cn("text-xs font-semibold uppercase tracking-wide mb-2", dark ? "text-neutral-500" : "text-slate-400");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h4 className={labelClass}>Colors</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {data.colors.map((c, i) => (
            <div
              key={i}
              className={cn("flex flex-col gap-1.5 rounded-md border p-2", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white")}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={safeSwatch(c.hex, "#888888")}
                  onChange={(e) => updateColor(i, { hex: e.target.value })}
                  className="size-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`${c.name || "color"} swatch`}
                />
                <Input
                  value={c.hex}
                  onChange={(e) => updateColor(i, { hex: e.target.value })}
                  className="h-6 flex-1 px-1.5 py-0 font-mono text-[10px]"
                />
                <button type="button" onClick={() => removeColor(i)} className="shrink-0 text-neutral-400 hover:text-red-500" aria-label="Remove color">
                  <X className="size-3.5" />
                </button>
              </div>
              <Input value={c.name} onChange={(e) => updateColor(i, { name: e.target.value })} placeholder="Name" className="h-6 px-1.5 py-0 text-xs" />
              <Input value={c.usage} onChange={(e) => updateColor(i, { usage: e.target.value })} placeholder="Usage" className="h-6 px-1.5 py-0 text-[10px]" />
            </div>
          ))}
          <button
            type="button"
            onClick={addColor}
            className={cn(
              "flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs font-medium transition-colors",
              dark ? "border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300" : "border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600",
            )}
          >
            <Plus className="size-3.5" /> Add color
          </button>
        </div>
      </div>

      <div>
        <h4 className={labelClass}>Typography</h4>
        <Input
          value={data.typography.font_family}
          onChange={(e) => setFontFamily(e.target.value)}
          placeholder="Font family"
          className="mb-2 h-8 max-w-xs text-sm"
        />
        <div className="flex flex-col gap-2">
          {data.typography.styles.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input value={s.role} onChange={(e) => updateStyle(i, { role: e.target.value })} placeholder="Role" className="h-7 w-28 px-2 py-0 text-xs" />
              <Input
                type="number"
                value={s.size_px}
                onChange={(e) => updateStyle(i, { size_px: Number(e.target.value) })}
                className="h-7 w-16 px-2 py-0 text-xs"
                aria-label={`${s.role || "style"} size in px`}
              />
              <span className={cn("text-[10px]", dark ? "text-neutral-500" : "text-slate-400")}>px</span>
              <Input
                type="number"
                value={s.weight}
                onChange={(e) => updateStyle(i, { weight: Number(e.target.value) })}
                className="h-7 w-16 px-2 py-0 text-xs"
                aria-label={`${s.role || "style"} weight`}
              />
              <span className={cn("text-[10px]", dark ? "text-neutral-500" : "text-slate-400")}>weight</span>
              <Input
                type="number"
                step={0.1}
                value={s.line_height}
                onChange={(e) => updateStyle(i, { line_height: Number(e.target.value) })}
                className="h-7 w-16 px-2 py-0 text-xs"
                aria-label={`${s.role || "style"} line height`}
              />
              <span className={cn("text-[10px]", dark ? "text-neutral-500" : "text-slate-400")}>line-height</span>
              <button type="button" onClick={() => removeStyle(i)} className="ml-auto text-neutral-400 hover:text-red-500" aria-label="Remove style">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addStyle}
            className={cn("flex items-center gap-1 self-start rounded px-2 py-1 text-xs font-medium", dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-200")}
          >
            <Plus className="size-3.5" /> Add style
          </button>
        </div>
      </div>

      <div>
        <h4 className={labelClass}>Navigation</h4>
        <select
          value={data.navigation.pattern}
          onChange={(e) => setNavPattern(e.target.value as NavigationPattern["pattern"])}
          className={cn(
            "mb-2 h-8 rounded border px-2 text-sm outline-none",
            dark ? "border-neutral-700 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-900",
          )}
        >
          {NAV_PATTERNS.map((p) => (
            <option key={p} value={p}>{p.replace("_", " ")}</option>
          ))}
        </select>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {data.navigation.items.map((item, i) => (
            <span
              key={i}
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", dark ? "bg-neutral-800 text-neutral-200" : "bg-slate-100 text-slate-700")}
            >
              <input
                value={item}
                onChange={(e) => updateNavItem(i, e.target.value)}
                className="w-24 bg-transparent outline-none"
              />
              <button type="button" onClick={() => removeNavItem(i)} className="text-neutral-400 hover:text-red-500" aria-label="Remove nav item">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={addNavItem}
            className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium", dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-200")}
          >
            <Plus className="size-3" /> Add
          </button>
        </div>
        <NavSchematic navigation={data.navigation} dark={dark} />
        <Textarea
          value={data.navigation.justification}
          onChange={(e) => setNavJustification(e.target.value)}
          placeholder="Why this navigation pattern…"
          className="mt-2 h-16 resize-y text-xs"
        />
      </div>
    </div>
  );
}

function ScreensTab({
  data,
  dark,
  onChange,
  canGenerate,
  pendingTarget,
  onRegenerateScreen,
  onCancelScreen,
}: {
  data: DesignSystemResponse;
  dark: boolean;
  onChange: Updater;
  canGenerate: boolean;
  pendingTarget: string | null;
  onRegenerateScreen: (screenId: string | undefined, instructions: string) => void;
  onCancelScreen: () => void;
}) {
  const [screensDark, setScreensDark] = useState(false);
  const [guidanceById, setGuidanceById] = useState<Record<string, string>>({});
  const [newGuidance, setNewGuidance] = useState("");
  const colors = screensDark ? deriveDarkPalette(data.colors) : data.colors;
  const surface = colors.find((c) => /surface|background|bg|canvas/i.test(c.name))?.hex ?? (screensDark ? "#0F172A" : "#FFFFFF");
  const screenBusy = pendingTarget !== null;

  const updateScreen = (id: string, patch: Partial<DesignSystemScreen>) =>
    onChange((d) => ({ ...d, screens: d.screens.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeScreen = (id: string) =>
    onChange((d) => ({ ...d, screens: d.screens.filter((s) => s.id !== id) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setScreensDark(false)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            !screensDark ? "bg-violet-600 text-white" : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-200",
          )}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setScreensDark(true)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            screensDark ? "bg-violet-600 text-white" : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-200",
          )}
        >
          Dark
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {data.screens.map((screen) => {
          const isThisPending = pendingTarget === screen.id;
          return (
            <div key={screen.id} className={cn("flex flex-col rounded-lg border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
              <div className={cn("flex items-center gap-2 px-3 py-1.5", dark ? "bg-neutral-800" : "bg-slate-100")}>
                <Input
                  value={screen.label}
                  onChange={(e) => updateScreen(screen.id, { label: e.target.value })}
                  className="h-6 flex-1 px-1.5 py-0 text-xs font-semibold"
                  placeholder="Label"
                />
                <Input
                  value={screen.archetype}
                  onChange={(e) => updateScreen(screen.id, { archetype: e.target.value })}
                  className="h-6 flex-1 px-1.5 py-0 text-[10px]"
                  placeholder="Archetype"
                />
                <button
                  type="button"
                  onClick={() => removeScreen(screen.id)}
                  className="shrink-0 text-neutral-400 hover:text-red-500"
                  aria-label={`Remove ${screen.label}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-3 p-3" style={{ background: surface }}>
                {screen.blocks.map((block, i) => (
                  <ScreenBlockView key={i} block={block} colors={colors} typography={data.typography} />
                ))}
              </div>
              <div className={cn("flex flex-col gap-2 border-t p-2", dark ? "border-neutral-700" : "border-slate-200")}>
                <GuideTheAI
                  value={guidanceById[screen.id] ?? ""}
                  onChange={(v) => setGuidanceById((g) => ({ ...g, [screen.id]: v }))}
                  dark={dark}
                  disabled={screenBusy}
                  placeholder="Notes for regenerating this screen only — layout, content, emphasis."
                />
                {isThisPending ? (
                  <CancelButton onCancel={onCancelScreen} className="h-7 self-start px-2 py-1 text-xs" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onRegenerateScreen(screen.id, guidanceById[screen.id] ?? "")}
                    disabled={screenBusy || !canGenerate}
                    className={cn(iconButtonClass(dark), "self-start")}
                  >
                    <RefreshCw className="size-3" /> Regenerate this screen
                  </button>
                )}
                <AiGroundingNote files={AI_GROUNDING.phase2VisualSystem} dark={dark} />
              </div>
            </div>
          );
        })}

        <div className={cn("flex flex-col justify-between gap-2 rounded-lg border border-dashed p-3", dark ? "border-neutral-700" : "border-slate-300")}>
          <div>
            <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", dark ? "text-neutral-500" : "text-slate-400")}>
              Add a screen
            </p>
            <GuideTheAI
              value={newGuidance}
              onChange={setNewGuidance}
              dark={dark}
              disabled={screenBusy}
              placeholder="Describe the new screen — its role, key content, layout ideas."
            />
          </div>
          {pendingTarget === "__new__" ? (
            <CancelButton onCancel={onCancelScreen} className="h-7 self-start px-2 py-1 text-xs" />
          ) : (
            <button
              type="button"
              onClick={() => onRegenerateScreen(undefined, newGuidance)}
              disabled={screenBusy || !canGenerate}
              className={cn(
                "flex items-center gap-1 self-start rounded px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                "bg-violet-600 hover:bg-violet-500",
              )}
            >
              <Plus className="size-3.5" /> Add screen
            </button>
          )}
          <AiGroundingNote files={AI_GROUNDING.phase2VisualSystem} dark={dark} />
        </div>
      </div>
    </div>
  );
}

function EditableStateBox({
  label,
  style,
  fontFamily,
  dark,
  onChange,
}: {
  label: string;
  style: ComponentStateStyle;
  fontFamily: string;
  dark: boolean;
  onChange: (patch: Partial<ComponentStateStyle>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="rounded-md px-3 py-2 text-center text-xs font-medium capitalize"
        style={{
          background: style.background,
          color: style.text_color,
          border: style.border ? `1px solid ${style.border}` : undefined,
          opacity: style.opacity,
          fontFamily,
        }}
      >
        {label}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={safeSwatch(style.background, "#888888")}
          onChange={(e) => onChange({ background: e.target.value })}
          className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          title="Background"
          aria-label={`${label} background`}
        />
        <input
          type="color"
          value={safeSwatch(style.text_color, "#000000")}
          onChange={(e) => onChange({ text_color: e.target.value })}
          className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          title="Text color"
          aria-label={`${label} text color`}
        />
        <Input value={style.border} onChange={(e) => onChange({ border: e.target.value })} placeholder="border" className="h-5 flex-1 px-1 py-0 font-mono text-[9px]" />
      </div>
      <div className="flex items-center gap-1">
        <span className={cn("text-[9px]", dark ? "text-neutral-500" : "text-slate-400")}>opacity</span>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="h-5 w-14 px-1 py-0 text-[9px]"
        />
      </div>
      <Input value={style.note} onChange={(e) => onChange({ note: e.target.value })} placeholder="note" className="h-5 px-1 py-0 text-[9px]" />
    </div>
  );
}

function ComponentsTab({ data, dark, onChange }: { data: DesignSystemResponse; dark: boolean; onChange: Updater }) {
  const updateState = (
    component: ComponentStates["component"],
    state: "default" | "hover" | "disabled" | "error",
    patch: Partial<ComponentStateStyle>,
  ) =>
    onChange((d) => ({
      ...d,
      component_states: d.component_states.map((c) =>
        c.component === component ? { ...c, [state]: { ...c[state], ...patch } } : c,
      ),
    }));

  return (
    <div className="flex flex-col gap-6">
      {data.component_states.map((c) => (
        <div key={c.component}>
          <h4 className={cn("text-xs font-semibold uppercase tracking-wide mb-2 capitalize", dark ? "text-neutral-500" : "text-slate-400")}>
            {c.component}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["default", "hover", "disabled", "error"] as const).map((state) => (
              <EditableStateBox
                key={state}
                label={state}
                style={c[state]}
                fontFamily={data.typography.font_family}
                dark={dark}
                onChange={(patch) => updateState(c.component, state, patch)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccessibilityTab({ data, dark }: { data: DesignSystemResponse; dark: boolean }) {
  const checks = [...checkComponentStates(data.component_states), ...checkPaletteTextOnSurface(data.colors)];
  if (checks.length === 0) {
    return (
      <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
        No text/surface token pairs were derivable from this palette to check.
      </p>
    );
  }
  return (
    <div className="flex flex-col divide-y" style={{ borderColor: dark ? "#404040" : "#e2e8f0" }}>
      {checks.map((check) => (
        <div key={check.label} className="flex items-center justify-between py-2 gap-3">
          <div className="flex items-center gap-2">
            <span
              className="size-4 rounded-full border"
              style={{ background: check.foreground, borderColor: dark ? "#404040" : "#cbd5e1" }}
            />
            <span
              className="size-4 rounded-full border -ml-2"
              style={{ background: check.background, borderColor: dark ? "#404040" : "#cbd5e1" }}
            />
            <span className={cn("text-sm", dark ? "text-neutral-200" : "text-slate-700")}>{check.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono", dark ? "text-neutral-500" : "text-slate-400")}>
              {check.ratio.toFixed(2)}:1
            </span>
            <LevelBadge level={check.level} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DesignSystemPanel({
  uxBriefContent,
  dark,
  standalone = false,
  guidance = "",
}: {
  uxBriefContent: string;
  dark: boolean;
  /** Rendered as a peer step card's content (phase2-workflow.tsx "Step 4")
   * rather than its own collapsible accordion — skips the outer border and
   * header/toggle, always expanded, since the parent card already provides
   * the chrome. */
  standalone?: boolean;
  /** Shared "Guide the AI" text from the Step 2 input — steers the whole-bundle
   * generate/regenerate call. Per-screen regeneration has its own smaller
   * guidance field instead (see ScreensTab). */
  guidance?: string;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = standalone || open;
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<DesignSystemResponse | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const loadQuery = useLoadDesignSystem();
  const generateMut = useGenerateDesignSystem();
  const saveMut = useSaveDesignSystem();
  const screenMut = useGenerateDesignSystemScreen();

  const hasData = Boolean(data);
  const canGenerate = uxBriefContent.trim().length > 0;

  useEffect(() => {
    if (loadQuery.data) setData(loadQuery.data);
  }, [loadQuery.data]);

  const updateData = useCallback<Updater>((fn) => {
    setData((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    generateMut.mutate({ ux_brief_md: uxBriefContent, instructions: guidance }, {
      onSuccess: (result) => {
        setData(result);
        setDirty(false);
        setTab("Overview");
        setOpen(true);
        toast.success("Design system generated.");
      },
    });
  }, [canGenerate, uxBriefContent, guidance, generateMut]);

  const handleSave = useCallback(() => {
    if (!data) return;
    saveMut.mutate(data, {
      onSuccess: () => {
        setDirty(false);
        toast.success("Design system saved.");
      },
    });
  }, [data, saveMut]);

  const handleRegenerateScreen = useCallback(
    (screenId: string | undefined, instructions: string) => {
      if (!canGenerate) return;
      setPendingTarget(screenId ?? "__new__");
      screenMut.mutate(
        { ux_brief_md: uxBriefContent, screen_id: screenId, instructions },
        {
          onSuccess: (result) => {
            setData(result);
            setDirty(false);
            toast.success(screenId ? "Screen regenerated." : "Screen added.");
          },
          onSettled: () => setPendingTarget(null),
        },
      );
    },
    [canGenerate, uxBriefContent, screenMut],
  );

  const handleCancelScreen = useCallback(() => {
    screenMut.cancel();
    setPendingTarget(null);
  }, [screenMut]);

  const saveButton = hasData && (
    <button
      type="button"
      onClick={handleSave}
      disabled={!dirty || saveMut.isPending}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        dirty ? "bg-emerald-600 text-white hover:bg-emerald-700" : dark ? "text-neutral-500" : "text-slate-400",
      )}
    >
      {saveMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
      {dirty ? "Save Changes" : "Saved"}
    </button>
  );

  const regenerateButton = hasData && (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
      disabled={generateMut.isPending || !canGenerate}
      className={iconButtonClass(dark)}
    >
      {generateMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
      Regenerate
    </button>
  );

  const body = (
    <>
      {standalone && hasData && (
        <div className="mb-3 flex justify-end gap-2">
          {saveButton}
          {regenerateButton}
        </div>
      )}
      {generateMut.isPending && !hasData ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 className="size-8 animate-spin text-violet-500" />
          <p className={cn("text-sm font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
            Generating design system…
          </p>
          <div className="w-full max-w-md">
            <AIProgressIndicator steps={DESIGN_SYSTEM_STEPS} isPending={generateMut.isPending} dark={dark} />
          </div>
          <CancelButton onCancel={() => generateMut.cancel()} />
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Palette className={cn("size-8", dark ? "text-neutral-600" : "text-slate-300")} />
          <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
            {canGenerate
              ? "Generate a color palette, typography, navigation pattern, and screen mockups from the UX Brief above."
              : "Generate the UX Brief section first."}
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generateMut.isPending || !canGenerate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              canGenerate && !generateMut.isPending
                ? "bg-violet-600 hover:bg-violet-500"
                : "bg-violet-300 cursor-not-allowed dark:bg-violet-900",
            )}
          >
            <Palette className="size-4" />Generate Design System
          </button>
          <AiGroundingNote files={AI_GROUNDING.phase2VisualSystem} dark={dark} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 border-b pb-2" style={{ borderColor: dark ? "#404040" : "#e2e8f0" }}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t
                    ? "bg-violet-600 text-white"
                    : dark
                      ? "text-neutral-400 hover:bg-neutral-800"
                      : "text-slate-500 hover:bg-slate-200",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Overview" && <OverviewTab data={data!} dark={dark} onChange={updateData} />}
          {tab === "Screens" && (
            <ScreensTab
              data={data!}
              dark={dark}
              onChange={updateData}
              canGenerate={canGenerate}
              pendingTarget={pendingTarget}
              onRegenerateScreen={handleRegenerateScreen}
              onCancelScreen={handleCancelScreen}
            />
          )}
          {tab === "Components" && <ComponentsTab data={data!} dark={dark} onChange={updateData} />}
          {tab === "Accessibility" && <AccessibilityTab data={data!} dark={dark} />}
        </div>
      )}
    </>
  );

  if (standalone) {
    return <div>{body}</div>;
  }

  return (
    <div
      className={cn(
        "rounded-lg border mt-2",
        dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
      )}
    >
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-violet-500" />
          <span className={dark ? "text-neutral-100" : "text-slate-800"}>Visual Design System</span>
          {hasData && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              {data!.colors.length} colors · {data!.screens.length} screens
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveButton}
          {regenerateButton}
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              dark ? "text-neutral-400" : "text-slate-400",
              open && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div className={cn("border-t px-4 py-4", dark ? "border-neutral-700" : "border-slate-200")}>
          {body}
        </div>
      )}
    </div>
  );
}
