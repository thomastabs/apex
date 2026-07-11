"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Palette, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import { useGenerateDesignSystem, useLoadDesignSystem } from "@/lib/hooks/use-phase2";
import { ScreenBlockView } from "@/components/design-system-block";
import { deriveDarkPalette } from "@/lib/design-system-dark";
import { checkComponentStates, checkPaletteTextOnSurface, relativeLuminance, type WcagLevel } from "@/lib/wcag";
import type { ComponentStates, DesignSystemResponse } from "@/lib/api/types";

const DESIGN_SYSTEM_STEPS = [
  "Reading the UX brief…",
  "Choosing colors and typography…",
  "Picking a navigation pattern…",
  "Composing screen mockups…",
];

const TABS = ["Overview", "Screens", "Components", "Accessibility"] as const;
type Tab = (typeof TABS)[number];

function readableTextColor(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? "#0F172A" : "#FFFFFF";
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

function NavSchematic({ navigation, dark }: { navigation: DesignSystemResponse["navigation"]; dark: boolean }) {
  const chip = cn(
    "rounded px-2 py-1 text-[10px] font-medium",
    dark ? "bg-neutral-800 text-neutral-300" : "bg-white text-slate-600 shadow-sm",
  );
  const frame = cn("rounded-md border p-3", dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-100");

  if (navigation.pattern === "sidebar") {
    return (
      <div className={cn(frame, "flex gap-2 h-32")}>
        <div className="flex flex-col gap-1 w-20">
          {navigation.items.map((item) => (
            <span key={item} className={chip}>{item}</span>
          ))}
        </div>
        <div className={cn("flex-1 rounded", dark ? "bg-neutral-800" : "bg-white")} />
      </div>
    );
  }

  if (navigation.pattern === "bottom_nav") {
    return (
      <div className={cn(frame, "flex flex-col justify-between h-32")}>
        <div className={cn("flex-1 rounded mb-2", dark ? "bg-neutral-800" : "bg-white")} />
        <div className="flex justify-around">
          {navigation.items.map((item) => (
            <span key={item} className={chip}>{item}</span>
          ))}
        </div>
      </div>
    );
  }

  if (navigation.pattern === "tabs") {
    return (
      <div className={frame}>
        <div className="flex gap-2 mb-2">
          {navigation.items.map((item, i) => (
            <span key={item} className={cn(chip, i === 0 && "ring-1 ring-indigo-500")}>{item}</span>
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
        {navigation.items.map((item) => (
          <span key={item} className={chip}>{item}</span>
        ))}
      </div>
      <div className={cn("h-16 rounded", dark ? "bg-neutral-800" : "bg-white")} />
    </div>
  );
}

function OverviewTab({ data, dark }: { data: DesignSystemResponse; dark: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h4 className={cn("text-xs font-semibold uppercase tracking-wide mb-2", dark ? "text-neutral-500" : "text-slate-400")}>
          Colors
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {data.colors.map((c) => (
            <div
              key={c.name}
              className="rounded-md p-3 flex flex-col gap-1"
              style={{ background: c.hex, color: readableTextColor(c.hex) }}
              title={c.usage}
            >
              <span className="text-xs font-semibold">{c.name}</span>
              <span className="text-[10px] font-mono opacity-80">{c.hex}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className={cn("text-xs font-semibold uppercase tracking-wide mb-2", dark ? "text-neutral-500" : "text-slate-400")}>
          Typography — {data.typography.font_family}
        </h4>
        <div className="flex flex-col gap-2">
          {data.typography.styles.map((s) => (
            <div key={s.role} className="flex items-baseline gap-3">
              <span
                style={{ fontFamily: data.typography.font_family, fontSize: s.size_px, fontWeight: s.weight }}
                className={dark ? "text-neutral-100" : "text-slate-800"}
              >
                {s.role}
              </span>
              <span className={cn("text-[10px] font-mono", dark ? "text-neutral-500" : "text-slate-400")}>
                {s.size_px}px / {s.weight}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className={cn("text-xs font-semibold uppercase tracking-wide mb-2", dark ? "text-neutral-500" : "text-slate-400")}>
          Navigation — {data.navigation.pattern.replace("_", " ")}
        </h4>
        <NavSchematic navigation={data.navigation} dark={dark} />
        <p className={cn("text-xs mt-2", dark ? "text-neutral-400" : "text-slate-500")}>{data.navigation.justification}</p>
      </div>
    </div>
  );
}

function ScreensTab({ data, dark }: { data: DesignSystemResponse; dark: boolean }) {
  const [screensDark, setScreensDark] = useState(false);
  const colors = screensDark ? deriveDarkPalette(data.colors) : data.colors;
  const surface = colors.find((c) => /surface|background|bg|canvas/i.test(c.name))?.hex ?? (screensDark ? "#0F172A" : "#FFFFFF");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setScreensDark(false)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            !screensDark ? "bg-indigo-600 text-white" : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-200",
          )}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setScreensDark(true)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            screensDark ? "bg-indigo-600 text-white" : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-200",
          )}
        >
          Dark
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {data.screens.map((screen) => (
          <div key={screen.id} className={cn("rounded-lg border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}>
            <div
              className={cn("px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide", dark ? "bg-neutral-800 text-neutral-400" : "bg-slate-100 text-slate-500")}
            >
              {screen.label} · {screen.archetype}
            </div>
            <div className="flex flex-col gap-3 p-3" style={{ background: surface }}>
              {screen.blocks.map((block, i) => (
                <ScreenBlockView key={i} block={block} colors={colors} typography={data.typography} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StateBox({ label, style, fontFamily }: { label: string; style: ComponentStates["default"]; fontFamily: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="rounded-md px-3 py-2 text-center text-xs font-medium"
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
      {style.note && <span className="text-[10px] text-slate-400 dark:text-neutral-500">{style.note}</span>}
    </div>
  );
}

function ComponentsTab({ data, dark }: { data: DesignSystemResponse; dark: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {data.component_states.map((c) => (
        <div key={c.component}>
          <h4 className={cn("text-xs font-semibold uppercase tracking-wide mb-2 capitalize", dark ? "text-neutral-500" : "text-slate-400")}>
            {c.component}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StateBox label="Default" style={c.default} fontFamily={data.typography.font_family} />
            <StateBox label="Hover" style={c.hover} fontFamily={data.typography.font_family} />
            <StateBox label="Disabled" style={c.disabled} fontFamily={data.typography.font_family} />
            <StateBox label="Error" style={c.error} fontFamily={data.typography.font_family} />
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
}: {
  uxBriefContent: string;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<DesignSystemResponse | null>(null);

  const loadQuery = useLoadDesignSystem();
  const generateMut = useGenerateDesignSystem();

  const hasData = Boolean(data);
  const canGenerate = uxBriefContent.trim().length > 0;

  useEffect(() => {
    if (loadQuery.data) setData(loadQuery.data);
  }, [loadQuery.data]);

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    generateMut.mutate(uxBriefContent, {
      onSuccess: (result) => {
        setData(result);
        setTab("Overview");
        setOpen(true);
        toast.success("Design system generated.");
      },
    });
  }, [canGenerate, uxBriefContent, generateMut]);

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
          <Palette className="size-4 text-indigo-500" />
          <span className={dark ? "text-neutral-100" : "text-slate-800"}>Visual Design System</span>
          {hasData && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {data!.colors.length} colors · {data!.screens.length} screens
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
              disabled={generateMut.isPending || !canGenerate}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                dark
                  ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200",
                (generateMut.isPending || !canGenerate) && "opacity-50 cursor-not-allowed",
              )}
            >
              {generateMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Regenerate
            </button>
          )}
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
      {open && (
        <div className={cn("border-t px-4 py-4", dark ? "border-neutral-700" : "border-slate-200")}>
          {generateMut.isPending && !hasData ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="size-8 animate-spin text-indigo-500" />
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
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-indigo-300 cursor-not-allowed dark:bg-indigo-900",
                )}
              >
                <Palette className="size-4" />Generate Design System
              </button>
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
                        ? "bg-indigo-600 text-white"
                        : dark
                          ? "text-neutral-400 hover:bg-neutral-800"
                          : "text-slate-500 hover:bg-slate-200",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Overview" && <OverviewTab data={data!} dark={dark} />}
              {tab === "Screens" && <ScreensTab data={data!} dark={dark} />}
              {tab === "Components" && <ComponentsTab data={data!} dark={dark} />}
              {tab === "Accessibility" && <AccessibilityTab data={data!} dark={dark} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
