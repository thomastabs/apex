"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, GitBranchPlus, Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { Button, Textarea } from "@/components/ui/primitives";
import {
  useDesignDeltaStatus,
  useGenerateDesignDelta,
  usePersistDesignDelta,
} from "@/lib/hooks/use-phase2";
import type { DesignDeltaResult } from "@/lib/api/phase2";
import { cn } from "@/lib/utils";

// Additive design for stories pushed after the project design locked: the
// locked design stays read-only, the AI proposes only what the new stories
// need, and the human reviews/edits before appending. Purely additive deltas
// bump the spec MINOR version; a delta that touches existing design records a
// real amendment (MAJOR + spec_drift) on the previously designed stories.
export function DesignDeltaPanel({ dark }: { dark: boolean }) {
  const status = useDesignDeltaStatus();
  const generate = useGenerateDesignDelta();
  const persist = usePersistDesignDelta();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<DesignDeltaResult | null>(null);

  const pending = status.data?.design_locked ? status.data.pending : [];
  if (pending.length === 0) return null;

  const chosenIds = pending
    .map((p) => p.story_id)
    .filter((id) => selected.size === 0 || selected.has(id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev.size === 0 ? pending.map((p) => p.story_id) : prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const busy = generate.isPending || persist.isPending;
  const hasContent = Boolean(
    draft && (draft.ux_brief_addendum.trim() || draft.endpoints_delta.trim() || draft.data_model_delta.trim()),
  );

  const mutedClass = dark ? "text-neutral-400" : "text-slate-500";
  const boxClass = dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-200 bg-white";

  return (
    <div className={cn(
      "rounded-md border",
      dark ? "border-violet-700/50 bg-violet-950/20" : "border-violet-300 bg-violet-50/60",
    )}>
      <button
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm",
          dark ? "text-violet-300" : "text-violet-700",
        )}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} />
        <GitBranchPlus className="size-4 shrink-0" />
        <span className="font-semibold">
          {pending.length} stor{pending.length === 1 ? "y" : "ies"} arrived after the design lock
        </span>
        <span className={cn("hidden text-xs sm:inline", dark ? "text-violet-400/70" : "text-violet-500")}>
          — extend the locked design with a delta instead of regenerating everything
        </span>
      </button>

      {open ? (
        <div className={cn("space-y-4 border-t px-4 py-4", dark ? "border-violet-800/40" : "border-violet-200")}>
          {/* Pending story picker */}
          <div className="space-y-1.5">
            {pending.map((p) => {
              const checked = selected.size === 0 || selected.has(p.story_id);
              return (
                <label key={p.story_id} className={cn("flex items-center gap-2 text-sm", dark ? "text-neutral-200" : "text-slate-700")}>
                  <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(p.story_id)} className="accent-violet-500" />
                  <span className="font-medium">#{p.story_id}</span>
                  <span className="truncate">{p.title}</span>
                  {p.epic_title ? <span className={cn("truncate text-xs", mutedClass)}>· {p.epic_title}</span> : null}
                </label>
              );
            })}
          </div>

          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional guidance for the delta (e.g. reuse the existing auth endpoints)…"
            rows={2}
            disabled={busy}
          />

          <Button
            className="gap-1.5"
            disabled={busy || chosenIds.length === 0}
            onClick={() =>
              generate.mutate(
                { storyIds: chosenIds, instructions },
                { onSuccess: (data) => setDraft(data) },
              )
            }
          >
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <GitBranchPlus className="size-4" />}
            {generate.isPending ? "Generating delta…" : draft ? "Regenerate delta" : "Generate design delta"}
          </Button>

          {generate.isPending ? (
            <AIProgressIndicator
              steps={[
                "Reading the locked design",
                "Deriving additions for the new stories",
                "Checking impact on the existing design",
              ]}
              isPending={generate.isPending}
              dark={dark}
            />
          ) : null}

          {draft ? (
            <div className="space-y-4">
              {draft.touches_existing.length > 0 ? (
                <div className={cn(
                  "space-y-1 rounded-md border px-3 py-2.5 text-xs",
                  dark ? "border-amber-600/40 bg-amber-500/10 text-amber-300" : "border-amber-300 bg-amber-50 text-amber-700",
                )}>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="size-3.5" />
                    This delta touches the existing design — appending will record an amendment
                    (MAJOR version bump + drift flags on previously designed stories):
                  </p>
                  <ul className="list-disc pl-5">
                    {draft.touches_existing.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              ) : (
                <p className={cn("text-xs", dark ? "text-emerald-400" : "text-emerald-600")}>
                  Purely additive — appending bumps the spec MINOR version, nothing existing drifts.
                </p>
              )}

              {([
                ["UX Brief addendum", "ux_brief_addendum"],
                ["Endpoints (delta)", "endpoints_delta"],
                ["Data Model (delta)", "data_model_delta"],
              ] as const).map(([label, key]) => (
                <div key={key} className={cn("rounded-md border p-3", boxClass)}>
                  <p className={cn("mb-1.5 text-xs font-semibold uppercase tracking-wider", mutedClass)}>{label}</p>
                  <Textarea
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    rows={draft[key].trim() ? 8 : 2}
                    placeholder="(no additions)"
                    disabled={busy}
                    className="font-mono text-xs"
                  />
                </div>
              ))}

              <Button
                className="gap-1.5"
                disabled={busy || !hasContent}
                onClick={() =>
                  persist.mutate(
                    {
                      story_ids: draft.story_ids,
                      ux_brief_addendum: draft.ux_brief_addendum,
                      endpoints_delta: draft.endpoints_delta,
                      data_model_delta: draft.data_model_delta,
                      touches_existing: draft.touches_existing,
                    },
                    {
                      onSuccess: (data) => {
                        const version = data.versions["technical-spec.md"];
                        toast.success(
                          data.amended
                            ? `Delta appended (spec v${version}); amendment recorded for ${data.affected_story_ids.length} existing stories`
                            : `Delta appended — spec v${version}, ${data.story_ids.length} stor${data.story_ids.length === 1 ? "y" : "ies"} design-locked`,
                        );
                        if (data.taiga_failures.length > 0) {
                          toast.warning(`${data.taiga_failures.length} PM transition(s) failed — update story status manually.`);
                        }
                        setDraft(null);
                        setSelected(new Set());
                        setInstructions("");
                      },
                    },
                  )
                }
              >
                {persist.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
                {persist.isPending ? "Appending…" : "Append to locked design"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
