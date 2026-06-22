"use client";

import { cn } from "@/lib/utils";
import type { CrossCheckResult } from "@/lib/api/phase1";

/**
 * Shared multi-model cross-check result panel (Phase 1 stories / Phase 2 endpoints
 * / Phase 3 tasks). Shows agreed count + what each model surfaced that the other
 * missed; each only-in-alt item gets an "Add" affordance wired by the caller.
 */
export function CrossCheckPanel({
  result,
  dark,
  onAdd,
}: {
  result: CrossCheckResult;
  dark: boolean;
  onAdd: (item: { title: string; description: string }) => void;
}) {
  return (
    <div className={cn("rounded-md border p-3 text-xs", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-slate-50")}>
      <p className={cn("mb-2 font-semibold", dark ? "text-neutral-200" : "text-slate-700")}>
        {result.primary_label} vs {result.alt_label}: {result.agreed.length} agreed
      </p>
      {result.only_alt.length ? (
        <div className="mb-2">
          <p className="mb-1 font-medium text-emerald-500">Only {result.alt_label} suggested:</p>
          <ul className="space-y-1">
            {result.only_alt.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
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
        <div>
          <p className={cn("mb-1 font-medium", dark ? "text-neutral-400" : "text-slate-500")}>Only {result.primary_label} suggested:</p>
          <ul className={cn("space-y-0.5", dark ? "text-neutral-400" : "text-slate-500")}>
            {result.only_primary.map((s, i) => <li key={i}>{s.title}</li>)}
          </ul>
        </div>
      ) : null}
      {!result.only_alt.length && !result.only_primary.length ? (
        <p className={dark ? "text-neutral-400" : "text-slate-500"}>Both models agreed — nothing extra to add.</p>
      ) : null}
    </div>
  );
}
