"use client";

import { Check, GitCompare, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrossCheckResult } from "@/lib/api/phase1";
import type { AiConfigResponse } from "@/lib/api/workspace";

function providerOf(modelId: string): "openai" | "google" | "anthropic" {
  if (/^(gpt-|o1-|o3-|o4-)/.test(modelId)) return "openai";
  if (modelId.startsWith("gemini-")) return "google";
  return "anthropic";
}

/** Alt-model selector for cross-check — models from a DIFFERENT configured
 * provider than the active model. Empty value = "auto" (backend picks). */
export function AltModelSelect({
  aiConfig,
  value,
  onChange,
  dark,
  disabled,
}: {
  aiConfig?: AiConfigResponse;
  value: string;
  onChange: (id: string) => void;
  dark: boolean;
  disabled?: boolean;
}) {
  const primaryProvider = providerOf(aiConfig?.model ?? "");
  const configured = new Set(aiConfig?.configured_providers ?? []);
  const options = (aiConfig?.available_models ?? []).filter(
    (m) => (m.provider ? m.provider !== primaryProvider && configured.has(m.provider) : false),
  );
  return (
    <select
      aria-label="Cross-check model"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 rounded-md border px-2 text-sm outline-none focus:border-violet-500 disabled:opacity-50",
        dark ? "border-neutral-700 bg-neutral-950 text-neutral-200" : "border-slate-300 bg-white text-slate-900",
      )}
    >
      <option value="">Auto (other provider)</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>{m.label}{m.provider ? ` · ${m.provider}` : ""}</option>
      ))}
    </select>
  );
}

function ModelChip({ label, tone, dark }: { label: string; tone: "primary" | "alt"; dark: boolean }) {
  return (
    <span className={cn(
      "rounded px-1.5 py-0.5 text-[11px] font-semibold",
      tone === "primary"
        ? (dark ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-700")
        : (dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"),
    )}>{label}</span>
  );
}

/**
 * Shared multi-model cross-check result panel (Phase 1 stories / Phase 2 endpoints
 * / Phase 3 tasks). Shows agreed count + what each model surfaced that the other
 * missed; each only-in-alt item has Add, plus Add-all and dismiss.
 */
export function CrossCheckPanel({
  result,
  dark,
  onAdd,
  onDismiss,
  noun = "item",
}: {
  result: CrossCheckResult;
  dark: boolean;
  onAdd: (item: { title: string; description: string }) => void;
  onDismiss?: () => void;
  noun?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", dark ? "border-violet-500/30 bg-neutral-900/70" : "border-violet-200 bg-violet-50/40")}>
      <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2", dark ? "border-neutral-800" : "border-violet-100")}>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <GitCompare className={cn("size-3.5", dark ? "text-violet-300" : "text-violet-600")} />
          <ModelChip label={result.primary_label} tone="primary" dark={dark} />
          <span className={dark ? "text-neutral-500" : "text-slate-400"}>vs</span>
          <ModelChip label={result.alt_label} tone="alt" dark={dark} />
          <span className={cn("ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", dark ? "bg-neutral-800 text-neutral-300" : "bg-white text-slate-600")}>
            <Check className="size-3 text-emerald-500" /> {result.agreed.length} agreed
          </span>
        </div>
        <div className="flex items-center gap-1">
          {result.only_alt.length > 0 ? (
            <button
              className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-500 hover:bg-emerald-500/25"
              onClick={() => result.only_alt.forEach(onAdd)}
            >
              <Plus className="size-3" /> Add all {result.only_alt.length}
            </button>
          ) : null}
          {onDismiss ? (
            <button className={cn("rounded p-1", dark ? "text-neutral-500 hover:text-neutral-300" : "text-slate-400 hover:text-slate-600")} onClick={onDismiss} aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-3 py-2 text-xs">
        {result.only_alt.length ? (
          <div className="mb-2">
            <p className="mb-1 flex items-center gap-1 font-medium text-emerald-500">
              <Sparkles className="size-3" /> Only {result.alt_label} suggested — {result.only_alt.length} new {noun}(s):
            </p>
            <ul className="space-y-1">
              {result.only_alt.map((s, i) => (
                <li key={i} className={cn("flex items-start justify-between gap-2 rounded px-1.5 py-1", dark ? "hover:bg-neutral-800/60" : "hover:bg-white")}>
                  <span className={dark ? "text-neutral-300" : "text-slate-700"}>
                    <span className="font-medium">{s.title}</span>{s.description ? ` — ${s.description}` : ""}
                  </span>
                  <button
                    className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-500 hover:bg-emerald-500/25"
                    onClick={() => onAdd({ title: s.title, description: s.description })}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.only_primary.length ? (
          <details className={cn("rounded", dark ? "text-neutral-400" : "text-slate-500")}>
            <summary className="cursor-pointer font-medium">Only {result.primary_label} suggested ({result.only_primary.length})</summary>
            <ul className="mt-1 space-y-0.5 pl-3">
              {result.only_primary.map((s, i) => <li key={i}>{s.title}</li>)}
            </ul>
          </details>
        ) : null}
        {!result.only_alt.length && !result.only_primary.length ? (
          <p className={dark ? "text-neutral-400" : "text-slate-500"}>Both models agreed — nothing extra to add.</p>
        ) : null}
      </div>
    </div>
  );
}
