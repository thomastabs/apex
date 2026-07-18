"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Bot, Loader2, FileText } from "lucide-react";
import type { AutopilotEpic, AutopilotPhaseKey, AutopilotSettings, AutopilotStartRequest } from "@/lib/api/autopilot";
import { parseFigmaProjectUrl } from "@/lib/api/figma";
import { useContextFiles } from "@/lib/hooks/use-workspace";
import { GuideTheAI } from "@/components/guide-the-ai";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";

const START_PHASE_META: { key: AutopilotPhaseKey; n: number; navKey: TranslationKey; fromScratch?: boolean }[] = [
  { key: "phase1", n: 1, navKey: "nav.phase1", fromScratch: true },
  { key: "phase2", n: 2, navKey: "nav.phase2" },
  { key: "phase3", n: 3, navKey: "nav.phase3" },
  { key: "phase4", n: 4, navKey: "nav.phase4" },
  { key: "phase5", n: 5, navKey: "nav.phase5" },
];

const PHASE_ORDER: AutopilotPhaseKey[] = START_PHASE_META.map((p) => p.key);

function phaseLabel(t: ReturnType<typeof useT>, key: AutopilotPhaseKey): string {
  const p = START_PHASE_META.find((p) => p.key === key)!;
  return `${t("common.phaseEyebrow", { n: p.n })} — ${t(p.navKey)}`;
}

function phaseShortLabel(t: ReturnType<typeof useT>, key: AutopilotPhaseKey): string {
  const p = START_PHASE_META.find((p) => p.key === key)!;
  return t("common.phaseEyebrow", { n: p.n });
}

type Props = {
  onStart: (req: AutopilotStartRequest) => void;
  isPending: boolean;
  dark: boolean;
};

const DEFAULT_SETTINGS: AutopilotSettings = {
  pause_at_checkpoints: true,
  create_epics_in_taiga: true,
  auto_epics: false,
  dedup_stories: true,
};

/** Mirror of the backend's get_project_concept(): strip the template heading and
 *  placeholder comment so an untouched blank template counts as "no concept". */
