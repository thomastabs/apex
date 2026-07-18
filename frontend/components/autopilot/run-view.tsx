"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  UserCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { AutopilotEvent, AutopilotPhase, AutopilotState, AutopilotStatus } from "@/lib/api/autopilot";
import {
  usePauseAutopilot,
  useResumeAutopilot,
  useSteerAutopilot,
  useStopAutopilot,
  useTakeOverAutopilot,
} from "@/lib/hooks/use-autopilot";
import { useT } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import { AI_GROUNDING } from "@/lib/ai-grounding";

const PHASE_LABEL_KEYS: Record<string, TranslationKey> = {
  init: "autopilotrun.phase.init",
  phase1: "autopilotrun.phase.phase1",
  phase2: "autopilotrun.phase.phase2",
  phase3: "autopilotrun.phase.phase3",
  phase4: "autopilotrun.phase.phase4",
  phase5: "autopilotrun.phase.phase5",
  done: "autopilotrun.phase.done",
  "": "autopilotrun.phase.general",
};

function phaseDisplayLabel(t: ReturnType<typeof useT>, phase: string): string {
  const key = PHASE_LABEL_KEYS[phase];
  return key ? t(key) : phase || t("autopilotrun.phase.general");
}

// Left-accent + chip colour per phase, for the artifact viewer.
function phaseAccent(phase: string, dark: boolean): string {
  const light: Record<string, string> = {
    phase1: "border-sky-500/70 bg-sky-500/10 text-sky-600",
    phase2: "border-violet-500/70 bg-violet-500/10 text-violet-600",
    phase3: "border-emerald-500/70 bg-emerald-500/10 text-emerald-600",
    phase4: "border-amber-500/70 bg-amber-500/10 text-amber-600",
    phase5: "border-pink-500/70 bg-pink-500/10 text-pink-600",
    init: "border-neutral-400 bg-neutral-100 text-neutral-600",
    "": "border-neutral-400 bg-neutral-100 text-neutral-600",
  };
  const darkMap: Record<string, string> = {
    phase1: "border-sky-500/70 bg-sky-500/10 text-sky-300",
    phase2: "border-violet-500/70 bg-violet-500/10 text-violet-300",
    phase3: "border-emerald-500/70 bg-emerald-500/10 text-emerald-300",
    phase4: "border-amber-500/70 bg-amber-500/10 text-amber-300",
    phase5: "border-pink-500/70 bg-pink-500/10 text-pink-300",
    init: "border-neutral-600 bg-neutral-700/20 text-neutral-300",
    "": "border-neutral-600 bg-neutral-700/20 text-neutral-300",
  };
  const map = dark ? darkMap : light;
  return map[phase] ?? map[""];
}

/**
 * Short human label for an artifact, inferred from the emitting event. Autopilot
 * emits many design sections and many per-story dev packs / test plans in a single
 * run — fold in the section name / story id so the artifact list and pills stay
 * distinguishable instead of repeating "Design section" or "Dev pack".
 */
function artifactKind(ev: AutopilotEvent, t: ReturnType<typeof useT>): string {
  const raw = ev.msg;
  const m = raw.toLowerCase();
  const storyId = raw.match(/Story (\d+)/)?.[1];
  const storyTag = storyId ? ` · #${storyId}` : "";

  if (m.includes("nl draft")) return t("autopilotrun.artifact.userStories");
  if (m.includes("epics")) return t("autopilotrun.artifact.epics");
  if (m.includes("tech stack")) return t("autopilotrun.artifact.techStack");
  const section = raw.match(/Section ['"]([\w-]+)['"]/i)?.[1];
  if (section) return t("autopilotrun.artifact.designSection", { section: section.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) });
  if (m.includes("test plan")) return t("autopilotrun.artifact.testPlan", { storyTag });
  if (m.includes("figma")) return t("autopilotrun.artifact.figmaContext");
  if (m.includes("pack") || m.includes("proposal") || m.includes("implementation plan")) return t("autopilotrun.artifact.devPack", { storyTag });
  return phaseDisplayLabel(t, ev.phase).split("·").pop()?.trim() ?? t("autopilotrun.artifact.default");
}

function CopyButton({ getText, label, dark }: { getText: () => string; label: string; dark: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error(t("autopilotrun.toast.copyFailed"));
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-normal normal-case",
        dark ? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700",
      )}
      title={t("autopilotrun.copyTitle", { label })}
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}

