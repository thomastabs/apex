"use client";

import { useState } from "react";
import { Plus, Trash2, Bot, Loader2 } from "lucide-react";
import type { AutopilotEpic, AutopilotPhaseKey, AutopilotSettings, AutopilotStartRequest } from "@/lib/api/autopilot";
import { parseFigmaProjectUrl } from "@/lib/api/figma";

const START_PHASES: { key: AutopilotPhaseKey; label: string }[] = [
  { key: "phase1", label: "Phase 1 — Requirements (from scratch)" },
  { key: "phase2", label: "Phase 2 — Design" },
  { key: "phase3", label: "Phase 3 — Implementation" },
  { key: "phase4", label: "Phase 4 — Testing" },
  { key: "phase5", label: "Phase 5 — Deployment" },
];

type Props = {
  onStart: (req: AutopilotStartRequest) => void;
  isPending: boolean;
};

const DEFAULT_SETTINGS: AutopilotSettings = {
  pause_at_checkpoints: true,
  create_epics_in_taiga: true,
  auto_epics: false,
  dedup_stories: true,
};

export function AutopilotSetupForm({ onStart, isPending }: Props) {
  const [concept, setConcept] = useState("");
  const [epics, setEpics] = useState<AutopilotEpic[]>([{ title: "", description: "" }]);
  const [techStackHint, setTechStackHint] = useState("");
  const [figmaProjectUrl, setFigmaProjectUrl] = useState("");
  const [settings, setSettings] = useState<AutopilotSettings>(DEFAULT_SETTINGS);
  // Start at a later phase when earlier ones are already done in this project.
  const [startPhase, setStartPhase] = useState<AutopilotPhaseKey>("phase1");
  const fromScratch = startPhase === "phase1";

  // Project mode (file-as-epic): a valid Figma project URL → epics are derived from
  // the project's files, so the manual epics list becomes optional.
  const figmaProjectId = figmaProjectUrl.trim() ? (parseFigmaProjectUrl(figmaProjectUrl) ?? null)?.projectId ?? "" : "";
  const inProjectMode = Boolean(figmaProjectId);
  // Epic source: AI-derived from the concept, manual list, or (project mode) the
  // Figma files. Project mode always wins, so the auto/manual switch is hidden then.
  const autoEpics = settings.auto_epics;

  function addEpic() {
    setEpics((prev) => [...prev, { title: "", description: "" }]);
  }

  function removeEpic(i: number) {
    setEpics((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateEpic(i: number, field: keyof AutopilotEpic, value: string) {
    setEpics((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Starting past Phase 1: the project's existing stories drive the run, so concept/
    // epics are not needed — just hand over the start phase.
    if (!fromScratch) {
      onStart({ concept: "", epics: [], tech_stack_hint: techStackHint, settings, start_phase: startPhase });
      return;
    }
    const validEpics = epics.filter((e) => e.title.trim());
    // Epics come from the manual list only; in project mode they're derived from the
    // Figma files and in auto mode the AI derives them from the concept (both server-side).
    const manualNeeded = !inProjectMode && !autoEpics;
    if (!concept.trim() || (manualNeeded && validEpics.length === 0)) return;
    onStart({
      concept,
      epics: manualNeeded ? validEpics : [],
      tech_stack_hint: techStackHint,
      settings,
      start_phase: "phase1",
      ...(figmaProjectId ? { figma_project_id: figmaProjectId } : {}),
    });
  }

  const canStart = !fromScratch
    ? true
    : concept.trim().length > 0 && (inProjectMode || autoEpics || epics.some((e) => e.title.trim()));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30">
          <Bot className="size-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-neutral-100">Configure Autopilot</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            AI runs the full SDLC pipeline (Phases 1–5) automatically. You can pause, take over, or stop at any point.
          </p>
        </div>
      </div>

      {/* Start phase */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-neutral-400">Start from</label>
        <select
          value={startPhase}
          onChange={(e) => setStartPhase(e.target.value as AutopilotPhaseKey)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        >
          {START_PHASES.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        {!fromScratch && (
          <p className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
            Phases before {START_PHASES.find((p) => p.key === startPhase)?.label.split("—")[0].trim()} are assumed already complete in this project — Autopilot uses the project&apos;s existing stories and runs from there. No concept or epics needed.
          </p>
        )}
      </div>

      {/* Project Concept + Figma + Epics (Phase 1 only) */}
      {fromScratch && (<>
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-neutral-400">
          Project concept <span className="text-red-500">*</span>
        </label>
        <textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          rows={4}
          placeholder="Describe what the project is: its purpose, target users, and key goals. The AI uses this as the anchor for all generated specs."
          className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
      </div>

      {/* Figma project (file-as-epic) */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-neutral-400">
          Figma project URL <span className="text-neutral-600">(optional — creates one epic per file)</span>
        </label>
        <input
          type="text"
          value={figmaProjectUrl}
          onChange={(e) => setFigmaProjectUrl(e.target.value)}
          placeholder="https://www.figma.com/files/project/…"
          className="w-full rounded-md border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
        {inProjectMode ? (
          <p className="text-xs text-violet-400">
            Project mode: epics will be created from the project&apos;s files, each grounded in its own screens. Connect Figma in the sidebar first so the token is available (needs the <code>projects:read</code> scope).
          </p>
        ) : figmaProjectUrl.trim() ? (
          <p className="text-xs text-amber-500">That doesn&apos;t look like a Figma project URL.</p>
        ) : null}
      </div>

      {/* Epics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-neutral-400">
            Epics {inProjectMode ? <span className="text-neutral-600">(from Figma files)</span> : !autoEpics ? <span className="text-red-500">*</span> : null}
          </label>
          {/* Auto/Manual switch — hidden in project mode (epics come from the files). */}
          {!inProjectMode && (
            <div className="inline-flex rounded-md border border-neutral-700 bg-neutral-900/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, auto_epics: true }))}
                className={`rounded px-2 py-1 transition-colors ${autoEpics ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                Automatic (AI)
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, auto_epics: false }))}
                className={`rounded px-2 py-1 transition-colors ${!autoEpics ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                Manual
              </button>
            </div>
          )}
        </div>

        {inProjectMode ? null : autoEpics ? (
          <p className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
            The AI will derive the epic set from your project concept (and tech-stack hint) before generating stories — the same step Phase 1 uses. Switch to Manual to define epics yourself.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={addEpic}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200"
              >
                <Plus className="size-3" /> Add epic
              </button>
            </div>
            <div className="space-y-2">
              {epics.map((epic, i) => (
                <div key={i} className="rounded-md border border-neutral-700/60 bg-neutral-800/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 w-4">#{i + 1}</span>
                    <input
                      type="text"
                      value={epic.title}
                      onChange={(e) => updateEpic(i, "title", e.target.value)}
                      placeholder="Epic title (e.g. User Authentication)"
                      className="flex-1 rounded border border-neutral-700 bg-neutral-900/60 px-2 py-1 text-sm text-neutral-200 placeholder-neutral-600 focus:border-violet-500/60 focus:outline-none"
                    />
                    {epics.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEpic(i)}
                        className="rounded p-1 text-neutral-600 hover:text-red-400"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={epic.description}
                    onChange={(e) => updateEpic(i, "description", e.target.value)}
                    rows={2}
                    placeholder="Optional: describe what this epic covers"
                    className="w-full resize-none rounded border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:border-violet-500/60 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </>)}

      {/* Tech stack hint */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-neutral-400">
          Tech stack hint <span className="text-neutral-600">(optional — AI picks if blank)</span>
        </label>
        <input
          type="text"
          value={techStackHint}
          onChange={(e) => setTechStackHint(e.target.value)}
          placeholder="e.g. React · FastAPI · PostgreSQL · Docker"
          className="w-full rounded-md border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
      </div>

      {/* Settings */}
      <div className="rounded-md border border-neutral-700/50 bg-neutral-800/20 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Settings</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.pause_at_checkpoints}
            onChange={(e) => setSettings((s) => ({ ...s, pause_at_checkpoints: e.target.checked }))}
            className="h-4 w-4 rounded accent-violet-500"
          />
          <div>
            <p className="text-sm text-neutral-300">Pause at phase checkpoints</p>
            <p className="text-xs text-neutral-500">Wait for your review after each phase completes before continuing.</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.create_epics_in_taiga}
            onChange={(e) => setSettings((s) => ({ ...s, create_epics_in_taiga: e.target.checked }))}
            className="h-4 w-4 rounded accent-violet-500"
          />
          <div>
            <p className="text-sm text-neutral-300">Create epics & stories in Taiga</p>
            <p className="text-xs text-neutral-500">Push generated epics and user stories to your Taiga project. Disable if epics already exist.</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.dedup_stories}
            onChange={(e) => setSettings((s) => ({ ...s, dedup_stories: e.target.checked }))}
            className="h-4 w-4 rounded accent-violet-500"
          />
          <div>
            <p className="text-sm text-neutral-300">De-duplicate stories across epics</p>
            <p className="text-xs text-neutral-500">After Phase 1, drop near-duplicate stories that different epics independently produced, keeping the backlog concise.</p>
          </div>
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canStart || isPending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Starting Autopilot…
          </>
        ) : (
          <>
            <Bot className="size-4" />
            Launch Autopilot
          </>
        )}
      </button>
    </form>
  );
}
