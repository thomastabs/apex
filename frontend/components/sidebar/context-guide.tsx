"use client";

import { BookOpen, PencilLine, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

// One source of truth for what each context file MEANS, who writes it, when it
// locks, and which format rules a hand-edit must respect. Rendered two ways:
// a compact hint strip above the file editor, and the full "Context guide"
// dialog. Keep in lock-step with backend semantics (workspace._CONTEXT_FILES,
// context_manager._SPEC_LOCK_PHASE, the delta-merge markers, and the per-phase
// injection map in context-section.tsx).

type Writer = "you" | "apex" | "synced";

type FileGuide = {
  writer: Writer;
  writerNote: string;
  lock?: "Phase 1 (Gherkin lock)" | "Phase 2 (design lock)";
  purpose: string;
  rules: string[];
};

export const CONTEXT_FILE_GUIDE: Record<string, FileGuide> = {
  "project-concept.md": {
    writer: "you",
    writerNote: "You write it",
    lock: "Phase 1 (Gherkin lock)",
    purpose:
      "Free-form product brief — purpose, target users, core value. Grounds Phase 1 story generation, Phase 2 design, and Autopilot.",
    rules: [
      "No format contract — plain markdown, write it like you'd brief a new teammate.",
      "Fill it in before Phase 1: an empty concept measurably weakens story generation.",
    ],
  },
  "tech-stack.md": {
    writer: "you",
    writerNote: "You choose, Phase 2 locks",
    lock: "Phase 2 (design lock)",
    purpose:
      "The locked technology choices. Injected as a BINDING constraint — design, tasks, and packs must not introduce technologies outside it.",
    rules: [
      "Plain markdown list; be specific (frameworks + database + hosting).",
      "Change it here after the lock only for real stack changes — the amendment flags every designed story as drifted.",
    ],
  },
  "functional-spec.md": {
    writer: "apex",
    writerNote: "Phase 1 writes it",
    lock: "Phase 1 (Gherkin lock)",
    purpose:
      "The locked Gherkin acceptance criteria — one block per story, grouped by epic. The story index is rebuilt by parsing this file.",
    rules: [
      "Format contract: '## <Epic>' and '### Story <id>: <title>' headings with ```gherkin fences — the index rebuild parses these, so keep heading shapes and story ids intact.",
      "Edit scenario text freely; renaming/removing a story heading orphans that story in the index.",
    ],
  },
  "technical-spec.md": {
    writer: "apex",
    writerNote: "Phase 2 writes it",
    lock: "Phase 2 (design lock)",
    purpose:
      "The machine contract — API endpoints + data model. Injected into every Phase 3–6 prompt; design deltas merge into its sections in place.",
    rules: [
      "Format contract: the '## Project Design' block with its '**Stories:** #id, …' line and the '### Endpoints' / '### Data Model' markers — index rebuild, delta merging, and Phase 3–6 injection all anchor on these. Edit the bullets, keep the markers and the Stories line.",
      "The Stories line records which stories the design covers — stories not listed stay design-pending and show up in the Phase 2 Design Delta banner.",
    ],
  },
  "design-bundle.md": {
    writer: "apex",
    writerNote: "Phase 2 writes it",
    lock: "Phase 2 (design lock)",
    purpose:
      "The human UX doc — screens and navigation paths. Injected into Phase 3; the Phase 2 screen-flow diagram is built from it.",
    rules: [
      "Format contract: keep the '## UX Brief' marker line — the Phase 2 editors and the screen-flow builder read everything under it.",
      "UX additions from design deltas merge in here; hand-added screens are picked up the same way.",
    ],
  },
  "constraints.md": {
    writer: "you",
    writerNote: "You write it (or Generate with AI)",
    lock: "Phase 2 (design lock)",
    purpose:
      "Project-wide behavioural constraints in EARS notation. Injected into Phase 3 packs, Phase 4 test plans, and Phase 6 conformance.",
    rules: [
      "One constraint per line in EARS shape, e.g. 'WHEN <trigger>, THE SYSTEM SHALL <response>.' — the conformance checker matches against these lines.",
      "The 'Generate with AI' button derives a starting set from the locked stories; review before trusting.",
    ],
  },
  "fix-log.md": {
    writer: "apex",
    writerNote: "Fix Bolt appends",
    purpose:
      "Append-only log of Fix-Bolt bug isolations and resolutions — the project's debugging memory.",
    rules: [
      "Treat as append-only history; add post-mortem notes at the end rather than rewriting old entries.",
    ],
  },
  "decisions.md": {
    writer: "you",
    writerNote: "You + Apex append",
    purpose:
      "Append-only decision log — rejected regenerations and revise feedback land here, and it is injected into Phase 3 proposals as negative constraints ('approaches already rejected — do not re-propose').",
    rules: [
      "Format contract: one '## <date> — <scope>' heading per record; only real '## ' records are injected (the empty template is a no-op).",
      "Hand-add records for decisions made outside Apex — cheapest way to steer the AI away from a dead end permanently.",
    ],
  },
  "github-context.md": {
    writer: "synced",
    writerNote: "Synced from GitHub",
    purpose:
      "Repo file tree, README, primary config, and OpenAPI spec pulled by Sync Context. Grounds Phase 2 design and Phase 3 packs in the real codebase.",
    rules: [
      "Machine-written: hand edits are overwritten by the next Sync — put durable guidance in the concept, constraints, or decisions files instead.",
    ],
  },
  "figma-context.md": {
    writer: "synced",
    writerNote: "Synced from Figma",
    purpose:
      "Screens, prototype flows, design-system tokens, and comments pulled from the linked Figma file. Grounds Phases 1–4 in the real design.",
    rules: [
      "Machine-written: hand edits are overwritten by the next Sync.",
    ],
  },
};

const GENERAL_RULES: Array<{ title: string; body: string }> = [
  {
    title: "Context files are the AI's ground truth",
    body:
      "Every generative step reads a subset of these files (the Active Context list shows exactly the ones the current phase injects). What's written here IS what the AI knows about your project — edits take effect on the next generation.",
  },
  {
    title: "Locking & amendments",
    body:
      "Spec files lock with their phase: concept + functional spec at the Phase 1 Gherkin lock; tech stack, technical spec, design bundle, and constraints at the Phase 2 design lock. Editing a locked file is allowed but never silent — it records an amendment, bumps the file's MAJOR version, and flags every downstream story with spec drift so its artifacts get re-derived.",
  },
  {
    title: "Version badges",
    body:
      "No badge = still a pre-lock draft (v0.0.0). v1.0.0 = locked, untouched since. MINOR (v1.1.0) = an additive design delta was merged — provably non-breaking, nothing drifts. MAJOR (v2.0.0) = a post-lock amendment — downstream stories were flagged.",
  },
  {
    title: "Size budget",
    body:
      "The header counter tracks total context size. Past ~150k characters AI calls degrade and past ~200k they fail — trim or reset the biggest files (synced GitHub/Figma context are the usual culprits).",
  },
  {
    title: "Machine files",
    body:
      "story-index.json, spec-versions.json, amendments.md, and the diagram/layout JSON files are maintained by Apex — use 'Rebuild story index' rather than hand-editing state.",
  },
];

function writerChip(writer: Writer, note: string, dark: boolean) {
  const styles: Record<Writer, string> = {
    you: dark ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-emerald-300 bg-emerald-50 text-emerald-700",
    apex: dark ? "border-violet-500/40 bg-violet-500/10 text-violet-400" : "border-violet-300 bg-violet-50 text-violet-700",
    synced: dark ? "border-sky-500/40 bg-sky-500/10 text-sky-400" : "border-sky-300 bg-sky-50 text-sky-700",
  };
  const Icon = writer === "you" ? PencilLine : writer === "synced" ? RefreshCw : Sparkles;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium", styles[writer])}>
      <Icon className="size-2.5" /> {note}
    </span>
  );
}