const PHASES: { key: AutopilotPhase; labelKey: TranslationKey }[] = [
  { key: "phase1", labelKey: "nav.phase1" },
  { key: "phase2", labelKey: "nav.phase2" },
  { key: "phase3", labelKey: "autopilotrun.phase.tasks" },
  { key: "phase4", labelKey: "nav.phase4" },
  { key: "phase5", labelKey: "autopilotrun.phase.deploy" },
];

const PHASE_ORDER: AutopilotPhase[] = ["init", "phase1", "phase2", "phase3", "phase4", "phase5", "done"];

function phaseIndex(phase: AutopilotPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

function StateBadge({ state }: { state: AutopilotState }) {
  const t = useT();
  const cfg = {
    running: { color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", icon: <Loader2 className="size-3 animate-spin" />, label: t("autopilotrun.state.running") },
    paused:  { color: "text-amber-400 bg-amber-500/15 border-amber-500/30", icon: <Pause className="size-3" />, label: t("autopilotrun.state.paused") },
    stopped: { color: "text-neutral-400 bg-neutral-500/15 border-neutral-500/30", icon: <Square className="size-3" />, label: t("autopilotrun.state.stopped") },
    done:    { color: "text-violet-400 bg-violet-500/15 border-violet-500/30", icon: <CheckCircle2 className="size-3" />, label: t("autopilotrun.state.complete") },
    error:   { color: "text-red-400 bg-red-500/15 border-red-500/30", icon: <XCircle className="size-3" />, label: t("autopilotrun.state.error") },
    interrupted: { color: "text-orange-400 bg-orange-500/15 border-orange-500/30", icon: <AlertTriangle className="size-3" />, label: t("autopilotrun.state.interrupted") },
  }[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium", cfg.color)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function EventIcon({ level }: { level: AutopilotEvent["level"] }) {
  if (level === "success")    return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />;
  if (level === "error")      return <XCircle className="size-3.5 shrink-0 text-red-400 mt-0.5" />;
  if (level === "warning")    return <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />;
  if (level === "checkpoint") return <Pause className="size-3.5 shrink-0 text-violet-400 mt-0.5" />;
  return <Info className="size-3.5 shrink-0 text-neutral-500 mt-0.5" />;
}

function EventRow({ event, dark }: { event: AutopilotEvent; dark: boolean }) {
  const ts = new Date(event.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const textColor = dark
    ? event.level === "success" ? "text-emerald-300"
      : event.level === "error" ? "text-red-300"
      : event.level === "warning" ? "text-amber-300"
      : event.level === "checkpoint" ? "text-violet-300"
      : "text-neutral-400"
    : event.level === "success" ? "text-emerald-600"
      : event.level === "error" ? "text-red-600"
      : event.level === "warning" ? "text-amber-600"
      : event.level === "checkpoint" ? "text-violet-600"
      : "text-neutral-600";

  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className={cn("shrink-0 text-xs font-mono mt-0.5 w-16", dark ? "text-neutral-600" : "text-neutral-400")}>{ts}</span>
      <EventIcon level={event.level} />
      <span className={cn("text-xs leading-relaxed", textColor)}>{event.msg}</span>
    </div>
  );
}

function PhaseProgress({ currentPhase, state, dark }: { currentPhase: AutopilotPhase; state: AutopilotState; dark: boolean }) {
  const t = useT();
  const currentIdx = phaseIndex(currentPhase);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {PHASES.map((p, i) => {
        const pIdx = phaseIndex(p.key);
        const done = pIdx < currentIdx || (pIdx === currentIdx && (state === "done" || currentPhase === "done"));
        const active = pIdx === currentIdx && state !== "done";
        return (
          <div key={p.key} className="flex items-center gap-1 min-w-0">
            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                done ? cn("bg-emerald-500/20", dark ? "text-emerald-400" : "text-emerald-600")
                : active ? (state === "paused" ? cn("bg-amber-500/20 ring-1 ring-amber-500/40", dark ? "text-amber-300" : "text-amber-600") : cn("bg-violet-500/20 ring-1 ring-violet-500/40", dark ? "text-violet-300" : "text-violet-600"))
                : dark ? "bg-neutral-800 text-neutral-600" : "bg-neutral-200 text-neutral-500",
              )}
            >
              {done ? <CheckCircle2 className="size-3" /> : active && state === "running" ? <Loader2 className="size-3 animate-spin" /> : <span className="size-3 flex items-center justify-center text-xs">{i + 1}</span>}
              {t(p.labelKey)}
            </div>
            {i < PHASES.length - 1 && (
              <ChevronRight className={cn("size-3 shrink-0", done ? "text-emerald-600" : "text-neutral-700")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  status: AutopilotStatus;
  onReset: () => void;
  onResume?: () => void;   // present only for an interrupted job (resume from cursor)
  resuming?: boolean;
  dark: boolean;
};

export function AutopilotRunView({ status, onReset, onResume, resuming, dark }: Props) {
  const t = useT();
  const router = useRouter();
  const logRef = useRef<HTMLDivElement>(null);
  const pause = usePauseAutopilot(status.job_id);
  const resume = useResumeAutopilot(status.job_id);
  const stop = useStopAutopilot(status.job_id);
  const takeOver = useTakeOverAutopilot(status.job_id);
  const steer = useSteerAutopilot(status.job_id);

  const [steerDraft, setSteerDraft] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  // Auto-scroll event log unless the user scrolled up to read history.
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [status.events.length, autoScroll]);

  const isInterrupted = status.state === "interrupted";
  const isTerminal = ["done", "stopped", "error"].includes(status.state);
  const isRunning = status.state === "running";
  const isPaused = status.state === "paused";

  // Tick every second while running so the "current activity" elapsed timer moves
  // even when a long AI call emits no new event — the view never looks frozen.
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const latestEvent = status.events[status.events.length - 1];
  const activityElapsed = latestEvent ? Math.max(0, Math.floor((now - latestEvent.ts * 1000) / 1000)) : 0;

  async function handleTakeOver() {
    await takeOver.mutateAsync();
    router.push("/");
  }

  function applySteer() {
    const note = steerDraft.trim();
    steer.mutate(note, { onSuccess: () => toast.success(note ? t("autopilotrun.toast.steerApplied") : t("autopilotrun.toast.steerCleared")) });
  }

  function togglePhase(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Group events into contiguous per-phase sections (phases run sequentially).
  const groups: { phase: string; events: AutopilotEvent[] }[] = [];
  for (const ev of status.events) {
    const last = groups[groups.length - 1];
    if (last && last.phase === ev.phase) last.events.push(ev);
    else groups.push({ phase: ev.phase, events: [ev] });
  }

  const logText = status.events
    .map((e) => `[${new Date(e.ts * 1000).toLocaleTimeString()}] ${e.level.toUpperCase()} ${e.msg}`)
    .join("\n");

  // Checkpoint banner
  const checkpointPhase = status.checkpoint_phase;

  // Artifact viewer: all artifacts so far; follow the latest unless the user pins one.
  const artifacts = status.events.filter((e) => e.artifact);
  const [pinnedArtifactId, setPinnedArtifactId] = useState<number | null>(null);
  const following = pinnedArtifactId == null;
  const selectedArtifact = following
    ? artifacts[artifacts.length - 1]
    : artifacts.find((a) => a.id === pinnedArtifactId) ?? artifacts[artifacts.length - 1];

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30">
            <Bot className="size-4 text-violet-400" />
          </div>
          <div>
            <h2 className={cn("text-sm font-semibold", dark ? "text-neutral-100" : "text-neutral-900")}>{t("autopilotrun.runningHeading")}</h2>
            <p className="text-xs text-neutral-500">
              {status.story_count > 0
                ? t("autopilotrun.storiesProcessed", { done: status.stories_done, total: status.story_count })
                : t("autopilotrun.generatingSpecs")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StateBadge state={status.state} />
          {isRunning && (
            <button
              onClick={() => pause.mutate()}
              disabled={pause.isPending}
              className={cn(
                "flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs disabled:opacity-50",
                dark ? "border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100",
              )}
            >
              <Pause className="size-3" /> {t("autopilotrun.pause")}
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => resume.mutate()}
              disabled={resume.isPending}
              className="flex items-center gap-1.5 rounded border border-violet-600/50 bg-violet-600/20 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-600/30 disabled:opacity-50"
            >
              <Play className="size-3" /> {t("autopilotrun.resume")}
            </button>
          )}
          {!isTerminal && !isInterrupted && (
            <>
              <button
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs disabled:opacity-50",
                  dark ? "border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700" : "border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-100",
                )}
              >
                <Square className="size-3" /> {t("autopilotrun.stop")}
              </button>
              <button
                onClick={handleTakeOver}
                disabled={takeOver.isPending}
                className="flex items-center gap-1.5 rounded border border-amber-600/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                <UserCog className="size-3" /> {t("autopilotrun.takeOver")}
              </button>
            </>
          )}
          {isInterrupted && onResume && (
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex items-center gap-1.5 rounded border border-orange-600/50 bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/25 disabled:opacity-50"
            >
              <Play className="size-3" /> {resuming ? t("autopilotrun.resuming") : t("autopilotrun.resumeRun")}
            </button>
          )}
          {(isTerminal || isInterrupted) && (
            <button
              onClick={onReset}
              className={cn(
                "flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs",
                dark ? "border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100",
              )}
            >
              <RotateCcw className="size-3" /> {t("autopilotrun.newRun")}
            </button>
          )}
        </div>
      </div>

      {/* Phase progress */}
      <PhaseProgress currentPhase={status.current_phase} state={status.state} dark={dark} />
      <AiGroundingNote files={AI_GROUNDING.autopilotRun} dark={dark} />

      {/* Current activity — live line with a ticking elapsed timer so a long AI call
          never makes the view look frozen (the elapsed counts up every second). */}
      {isRunning && latestEvent && (
        <div className="flex items-center gap-2 rounded-md border border-violet-600/30 bg-violet-500/5 px-3 py-2 text-xs">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-violet-400" />
          <span className={cn("min-w-0 flex-1 truncate", dark ? "text-neutral-200" : "text-neutral-700")}>{latestEvent.msg.trim()}</span>
          <span className="shrink-0 font-mono text-xs text-neutral-500">{activityElapsed}s</span>
        </div>
      )}

      {/* Progress bar — phase-aware: epics in Phase 1, stories in Phases 3-5. The
          per-story counter only moves in Phases 3-5, so during Phase 1/2 we track
          epics instead of showing a stuck 0/N. */}
      {(() => {
        const inPhase1 = status.current_phase === "phase1";
        const label = inPhase1 ? t("autopilotsetup.epics") : t("autopilotrun.stories");
        const doneN = inPhase1 ? status.epics_done : status.stories_done;
        const totalN = inPhase1 ? status.epic_count : status.story_count;
        if (totalN <= 0) return null;
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-neutral-500">
              <span>{label}</span>
              <span>{doneN}/{totalN}</span>
            </div>
            <div className={cn("h-1 w-full rounded-full", dark ? "bg-neutral-800" : "bg-neutral-200")}>
              <div
                className="h-1 rounded-full bg-violet-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (doneN / totalN) * 100)}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* Checkpoint banner */}
      {isPaused && checkpointPhase && (
        <div className="flex items-center justify-between rounded-md border border-violet-600/40 bg-violet-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Pause className="size-4 text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-300">{t("autopilotrun.checkpointComplete", { phase: phaseDisplayLabel(t, checkpointPhase) })}</p>
              <p className="text-xs text-violet-500">{t("autopilotrun.checkpointDesc")}</p>
            </div>
          </div>
          <button
            onClick={() => resume.mutate()}
            disabled={resume.isPending}
            className="flex items-center gap-1.5 rounded bg-violet-600/30 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/40"
          >
            <Play className="size-3" /> {t("autopilotrun.resume")}
          </button>
        </div>
      )}

      {/* Interrupted banner — the run was cut off (refresh/restart); resume from cursor */}
      {isInterrupted && (
        <div className="flex items-center justify-between rounded-md border border-orange-600/40 bg-orange-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-orange-400" />
            <div>
              <p className="text-sm font-semibold text-orange-300">{t("autopilotrun.interruptedHeading")}</p>
              <p className="text-xs text-orange-400/80">
                {t("autopilotrun.interruptedDesc", { phase: phaseDisplayLabel(t, status.current_phase) })}
              </p>
            </div>
          </div>
          {onResume && (
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex shrink-0 items-center gap-1.5 rounded bg-orange-600/30 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-600/40 disabled:opacity-50"
            >
              <Play className="size-3" /> {resuming ? t("autopilotrun.resuming") : t("autopilotrun.resume")}
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {status.state === "error" && status.error && (
        <div className="rounded-md border border-red-600/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <p className="font-semibold">{t("autopilotrun.state.error")}</p>
          <p className="mt-0.5 text-xs text-red-400/80">{status.error}</p>
        </div>
      )}

      {/* Done banner */}
      {status.state === "done" && (
        <div className="flex items-center gap-3 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">{t("autopilotrun.completeHeading")}</p>
            <p className="text-xs text-emerald-500/80">
              {t("autopilotrun.completeDesc", { n: status.story_count })}
            </p>
          </div>
        </div>
      )}

      {/* Steer the AI — inject a note applied to every subsequent generative step */}
      {!isTerminal && !isInterrupted && (
        <div className={cn("rounded-md border p-3", dark ? "border-neutral-700/60 bg-neutral-800/30" : "border-neutral-200 bg-neutral-50")}>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <Bot className="size-3 text-violet-400" /> {t("autopilotrun.steerHeading")}
            </p>
            {status.steer_note ? (
              <span className="truncate text-xs text-violet-400/90" title={status.steer_note}>
                {t("autopilotrun.activeSteer", { note: `${status.steer_note.slice(0, 60)}${status.steer_note.length > 60 ? "…" : ""}` })}
              </span>
            ) : null}
          </div>
          <div className="flex items-start gap-2">
            <textarea
              value={steerDraft}
              onChange={(e) => setSteerDraft(e.target.value)}
              rows={2}
              placeholder={t("autopilotrun.steerPlaceholder")}
              className={cn(
                "flex-1 resize-y rounded border px-2 py-1.5 text-xs focus:border-violet-500/60 focus:outline-none",
                dark ? "border-neutral-700 bg-neutral-900/60 text-neutral-200 placeholder-neutral-600" : "border-neutral-200 bg-white text-neutral-800 placeholder-neutral-400",
              )}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) applySteer(); }}
            />
            <button
              type="button"
              onClick={applySteer}
              disabled={steer.isPending}
              className="flex items-center gap-1.5 rounded bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              <Send className="size-3" /> {t("autopilotrun.apply")}
            </button>
          </div>
          <p className={cn("mt-1 text-xs", dark ? "text-neutral-600" : "text-neutral-500")}>{t("autopilotrun.steerDesc")}</p>
        </div>
      )}

      {/* Event log + artifact preview side by side */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Event log — grouped per phase, collapsible */}
        <div className="xl:col-span-3">
          <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-600">
            <span>{t("autopilotrun.eventLogCount", { n: status.events.length })}</span>
            <span className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1 font-normal normal-case text-neutral-600">
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="size-3 accent-violet-500" />
                {t("autopilotrun.autoScroll")}
              </label>
              <CopyButton getText={() => logText} label={t("autopilotrun.log")} dark={dark} />
            </span>
          </p>
          <div
            ref={logRef}
            className={cn(
              "h-96 min-h-[10rem] max-h-[85vh] resize-y overflow-auto rounded-md border px-2 py-2 font-mono",
              dark ? "border-neutral-800 bg-neutral-900/60" : "border-neutral-200 bg-neutral-50",
            )}
          >
            {groups.map((g, gi) => {
              const key = `${g.phase}-${g.events[0].id}`;
              const isCollapsed = collapsed.has(key);
              return (
                <div key={key} className={cn("rounded", gi > 0 && cn("mt-1.5 border-t pt-1.5", dark ? "border-neutral-800/70" : "border-neutral-200"))}>
                  <button
                    type="button"
                    onClick={() => togglePhase(key)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500",
                      dark ? "hover:bg-neutral-800/60" : "hover:bg-neutral-100",
                    )}
                  >
                    {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    {phaseDisplayLabel(t, g.phase)}
                    <span className="font-normal normal-case text-neutral-600">· {g.events.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-0.5 pl-1">
                      {g.events.map((ev) => <EventRow key={ev.id} event={ev} dark={dark} />)}
                    </div>
                  )}
                </div>
              );
            })}
            {status.events.length === 0 && (
              <p className="text-xs text-neutral-600 pt-2">{t("autopilotrun.waitingFirstEvent")}</p>
            )}
          </div>
        </div>

        {/* Artifact viewer — pick from recent artifacts, follow the latest live */}
        <div className="xl:col-span-2">
          <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-600">
            <span>{t("autopilotrun.artifactsCount", { n: artifacts.length })}</span>
            <span className="flex items-center gap-2 font-normal normal-case text-neutral-700">
              <span>{t("autopilotrun.dragToResize")}</span>
              {selectedArtifact ? <CopyButton getText={() => selectedArtifact.artifact} label={t("autopilotrun.artifactLabel")} dark={dark} /> : null}
            </span>
          </p>

          {artifacts.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setPinnedArtifactId(null)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  following
                    ? cn("border-emerald-500/50 bg-emerald-500/15", dark ? "text-emerald-300" : "text-emerald-600")
                    : dark ? "border-neutral-700 text-neutral-500 hover:text-neutral-300" : "border-neutral-300 text-neutral-500 hover:text-neutral-700",
                )}
              >
                <span className={cn("size-1.5 rounded-full", following && isRunning ? "animate-pulse bg-emerald-400" : "bg-neutral-600")} />
                {t("autopilotrun.live")}
              </button>
              {artifacts.slice(-6).reverse().map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPinnedArtifactId(a.id)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    !following && selectedArtifact?.id === a.id
                      ? cn("border-violet-500/50 bg-violet-500/15", dark ? "text-violet-200" : "text-violet-600")
                      : dark ? "border-neutral-700 text-neutral-500 hover:text-neutral-300" : "border-neutral-300 text-neutral-500 hover:text-neutral-700",
                  )}
                >
                  {artifactKind(a, t)}
                </button>
              ))}
            </div>
          )}

          <div className={cn(
            "h-96 min-h-[10rem] max-h-[85vh] resize-y overflow-auto rounded-md border p-2",
            dark ? "border-neutral-800 bg-neutral-900/60" : "border-neutral-200 bg-neutral-50",
          )}>
            {selectedArtifact ? (
              <div>
                <div className={cn("mb-2 flex items-start justify-between gap-2 rounded border px-2 py-1.5", phaseAccent(selectedArtifact.phase, dark))}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider">{artifactKind(selectedArtifact, t)}</p>
                    <p className={cn("truncate text-xs", dark ? "text-neutral-400" : "text-neutral-500")}>{selectedArtifact.msg}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    {new Date(selectedArtifact.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                <pre className={cn("whitespace-pre-wrap break-words px-1 text-[11px] leading-relaxed font-mono", dark ? "text-neutral-300" : "text-neutral-700")}>
                  {selectedArtifact.artifact}
                </pre>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                <Bot className={cn("size-5", dark ? "text-neutral-700" : "text-neutral-400")} />
                <p className="text-xs text-neutral-600">{t("autopilotrun.artifactsEmpty")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
