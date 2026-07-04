"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle, AlertTriangle, ArrowRight, BarChart2, Bot, Bug,
  CheckCircle2, Code2, Compass, FileText, GitGraph, Rocket, Wrench,
} from "lucide-react";
import { PhaseCard } from "@/components/phase-card";
import { ImportPanel } from "@/components/import-panel";
import { useSessionStore } from "@/lib/stores/session-store";
import { useStoryIndexStats } from "@/lib/hooks/use-workspace";
import { useTechStackStatus } from "@/lib/hooks/use-phase2";
import { useMaintenanceItems } from "@/lib/hooks/use-phase6";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

const phases = [
  {
    href: "/phase1",
    phase: "Phase 1",
    title: "Requirements",
    description: "Turn epics into testable Acceptance Criteria and publish to your PM tool",
    icon: FileText,
  },
  {
    href: "/phase2",
    phase: "Phase 2",
    title: "Design",
    description: "Lock tech choices, generate screens and specs, get Design + Tech sign-off",
    icon: Compass,
  },
  {
    href: "/phase3",
    phase: "Phase 3",
    title: "Implementation",
    description: "AI-assisted development guided by locked requirements and design specs",
    icon: Code2,
  },
  {
    href: "/phase4",
    phase: "Phase 4",
    title: "Testing",
    description: "Automated test generation, QA coverage tracking, and fix cycles",
    icon: CheckCircle2,
  },
  {
    href: "/phase5",
    phase: "Phase 5",
    title: "Deployment",
    description: "Release management, board review, and staging sign-off",
    icon: Rocket,
  },
  {
    href: "/phase6",
    phase: "Phase 6",
    title: "Maintenance",
    description: "Continuous evolution, bug remediation, and knowledge capture",
    icon: Wrench,
  },
];

const tools = [
  {
    href: "/autopilot",
    phase: "Automation",
    title: "Autopilot",
    description: "AI-driven end-to-end pipeline — generate stories, design, tasks, and tests in one run",
    icon: Bot,
  },
  {
    href: "/fix-bolt",
    phase: "Quality",
    title: "Fix Bolt",
    description: "Bug-report intake, triage, and fix-log tracking linked back to specs",
    icon: Bug,
  },
  {
    href: "/analytics",
    phase: "Insights",
    title: "Analytics",
    description: "Phase velocity, coverage gaps, risk heat-map, and spec-conformance trends",
    icon: BarChart2,
  },
];