// Full guide dialog — general semantics + every file's entry.
export function ContextGuideDialog({ open, onClose, dark }: { open: boolean; onClose: () => void; dark: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div
        className={cn(
          "flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border shadow-2xl",
          dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn("flex items-center gap-2 border-b px-5 py-3", dark ? "border-neutral-800" : "border-slate-200")}>
          <BookOpen className="size-4 text-violet-400" />
          <h2 className={cn("flex-1 text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>
            Context files — semantics, rules &amp; format
          </h2>
          <button onClick={onClose} className={cn("rounded p-1", dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-100")} aria-label="Close guide">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2.5">
            {GENERAL_RULES.map((rule) => (
              <div key={rule.title}>
                <p className={cn("text-xs font-semibold", dark ? "text-neutral-200" : "text-slate-800")}>{rule.title}</p>
                <p className={cn("mt-0.5 text-xs leading-5", dark ? "text-neutral-400" : "text-slate-600")}>{rule.body}</p>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <p className={cn("text-[11px] font-bold uppercase tracking-widest", dark ? "text-neutral-500" : "text-slate-400")}>
              File by file
            </p>
            {Object.entries(CONTEXT_FILE_GUIDE).map(([filename, guide]) => (
              <div key={filename} className={cn("rounded-md border p-3", dark ? "border-neutral-800 bg-neutral-950/50" : "border-slate-200 bg-slate-50/60")}>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <code className={cn("text-xs font-semibold", dark ? "text-violet-300" : "text-violet-700")}>{filename}</code>
                  {writerChip(guide.writer, guide.writerNote, dark)}
                  {guide.lock ? (
                    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", dark ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-amber-300 bg-amber-50 text-amber-700")}>
                      locks at {guide.lock}
                    </span>
                  ) : null}
                </div>
                <p className={cn("text-xs leading-5", dark ? "text-neutral-400" : "text-slate-600")}>{guide.purpose}</p>
                <ul className={cn("mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5", dark ? "text-neutral-500" : "text-slate-500")}>
                  {guide.rules.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
