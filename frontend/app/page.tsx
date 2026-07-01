"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, BarChart2, Bot, Bug,
  CheckCircle2, Code2, Compass, FileText, GitGraph, Rocket, Wrench,
} from "lucide-react";
import { PhaseCard } from "@/components/phase-card";
import { ImportPanel } from "@/components/import-panel";
import { useSessionStore } from "@/lib/stores/session-store";
import { useStoryIndexStats } from "@/lib/hooks/use-workspace";
import { useTechStackStatus } from "@/lib/hooks/use-phase2";
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
    href: "/traceability",
    phase: "Traceability",
    title: "Trace Graph",
    description: "Live graph mapping requirements → design → tasks → tests → deployment",
    icon: GitGraph,
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

  const [importOpen, setImportOpen] = useState(false);

  const stats = storyStats.data;
  const stackDefined = Boolean(techStack.data?.defined);
  const phase1Done = Boolean(stats && stats.total > 0);
  const phase2Done = Boolean(stats && stats.total > 0 && stats.phase2_designed === stats.total);

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
      if (!phase1Done) return { badge: "waiting for Phase 1", status: "pending" };
      if (phase2Done)  return { badge: "design locked ✓", status: "done" };
      if (stackDefined) return { badge: "stack ✓ · design pending", status: "active" };
      return { badge: "stack pending", status: "active" };
    }
    if (phaseHref === "/phase3") {
      if (!phase2Done) return { badge: "waiting for Phase 2", status: "pending" };
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
    return { status: "pending" };
  }

  return (
    <section className="px-6 py-6 lg:px-8 lg:py-8">

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className={cn("text-lg font-semibold", dark ? "text-neutral-100" : "text-slate-900")}>
            Overview
          </h1>
          {hasProject && (
            <span className={cn(
              "rounded border px-2 py-0.5 text-xs font-medium",
              dark ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : "border-violet-300 bg-violet-50 text-violet-600",
            )}>
              {projectName || `Project #${projectId}`}
            </span>
          )}
        </div>
        <p className={cn("mt-0.5 text-sm", dark ? "text-neutral-500" : "text-slate-400")}>
          Spec-anchored human-AI collaboration for the full SDLC
        </p>
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

      {/* SDLC Phases */}
      <div>
        <h2 className={cn(
          "mb-3 text-[11px] font-bold uppercase tracking-[0.1em]",
          dark ? "text-neutral-600" : "text-slate-400",
        )}>
          SDLC Phases
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {phases.map((phase) => {
            const { badge, status } = phaseInfo(phase.href);
            return <PhaseCard key={phase.href} {...phase} badge={badge} status={status} dark={dark} />;
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
