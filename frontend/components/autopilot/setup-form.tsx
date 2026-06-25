"use client";

import { useState } from "react";
import { Plus, Trash2, Bot, Loader2 } from "lucide-react";
import type { AutopilotEpic, AutopilotSettings, AutopilotStartRequest } from "@/lib/api/autopilot";

type Props = {
  onStart: (req: AutopilotStartRequest) => void;
  isPending: boolean;
};

const DEFAULT_SETTINGS: AutopilotSettings = {
  pause_at_checkpoints: true,
  create_epics_in_taiga: false,
};

export function AutopilotSetupForm({ onStart, isPending }: Props) {
  const [concept, setConcept] = useState("");
  const [epics, setEpics] = useState<AutopilotEpic[]>([{ title: "", description: "" }]);
  const [techStackHint, setTechStackHint] = useState("");
  const [settings, setSettings] = useState<AutopilotSettings>(DEFAULT_SETTINGS);

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
    const validEpics = epics.filter((e) => e.title.trim());
    if (!concept.trim() || validEpics.length === 0) return;
    onStart({ concept, epics: validEpics, tech_stack_hint: techStackHint, settings });
  }

  const canStart = concept.trim().length > 0 && epics.some((e) => e.title.trim());

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

      {/* Project Concept */}
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

      {/* Epics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-neutral-400">
            Epics <span className="text-red-500">*</span>
          </label>
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
      </div>

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
