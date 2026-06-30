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
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<string, string> = {
  init: "Init",
  phase1: "Phase 1 · Requirements",
  phase2: "Phase 2 · Design",
  phase3: "Phase 3 · Tasks",
  phase4: "Phase 4 · Testing",
  phase5: "Phase 5 · Deploy",
  done: "Done",
  "": "General",
};

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
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
          toast.error("Copy failed");
        }
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal normal-case text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const PHASES: { key: AutopilotPhase; label: string }[] = [
  { key: "phase1", label: "Requirements" },
  { key: "phase2", label: "Design" },
  { key: "phase3", label: "Tasks" },
  { key: "phase4", label: "Testing" },
  { key: "phase5", label: "Deploy" },
];

const PHASE_ORDER: AutopilotPhase[] = ["init", "phase1", "phase2", "phase3", "phase4", "phase5", "done"];

function phaseIndex(phase: AutopilotPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

function StateBadge({ state }: { state: AutopilotState }) {
  const cfg = {
    running: { color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", icon: <Loader2 className="size-3 animate-spin" />, label: "Running" },
    paused:  { color: "text-amber-400 bg-amber-500/15 border-amber-500/30", icon: <Pause className="size-3" />, label: "Paused" },
    stopped: { color: "text-neutral-400 bg-neutral-500/15 border-neutral-500/30", icon: <Square className="size-3" />, label: "Stopped" },
    done:    { color: "text-violet-400 bg-violet-500/15 border-violet-500/30", icon: <CheckCircle2 className="size-3" />, label: "Complete" },
    error:   { color: "text-red-400 bg-red-500/15 border-red-500/30", icon: <XCircle className="size-3" />, label: "Error" },
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

function EventRow({ event }: { event: AutopilotEvent }) {
  const ts = new Date(event.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const textColor =
    event.level === "success" ? "text-emerald-300"
    : event.level === "error" ? "text-red-300"
    : event.level === "warning" ? "text-amber-300"
    : event.level === "checkpoint" ? "text-violet-300"
    : "text-neutral-400";

  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="shrink-0 text-[10px] text-neutral-600 font-mono mt-0.5 w-16">{ts}</span>
      <EventIcon level={event.level} />
      <span className={cn("text-xs leading-relaxed", textColor)}>{event.msg}</span>
    </div>
  );
}

function PhaseProgress({ currentPhase, state }: { currentPhase: AutopilotPhase; state: AutopilotState }) {
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
                done ? "bg-emerald-500/20 text-emerald-400"
                : active ? (state === "paused" ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40" : "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40")
                : "bg-neutral-800 text-neutral-600",
              )}
            >
              {done ? <CheckCircle2 className="size-3" /> : active && state === "running" ? <Loader2 className="size-3 animate-spin" /> : <span className="size-3 flex items-center justify-center text-[9px]">{i + 1}</span>}
              {p.label}
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
};

export function AutopilotRunView({ status, onReset }: Props) {
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

  // Auto-scroll event log unless the user scrolled up to read history.
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [status.events.length, autoScroll]);

  const isTerminal = ["done", "stopped", "error"].includes(status.state);
  const isRunning = status.state === "running";
  const isPaused = status.state === "paused";

  async function handleTakeOver() {
    await takeOver.mutateAsync();
    router.push("/");
  }

  function applySteer() {
    const note = steerDraft.trim();
    steer.mutate(note, { onSuccess: () => toast.success(note ? "Steer applied to next steps" : "Steer cleared") });
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

  // Most recent artifact to preview
  const lastArtifact = [...status.events].reverse().find((e) => e.artifact);

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30">
            <Bot className="size-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Autopilot running</h2>
            <p className="text-xs text-neutral-500">
              {status.story_count > 0
                ? `${status.stories_done}/${status.story_count} stories processed`
                : "Generating specs…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StateBadge state={status.state} />
          {isRunning && (
            <button
              onClick={() => pause.mutate()}
              disabled={pause.isPending}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
            >
              <Pause className="size-3" /> Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => resume.mutate()}
              disabled={resume.isPending}
              className="flex items-center gap-1.5 rounded border border-violet-600/50 bg-violet-600/20 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-600/30 disabled:opacity-50"
            >
              <Play className="size-3" /> Resume
            </button>
          )}
          {!isTerminal && (
            <>
              <button
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-700 disabled:opacity-50"
              >
                <Square className="size-3" /> Stop
              </button>
              <button
                onClick={handleTakeOver}
                disabled={takeOver.isPending}
                className="flex items-center gap-1.5 rounded border border-amber-600/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                <UserCog className="size-3" /> Take Over
              </button>
            </>
          )}
          {isTerminal && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              <RotateCcw className="size-3" /> New run
            </button>
          )}
        </div>
      </div>

      {/* Phase progress */}
      <PhaseProgress currentPhase={status.current_phase} state={status.state} />

      {/* Story progress bar */}
      {status.story_count > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-neutral-500">
            <span>Stories</span>
            <span>{status.stories_done}/{status.story_count}</span>
          </div>
          <div className="h-1 w-full rounded-full bg-neutral-800">
            <div
              className="h-1 rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${(status.stories_done / status.story_count) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Checkpoint banner */}
      {isPaused && checkpointPhase && (
        <div className="flex items-center justify-between rounded-md border border-violet-600/40 bg-violet-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Pause className="size-4 text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-300">Checkpoint — {checkpointPhase} complete</p>
              <p className="text-xs text-violet-500">Review the generated artifacts, then resume when ready.</p>
            </div>
          </div>
          <button
            onClick={() => resume.mutate()}
            disabled={resume.isPending}
            className="flex items-center gap-1.5 rounded bg-violet-600/30 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/40"
          >
            <Play className="size-3" /> Resume
          </button>
        </div>
      )}

      {/* Error banner */}
      {status.state === "error" && status.error && (
        <div className="rounded-md border border-red-600/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <p className="font-semibold">Error</p>
          <p className="mt-0.5 text-xs text-red-400/80">{status.error}</p>
        </div>
      )}

      {/* Done banner */}
      {status.state === "done" && (
        <div className="flex items-center gap-3 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">Autopilot complete</p>
            <p className="text-xs text-emerald-500/80">
              Full SDLC pipeline finished for {status.story_count} stories. Navigate to any phase to review the artifacts.
            </p>
          </div>
        </div>
      )}

      {/* Steer the AI — inject a note applied to every subsequent generative step */}
      {!isTerminal && (
        <div className="rounded-md border border-neutral-700/60 bg-neutral-800/30 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              <Bot className="size-3 text-violet-400" /> Steer the AI
            </p>
            {status.steer_note ? (
              <span className="truncate text-[10px] text-violet-400/90" title={status.steer_note}>
                active: {status.steer_note.slice(0, 60)}{status.steer_note.length > 60 ? "…" : ""}
              </span>
            ) : null}
          </div>
          <div className="flex items-start gap-2">
            <textarea
              value={steerDraft}
              onChange={(e) => setSteerDraft(e.target.value)}
              rows={2}
              placeholder="e.g. Prefer mobile-first flows; keep stories small; assume an existing auth service. Applied to the next story/design/task the AI generates."
              className="flex-1 resize-y rounded border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:border-violet-500/60 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) applySteer(); }}
            />
            <button
              type="button"
              onClick={applySteer}
              disabled={steer.isPending}
              className="flex items-center gap-1.5 rounded bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              <Send className="size-3" /> Apply
            </button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">Guides Phase 1 stories, Phase 2 design, and Phase 3 tasks generated after you apply it (⌘/Ctrl+Enter). Clear the box and Apply to remove.</p>
        </div>
      )}

      {/* Event log + artifact preview side by side */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Event log — grouped per phase, collapsible */}
        <div className="xl:col-span-3">
          <p className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            <span>Event log · {status.events.length} events</span>
            <span className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1 font-normal normal-case text-neutral-600">
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="size-3 accent-violet-500" />
                auto-scroll
              </label>
              <CopyButton getText={() => logText} label="log" />
            </span>
          </p>
          <div
            ref={logRef}
            className="h-96 min-h-[10rem] max-h-[85vh] resize-y overflow-auto rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-2 font-mono"
          >
            {groups.map((g, gi) => {
              const key = `${g.phase}-${g.events[0].id}`;
              const isCollapsed = collapsed.has(key);
              return (
                <div key={key} className={cn("rounded", gi > 0 && "mt-1.5 border-t border-neutral-800/70 pt-1.5")}>
                  <button
                    type="button"
                    onClick={() => togglePhase(key)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-500 hover:bg-neutral-800/60"
                  >
                    {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    {PHASE_LABELS[g.phase] ?? g.phase}
                    <span className="font-normal normal-case text-neutral-600">· {g.events.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-0.5 pl-1">
                      {g.events.map((ev) => <EventRow key={ev.id} event={ev} />)}
                    </div>
                  )}
                </div>
              );
            })}
            {status.events.length === 0 && (
              <p className="text-xs text-neutral-600 pt-2">Waiting for first event…</p>
            )}
          </div>
        </div>

        {/* Artifact preview */}
        <div className="xl:col-span-2">
          <p className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            <span>Latest artifact</span>
            <span className="flex items-center gap-2 font-normal normal-case text-neutral-700">
              <span>drag ↕ to resize</span>
              {lastArtifact ? <CopyButton getText={() => lastArtifact.artifact} label="artifact" /> : null}
            </span>
          </p>
          <div className="h-96 min-h-[10rem] max-h-[85vh] resize-y overflow-auto rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2">
            {lastArtifact ? (
              <div>
                <p className="mb-1.5 text-[10px] text-neutral-500">{lastArtifact.msg}</p>
                <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-neutral-400 font-mono">
                  {lastArtifact.artifact}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-neutral-600 pt-2">Artifacts will appear here as they&apos;re generated…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