export default function HomePage() {
  const theme = useUiStore((s) => s.theme);
  const dark = theme === "dark";

  const taigaToken = useSessionStore((s) => s.taigaToken);
  const projectId = useSessionStore((s) => s.projectId);
  const projectName = useSessionStore((s) => s.projectName);
  const isAuthenticated = Boolean(taigaToken);
  const hasProject = Boolean(taigaToken && projectId);

  const storyStats = useStoryIndexStats();
  const techStack = useTechStackStatus();
  const maintenanceItems = useMaintenanceItems();

  const [importOpen, setImportOpen] = useState(false);

  const stats = storyStats.data;
  const stackDefined = Boolean(techStack.data?.defined);
  const phase1Done = Boolean(stats && stats.total > 0);
  const phase2Done = Boolean(stats && stats.total > 0 && stats.phase2_designed === stats.total);
  const openMaintenanceCount = maintenanceItems.data?.items.filter((i) => i.status !== "resolved").length ?? 0;
  const regressedCount = stats?.conformance_regressed ?? 0;
  const loopSignalCount = (stats?.trace_flagged ?? 0) + (stats?.conformance_regressed ?? 0) + (stats?.design_conflict ?? 0);
  // Not strictly "N stories" — a story can carry >1 flag, and a maintenance
  // item isn't guaranteed linked to a story — so this is a signal count, not
  // a story count. Worded as such below rather than overclaiming precision.
  const attentionCount = loopSignalCount + openMaintenanceCount;

  type PhaseInfo = { badge?: string; status: "done" | "active" | "pending" };

  function phaseInfo(phaseHref: string): PhaseInfo {
    if (!hasProject) return { status: "pending" };
    if (phaseHref === "/phase1") {
      if (!stats) return { status: "active" };
      return stats.total > 0
        ? { badge: `${stats.total} pushed`, status: "done" }
        : { badge: "no stories yet", status: "active" };
    }
    if (phaseHref === "/phase2") {
      if (!phase1Done) return { badge: "needs Phase 1", status: "pending" };
      if (phase2Done)  return { badge: "design locked ✓", status: "done" };
      if (stackDefined) return { badge: "stack ✓ · design pending", status: "active" };
      return { badge: "stack pending", status: "active" };
    }
    if (phaseHref === "/phase3") {
      if (!phase2Done) return { badge: "needs Phase 2", status: "pending" };
      if (stats && stats.phase3_proposed > 0) return { badge: `${stats.phase3_proposed}/${stats.total} proposed`, status: "active" };
      return { badge: "ready to start", status: "active" };
    }
    if (phaseHref === "/phase4") {
      if (stats && stats.phase4_tested > 0) return { badge: `${stats.phase4_tested}/${stats.total} tested`, status: "active" };
      return { status: "pending" };
    }
    if (phaseHref === "/phase5") {
      if (stats && stats.phase5_deployed > 0) return { badge: `${stats.phase5_deployed}/${stats.total} deployed`, status: "active" };
      return { status: "pending" };
    }
    if (phaseHref === "/phase6") {
      // Maintenance is a loop, not a completable step — never "done" here, only
      // "pending" (no project yet) or "active" (the loop is always live once a
      // project exists, whether or not anything is currently flagged).
      if (openMaintenanceCount > 0 || regressedCount > 0) {
        const parts = [];
        if (openMaintenanceCount > 0) parts.push(`${openMaintenanceCount} open`);
        if (regressedCount > 0) parts.push(`${regressedCount} regressed`);
        return { badge: parts.join(" · "), status: "active" };
      }
      return { badge: "no active issues", status: "active" };
    }
    return { status: "pending" };
  }

  return (
    <section className="px-6 py-6 lg:px-8 lg:py-8">

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Apex</p>
          <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
            Overview
          </h1>
          <p className={cn("mt-2", dark ? "text-neutral-500" : "text-slate-400")}>
            Spec-anchored human-AI collaboration for the full SDLC
          </p>
        </div>
        {hasProject && (
          <span className={cn(
            "mt-2 rounded border px-2 py-0.5 text-xs font-medium",
            dark ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : "border-violet-300 bg-violet-50 text-violet-600",
          )}>
            {projectName || `Project #${projectId}`}
          </span>
        )}
      </div>

      {/* Auth banner — shown only when not signed in */}
      {!isAuthenticated && (
        <div className={cn(
          "mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
          dark
            ? "border-amber-600/40 bg-amber-500/8 text-amber-400"
            : "border-amber-400/50 bg-amber-50 text-amber-700",
        )}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Not signed in</p>
            <p className={cn("mt-0.5 text-xs", dark ? "text-amber-500/80" : "text-amber-600/80")}>
              Sign in via the sidebar to start a session and select a project.
            </p>
          </div>
        </div>
      )}

      {/* No project selected (but authenticated) */}
      {isAuthenticated && !hasProject && (
        <div className={cn(
          "mb-6 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm",
          dark
            ? "border-amber-600/30 bg-amber-500/8 text-amber-500"
            : "border-amber-300 bg-amber-50 text-amber-700",
        )}>
          <AlertCircle className="size-4 shrink-0" />
          <p>Select a project in the sidebar to activate phase workflows.</p>
        </div>
      )}

      {/* Import panel */}
      {hasProject && storyStats.isSuccess && (importOpen || (stats && stats.total === 0)) ? (
        <div className="mb-6">
          <ImportPanel onStart={() => setImportOpen(true)} />
        </div>
      ) : hasProject && storyStats.isSuccess && stats && stats.total > 0 && !importOpen ? (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setImportOpen(true)}
            className={cn(
              "text-xs underline underline-offset-2",
              dark ? "text-neutral-600 hover:text-neutral-400" : "text-slate-400 hover:text-slate-600",
            )}
          >
            Re-import stories from Taiga
          </button>
        </div>
      ) : null}

      {/* Needs-attention callout — loop signal, placed above the forward "next
          step" banner (not subordinate to it) so the DevOps-loop side of the
          project is never a lower priority than the sequential-progress side. */}
      {hasProject && attentionCount > 0 ? (
        <Link
          href="/traceability"
          className={cn(
            "mb-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm transition-colors",
            dark
              ? "border-red-600/40 bg-red-500/8 hover:border-red-500/60"
              : "border-red-400/50 bg-red-50 hover:border-red-400",
          )}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-4 shrink-0 text-red-400" />
            <div>
              <p className={cn("font-semibold", dark ? "text-red-300" : "text-red-700")}>
                {attentionCount} open loop signal{attentionCount === 1 ? "" : "s"}
              </p>
              <p className={cn("text-xs", dark ? "text-red-500/80" : "text-red-600/80")}>
                {[
                  regressedCount > 0 ? `${regressedCount} regressed` : null,
                  (stats?.trace_flagged ?? 0) > 0 ? `${stats?.trace_flagged} trace-flagged` : null,
                  (stats?.design_conflict ?? 0) > 0 ? `${stats?.design_conflict} conflicted` : null,
                  openMaintenanceCount > 0 ? `${openMaintenanceCount} open maintenance item${openMaintenanceCount === 1 ? "" : "s"}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-red-400" />
        </Link>
      ) : null}

      {/* Next-step callout */}
      {hasProject && phase2Done && stats ? (() => {
        const total = stats.total;
        const anyDeployed = stats.phase5_deployed > 0;
        const anyTested = stats.phase4_tested > 0;
        const anyProposed = stats.phase3_proposed > 0;
        const next = anyDeployed
          ? { href: "/phase5", title: "Stories in deployment", body: `${stats.phase5_deployed}/${total} deployed — manage releases in Phase 5 and maintenance in Phase 6.` }
          : anyTested
            ? { href: "/phase4", title: "Testing underway", body: `${stats.phase4_tested}/${total} stories have test plans — continue QA in Phase 4.` }
            : anyProposed
              ? { href: "/phase3", title: "Implementation underway", body: `${stats.phase3_proposed}/${total} stories have developer packs — continue in Phase 3.` }
              : { href: "/phase3", title: "Phases 1 & 2 complete", body: "Design is locked. Your project is ready for Phase 3 · Implementation." };
        return (
          <Link
            href={next.href}
            className={cn(
              "mb-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm transition-colors",
              dark
                ? "border-emerald-600/40 bg-emerald-500/8 hover:border-emerald-500/60"
                : "border-emerald-400/50 bg-emerald-50 hover:border-emerald-400",
            )}
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <div>
                <p className={cn("font-semibold", dark ? "text-emerald-300" : "text-emerald-700")}>{next.title}</p>
                <p className={cn("text-xs", dark ? "text-emerald-500/80" : "text-emerald-600/80")}>{next.body}</p>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-emerald-400" />
          </Link>
        );
      })() : null}

      {/* Live Traceability — promoted out of Tools & Insights so the loop-aware
          view carries equal weight to the phase grid, not a secondary utility. */}
      <div className="mb-6">
        <h2 className={cn(
          "mb-3 text-[11px] font-bold uppercase tracking-[0.1em]",
          dark ? "text-neutral-600" : "text-slate-400",
        )}>
          Live Traceability
        </h2>
        <PhaseCard
          href="/traceability"
          phase="Loop"
          title="Trace Graph"
          description="Every story's epic → design → tasks → tests → deploy chain, live — plus cross-story conflicts and regression loop-backs as they happen, not just forward progress."
          icon={GitGraph}
          badge={!hasProject ? undefined : loopSignalCount > 0 ? `${loopSignalCount} loop${loopSignalCount === 1 ? "" : "s"} active` : "steady"}
          status={!hasProject ? "pending" : loopSignalCount > 0 ? "active" : "done"}
          dark={dark}
        />
      </div>

      {/* SDLC Phases — a compact strip, not a card grid: the phases are the
          route INTO the loop, not the headline of the page. Full descriptions
          live on each phase page (and in the title tooltip here). */}
      <div>
        <h2 className={cn(
          "mb-3 text-[11px] font-bold uppercase tracking-[0.1em]",
          dark ? "text-neutral-600" : "text-slate-400",
        )}>
          SDLC Phases
        </h2>
        {/* flex-wrap + min tile width (not viewport grid breakpoints): the
            content column's real width depends on the two sidebars, so tiles
            must size to their container — one row when open, wrapping when
            squeezed. */}
        <div className="flex flex-wrap gap-2">
          {phases.map((phase) => {
            const { badge, status } = phaseInfo(phase.href);
            const Icon = phase.icon;
            return (
              <Link
                key={phase.href}
                href={phase.href}
                title={phase.description}
                className={cn(
                  "group flex min-w-[10.5rem] flex-1 basis-44 items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-150",
                  dark
                    ? "border-neutral-800 bg-neutral-900/40 hover:border-violet-500/40 hover:bg-neutral-800/60"
                    : "border-slate-200 bg-white shadow-sm hover:border-violet-300 hover:bg-violet-50/40",
                )}
              >
                <div className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md",
                  dark ? "bg-neutral-800" : "bg-slate-100",
                )}>
                  <Icon className={cn(
                    "size-3.5",
                    status === "pending"
                      ? dark ? "text-neutral-600" : "text-slate-300"
                      : "text-violet-400",
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "truncate text-xs font-semibold transition-colors",
                      status === "pending"
                        ? dark ? "text-neutral-500" : "text-slate-400"
                        : dark ? "text-neutral-100 group-hover:text-violet-300" : "text-slate-900 group-hover:text-violet-600",
                    )}>
                      {phase.title}
                    </span>
                    {status === "done" ? (
                      <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                    ) : status === "active" ? (
                      <span className="block size-1.5 shrink-0 rounded-full bg-violet-400" />
                    ) : null}
                  </div>
                  <div className={cn("truncate text-[10px]", dark ? "text-neutral-600" : "text-slate-400")}>
                    {badge ? `${phase.phase} · ${badge}` : phase.phase}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Tools */}
      <div className="mt-6">
        <h2 className={cn(
          "mb-3 text-[11px] font-bold uppercase tracking-[0.1em]",
          dark ? "text-neutral-600" : "text-slate-400",
        )}>
          Tools &amp; Insights
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <PhaseCard
              key={tool.href}
              {...tool}
              status={hasProject ? "active" : "pending"}
              dark={dark}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
