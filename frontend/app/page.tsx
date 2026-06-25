"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Code2, Compass, FileText, Rocket, Wrench } from "lucide-react";
import { PhaseCard } from "@/components/phase-card";
import { ImportPanel } from "@/components/import-panel";
import { useSessionStore } from "@/lib/stores/session-store";
import { useStoryIndexStats } from "@/lib/hooks/use-workspace";
import { useTechStackStatus } from "@/lib/hooks/use-phase2";

const phases = [
  {
    href: "/phase1",
    phase: "Phase 1",
    title: "Requirements",
    description: "Turn epics into clear, testable Acceptance Criteria and publish them to your PM tool",
    icon: FileText,
  },
  {
    href: "/phase2",
    phase: "Phase 2",
    title: "Design",
    description: "One project-wide design: lock tech choices, generate screens, flows, and specs, then get Design Lead + Tech Lead sign-off",
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
    description: "Release management, Apex board review and staging sign-off",
    icon: Rocket,
  },
  {
    href: "/phase6",
    phase: "Phase 6",
    title: "Maintenance",
    description: "Continuous evolution, bug remediation and knowledge capture",
    icon: Wrench,
  },
];

export default function HomePage() {
  const taigaToken = useSessionStore((s) => s.taigaToken);
  const projectId = useSessionStore((s) => s.projectId);
  const projectName = useSessionStore((s) => s.projectName);
  const isAuthenticated = Boolean(taigaToken);
  const hasProject = Boolean(taigaToken && projectId);

  const storyStats = useStoryIndexStats();
  const techStack = useTechStackStatus();

  // importOpen: true when panel is explicitly open (persists even after stories imported)
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
    <section className="px-8 py-8">
      <div className="mb-8 border-b border-neutral-800 pb-8">
        <h1 className="text-6xl font-bold tracking-normal text-violet-400">Apex</h1>
        <p className="mt-3 text-lg text-neutral-500">
          Spec-Anchored Human-AI Collaboration Framework for the SDLC
        </p>

        {isAuthenticated ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-500">
              ✓ Signed in
            </span>
            {hasProject ? (
              <span className="rounded border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-400">
                {projectName || `Project #${projectId}`}
              </span>
            ) : (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-500">
                No project selected — open sidebar to choose one
              </span>
            )}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold text-amber-400">Not signed in</p>
              <p className="mt-0.5 text-amber-500/80">Sign in via the sidebar to start a session and select a project.</p>
            </div>
          </div>
        )}
      </div>

      {hasProject ? null : (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/40 bg-amber-500/8 px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="text-amber-500/90">
            Phase workflows are available after signing in and selecting a project.{" "}
            {!isAuthenticated ? (
              <span className="font-medium text-amber-400">Sign in via the sidebar.</span>
            ) : (
              <span className="font-medium text-amber-400">Select a project in the sidebar.</span>
            )}
          </p>
        </div>
      )}

      {/* Import panel — auto-shown when story-index is empty; re-openable via link */}
      {hasProject && storyStats.isSuccess && (importOpen || (stats && stats.total === 0)) ? (
        <div className="mb-6">
          <ImportPanel onStart={() => setImportOpen(true)} />
        </div>
      ) : hasProject && storyStats.isSuccess && stats && stats.total > 0 && !importOpen ? (
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setImportOpen(true)}
            className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
          >
            Re-import stories from Taiga
          </button>
        </div>
      ) : null}

      {/* Next-step callout — reflects the furthest phase the project has reached */}
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
            className="mb-6 flex items-center justify-between gap-4 rounded-md border border-emerald-600/40 bg-emerald-500/8 px-4 py-3 text-sm transition-colors hover:border-emerald-500/60"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-300">{next.title}</p>
                <p className="text-emerald-500/80">{next.body}</p>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-emerald-400" />
          </Link>
        );
      })() : null}

      <div>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
          SDLC Phases
        </h2>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {phases.map((phase) => {
            const { badge, status } = phaseInfo(phase.href);
            return <PhaseCard key={phase.href} {...phase} badge={badge} status={status} />;
          })}
        </div>
      </div>
    </section>
  );
}