function strippedConcept(raw: string | undefined): string {
  if (!raw) return "";
  const text = raw.replace(/^#\s+Project\s+Concept[^\n]*\n/i, "").trim();
  return !text || text.startsWith("<!--") ? "" : text;
}

export function AutopilotSetupForm({ onStart, isPending, dark }: Props) {
  const t = useT();
  const [concept, setConcept] = useState("");
  // Use the project's existing project-concept.md instead of writing a new one.
  const [useExistingConcept, setUseExistingConcept] = useState(false);
  const { data: contextFiles } = useContextFiles();
  const existingConcept = strippedConcept(
    contextFiles?.files.find((f) => f.filename === "project-concept.md")?.content,
  );
  const hasExistingConcept = existingConcept.length > 0;
  const useExisting = useExistingConcept && hasExistingConcept;
  const [epics, setEpics] = useState<AutopilotEpic[]>([{ title: "", description: "" }]);
  const [techStackHint, setTechStackHint] = useState("");
  const [figmaProjectUrl, setFigmaProjectUrl] = useState("");
  const [settings, setSettings] = useState<AutopilotSettings>(DEFAULT_SETTINGS);
  // Start at a later phase when earlier ones are already done in this project.
  const [startPhase, setStartPhase] = useState<AutopilotPhaseKey>("phase1");
  const fromScratch = startPhase === "phase1";
  // Stop the pipeline after this phase instead of running through Phase 5.
  const [endPhase, setEndPhase] = useState<AutopilotPhaseKey>("phase5");
  // Initial steering note applied from the first phase onward (setup-time "Guide the AI").
  const [instructions, setInstructions] = useState("");

  // endPhase can never be before startPhase — bump it up when the user moves the
  // start later than the previously-selected end.
  useEffect(() => {
    if (PHASE_ORDER.indexOf(endPhase) < PHASE_ORDER.indexOf(startPhase)) {
      setEndPhase(startPhase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPhase]);

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
      onStart({
        concept: "", epics: [], tech_stack_hint: techStackHint, instructions,
        settings, start_phase: startPhase, end_phase: endPhase,
      });
      return;
    }
    const validEpics = epics.filter((e) => e.title.trim());
    // Epics come from the manual list only; in project mode they're derived from the
    // Figma files and in auto mode the AI derives them from the concept (both server-side).
    const manualNeeded = !inProjectMode && !autoEpics;
    if ((!useExisting && !concept.trim()) || (manualNeeded && validEpics.length === 0)) return;
    onStart({
      concept: useExisting ? "" : concept,
      ...(useExisting ? { use_existing_concept: true } : {}),
      epics: manualNeeded ? validEpics : [],
      tech_stack_hint: techStackHint,
      instructions,
      settings,
      start_phase: "phase1",
      end_phase: endPhase,
      ...(figmaProjectId ? { figma_project_id: figmaProjectId } : {}),
    });
  }

  const canStart = !fromScratch
    ? true
    : (useExisting || concept.trim().length > 0) && (inProjectMode || autoEpics || epics.some((e) => e.title.trim()));

  const labelClass = cn("block text-xs font-medium", dark ? "text-neutral-400" : "text-slate-500");
  const inputClass = cn(
    "w-full rounded-md border px-3 py-2 text-sm focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/30",
    dark ? "border-neutral-700 bg-neutral-800/60 text-neutral-200 placeholder-neutral-600" : "border-slate-300 bg-white text-slate-800 placeholder-slate-400",
  );
  const selectedSegmentClass = "bg-violet-600 text-white";
  const idleSegmentClass = dark
    ? "text-neutral-400 hover:text-neutral-200"
    : "text-slate-500 hover:text-slate-800";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30">
          <Bot className="size-5 text-violet-400" />
        </div>
        <div>
          <h2 className={cn("text-base font-semibold", dark ? "text-neutral-100" : "text-slate-900")}>{t("autopilotsetup.configureAutopilot")}</h2>
          <p className={cn("mt-0.5 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
            {t("autopilotsetup.description")}
          </p>
        </div>
      </div>

      {/* Start phase */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t("autopilotsetup.startFrom")}</label>
        <select
          value={startPhase}
          onChange={(e) => setStartPhase(e.target.value as AutopilotPhaseKey)}
          className={inputClass}
        >
          {START_PHASE_META.map((p) => (
            <option key={p.key} value={p.key}>
              {phaseLabel(t, p.key)}{p.fromScratch ? t("autopilotsetup.fromScratchSuffix") : ""}
            </option>
          ))}
        </select>
        {!fromScratch && (
          <p className={cn("rounded-md border px-3 py-2 text-xs", dark ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-violet-300 bg-violet-50 text-violet-700")}>
            {t("autopilotsetup.phasesBeforeAssumed", { phase: phaseShortLabel(t, startPhase) })}
          </p>
        )}
      </div>

      {/* End phase */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t("autopilotsetup.endAt")}</label>
        <select
          value={endPhase}
          onChange={(e) => setEndPhase(e.target.value as AutopilotPhaseKey)}
          className={inputClass}
        >
          {PHASE_ORDER.filter((p) => PHASE_ORDER.indexOf(p) >= PHASE_ORDER.indexOf(startPhase)).map((p) => (
            <option key={p} value={p}>{phaseLabel(t, p)}</option>
          ))}
        </select>
        {endPhase !== "phase5" && (
          <p className={cn("rounded-md border px-3 py-2 text-xs", dark ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-violet-300 bg-violet-50 text-violet-700")}>
            {t("autopilotsetup.stopsOnceCompletes", { phase: phaseLabel(t, endPhase) })}
          </p>
        )}
      </div>

      {/* Project Concept + Figma + Epics (Phase 1 only) */}
      {fromScratch && (<>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className={labelClass}>
            {t("autopilotsetup.projectConcept")} {!useExisting && <span className="text-red-500">*</span>}
          </label>
          {/* Write new / Use existing switch — only when project-concept.md has content. */}
          {hasExistingConcept && (
            <div className={cn("inline-flex rounded-md border p-0.5 text-xs", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-300 bg-slate-100")}>
              <button
                type="button"
                onClick={() => setUseExistingConcept(false)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  !useExisting ? selectedSegmentClass : idleSegmentClass,
                )}
              >
                {t("autopilotsetup.writeNew")}
              </button>
              <button
                type="button"
                onClick={() => setUseExistingConcept(true)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  useExisting ? selectedSegmentClass : idleSegmentClass,
                )}
              >
                {t("autopilotsetup.useExistingFile")}
              </button>
            </div>
          )}
        </div>
        {useExisting ? (
          <div className={cn("rounded-md border", dark ? "border-violet-500/30 bg-violet-500/10" : "border-violet-300 bg-violet-50")}>
            <div className={cn("flex items-center gap-1.5 border-b px-3 py-1.5 text-xs", dark ? "border-violet-500/20 text-violet-300" : "border-violet-200 text-violet-700")}>
              <FileText className="size-3.5" />
              <span className="font-medium">project-concept.md</span>
              <span className={dark ? "text-neutral-500" : "text-slate-400"}>{t("autopilotsetup.usedAsIs", { n: existingConcept.length })}</span>
            </div>
            <pre className={cn("max-h-40 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-sans text-xs", dark ? "text-neutral-300" : "text-slate-600")}>
              {existingConcept}
            </pre>
          </div>
        ) : (
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            rows={4}
            placeholder={t("autopilotsetup.conceptPlaceholder")}
            className={cn("resize-none", inputClass)}
          />
        )}
      </div>

      {/* Figma project (file-as-epic) */}
      <div className="space-y-1.5">
        <label className={labelClass}>
          {t("autopilotsetup.figmaProjectUrl")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("autopilotsetup.figmaProjectUrlHint")}</span>
        </label>
        <input
          type="text"
          value={figmaProjectUrl}
          onChange={(e) => setFigmaProjectUrl(e.target.value)}
          placeholder={t("autopilotsetup.figmaProjectUrlPlaceholder")}
          className={inputClass}
        />
        {inProjectMode ? (
          <p className={cn("text-xs", dark ? "text-violet-400" : "text-violet-600")}>
            {t("autopilotsetup.projectModeNote", { scope: "projects:read" })}
          </p>
        ) : figmaProjectUrl.trim() ? (
          <p className={cn("text-xs", dark ? "text-amber-500" : "text-amber-600")}>{t("autopilotsetup.notFigmaProjectUrl")}</p>
        ) : null}
      </div>

      {/* Epics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={labelClass}>
            {t("autopilotsetup.epics")} {inProjectMode ? <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("autopilotsetup.fromFigmaFiles")}</span> : !autoEpics ? <span className="text-red-500">*</span> : null}
          </label>
          {/* Auto/Manual switch — hidden in project mode (epics come from the files). */}
          {!inProjectMode && (
            <div className={cn("inline-flex rounded-md border p-0.5 text-xs", dark ? "border-neutral-700 bg-neutral-900/60" : "border-slate-300 bg-slate-100")}>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, auto_epics: true }))}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  autoEpics ? selectedSegmentClass : idleSegmentClass,
                )}
              >
                {t("autopilotsetup.automaticAI")}
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, auto_epics: false }))}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  !autoEpics ? selectedSegmentClass : idleSegmentClass,
                )}
              >
                {t("autopilotsetup.manual")}
              </button>
            </div>
          )}
        </div>

        {inProjectMode ? null : autoEpics ? (
          <p className={cn("rounded-md border px-3 py-2 text-xs", dark ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-violet-300 bg-violet-50 text-violet-700")}>
            {t("autopilotsetup.autoEpicsNote")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={addEpic}
                className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", dark ? "text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}
              >
                <Plus className="size-3" /> {t("autopilotsetup.addEpic")}
              </button>
            </div>
            <div className="space-y-2">
              {epics.map((epic, i) => (
                <div key={i} className={cn("space-y-2 rounded-md border p-3", dark ? "border-neutral-700/60 bg-neutral-800/40" : "border-slate-200 bg-slate-50")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-4 text-xs font-medium", dark ? "text-neutral-500" : "text-slate-400")}>#{i + 1}</span>
                    <input
                      type="text"
                      value={epic.title}
                      onChange={(e) => updateEpic(i, "title", e.target.value)}
                      placeholder={t("autopilotsetup.epicTitlePlaceholder")}
                      className={cn(
                        "flex-1 rounded border px-2 py-1 text-sm focus:border-violet-500/60 focus:outline-none",
                        dark ? "border-neutral-700 bg-neutral-900/60 text-neutral-200 placeholder-neutral-600" : "border-slate-300 bg-white text-slate-800 placeholder-slate-400",
                      )}
                    />
                    {epics.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEpic(i)}
                        className={cn("rounded p-1", dark ? "text-neutral-600 hover:text-red-400" : "text-slate-400 hover:text-red-500")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={epic.description}
                    onChange={(e) => updateEpic(i, "description", e.target.value)}
                    rows={2}
                    placeholder={t("autopilotsetup.epicDescPlaceholder")}
                    className={cn(
                      "w-full resize-none rounded border px-2 py-1.5 text-xs focus:border-violet-500/60 focus:outline-none",
                      dark ? "border-neutral-700 bg-neutral-900/60 text-neutral-300 placeholder-neutral-600" : "border-slate-300 bg-white text-slate-600 placeholder-slate-400",
                    )}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </>)}

      {/* Tech stack hint — only meaningful when Autopilot itself runs Phase 2 (it's
          consumed once, while locking the tech stack there); starting at Phase 3+
          means the tech stack is already locked in the project, so the hint would
          be silently ignored. */}
      {(startPhase === "phase1" || startPhase === "phase2") && (
        <div className="space-y-1.5">
          <label className={labelClass}>
            {t("autopilotsetup.techStackHint")} <span className={dark ? "text-neutral-600" : "text-slate-400"}>{t("autopilotsetup.techStackHintOptional")}</span>
          </label>
          <input
            type="text"
            value={techStackHint}
            onChange={(e) => setTechStackHint(e.target.value)}
            placeholder={t("autopilotsetup.techStackPlaceholder")}
            className={inputClass}
          />
        </div>
      )}

      {/* Settings */}
      <div className={cn("space-y-3 rounded-md border p-4", dark ? "border-neutral-700/50 bg-neutral-800/20" : "border-slate-200 bg-slate-50")}>
        <p className={cn("text-xs font-semibold uppercase tracking-wider", dark ? "text-neutral-500" : "text-slate-500")}>{t("autopilotsetup.settings")}</p>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={settings.pause_at_checkpoints}
            onChange={(e) => setSettings((s) => ({ ...s, pause_at_checkpoints: e.target.checked }))}
            className="h-4 w-4 rounded accent-violet-500"
          />
          <div>
            <p className={cn("text-sm", dark ? "text-neutral-300" : "text-slate-700")}>{t("autopilotsetup.pauseAtCheckpoints")}</p>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{t("autopilotsetup.pauseAtCheckpointsDesc")}</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={settings.create_epics_in_taiga}
            onChange={(e) => setSettings((s) => ({ ...s, create_epics_in_taiga: e.target.checked }))}
            className="h-4 w-4 rounded accent-violet-500"
          />
          <div>
            <p className={cn("text-sm", dark ? "text-neutral-300" : "text-slate-700")}>{t("autopilotsetup.createEpicsInTaiga")}</p>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{t("autopilotsetup.createEpicsInTaigaDesc")}</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={settings.dedup_stories}
            onChange={(e) => setSettings((s) => ({ ...s, dedup_stories: e.target.checked }))}
            className="h-4 w-4 rounded accent-violet-500"
          />
          <div>
            <p className={cn("text-sm", dark ? "text-neutral-300" : "text-slate-700")}>{t("autopilotsetup.dedupStories")}</p>
            <p className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>{t("autopilotsetup.dedupStoriesDesc")}</p>
          </div>
        </label>
      </div>

      {/* Guide the AI — initial steering applied from the first phase run, whatever
          "Start from" is set to. Once the run is underway this is superseded by the
          live steer control, which carries and can update the same note. */}
      <GuideTheAI
        value={instructions}
        onChange={setInstructions}
        dark={dark}
        disabled={isPending}
        placeholder={t("autopilotsetup.guideThePlaceholder")}
      />
      <AiGroundingNote files={AI_GROUNDING.autopilotSetup} dark={dark} />

      {/* Submit */}
      <button
        type="submit"
        disabled={!canStart || isPending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("autopilotsetup.startingAutopilot")}
          </>
        ) : (
          <>
            <Bot className="size-4" />
            {t("autopilotsetup.launchAutopilot")}
          </>
        )}
      </button>
    </form>
  );
}
