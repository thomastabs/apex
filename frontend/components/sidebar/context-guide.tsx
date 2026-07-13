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
      "Change it here after the lock only for real stack changes — the edit is logged as an amendment and bumps the file's version.",
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
  "runtime-spec.md": {
    writer: "apex",
    writerNote: "Phase 2 writes it (optional)",
    lock: "Phase 2 (design lock)",
    purpose:
      "The Runtime Contract — how the independently-built story packs become one running prototype: app/source paths, migration tool + command, session bootstrap, container topology, and a First Prototype Path demo walkthrough. Injected into Phase 3 task/pack generation and probed by Phase 6 conformance. Optional — locking the design without it is allowed, but Phase 3+ has no scaffold contract to ground packs in.",
    rules: [
      "Format contract: '- **<label>** {RT-n}: <value>' bullets under '### Frontend' / '### Backend' / '### Database' / '### Containers', plus a '## First Prototype Path' section — the RT-n ids feed the spec index and the Phase 6 conformance probe.",
      "Unlike the other three design sections it can lock/relock on its own schedule, independent of technical-spec.md — adding it long after the core design already locked is the normal case for an existing project.",
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
      "The repo's real source, packed by Sync Context: a server-side shallow clone piped through repomix (real file contents by default, not just a tree/README) — the same tool a full-body pack falls back to signature-only `--compress` output for if the repo is too large to fit its token budget. Grounds Phase 2 design and Phase 3 packs in actual implementation code, not just structure.",
    rules: [
      "Machine-written: hand edits are overwritten by the next Sync — put durable guidance in the concept, constraints, or decisions files instead.",
      "Sized against whatever char headroom is left after your other context files, for the AI model configured in Settings — a large repo on top of an already-large spec can still get compressed down or, rarely, fail to pack at all (trim vendored/generated files or add them to .gitignore).",
      "Settings → GitHub → Repo pack settings gives direct control over that: force full detail or always-compressed, set a fixed token ceiling instead of the automatic sizing, and add extra ignore globs on top of the built-in exclude list.",
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
      "Spec files lock with their phase: concept + functional spec at the Phase 1 Gherkin lock; tech stack, technical spec, design bundle, and constraints at the Phase 2 design lock. Locking gates which AI workflows are ready for the next phase — it never freezes the file itself. Specs stay live and editable at any time; editing a locked file is never silent, though — it records an amendment in amendments.md and bumps the file's MAJOR version, so there's always a history of what changed and when.",
  },
  {
    title: "Version badges",
    body:
      "No badge = still a pre-lock draft (v0.0.0). v1.0.0 = locked, untouched since. MINOR (v1.1.0) = an additive design delta was merged — provably non-breaking. MAJOR (v2.0.0) = a post-lock amendment was recorded.",
  },
  {
    title: "Size budget",
    body:
      "The header counter tracks total context size against the AI model configured in Settings — a small-window model (e.g. GPT-4o Mini, 128k tokens) degrades/fails at a much smaller char count than a large one (e.g. GPT-4.1, Gemini 2.5, ~1M tokens). The warning banner names the active model and its real threshold. Trim or reset the biggest files first — synced GitHub/Figma context are the usual culprits.",
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
