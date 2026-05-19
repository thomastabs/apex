"use client";

import Link from "next/link";
import { CheckCircle2, Code2, Compass, FileText, Rocket, Wrench } from "lucide-react";
import { PhaseCard } from "@/components/phase-card";
import { useSessionStore } from "@/lib/stores/session-store";
import { useStoryIndexStats } from "@/lib/hooks/use-workspace";
import { useTechStackStatus } from "@/lib/hooks/use-phase2";

const phases = [
  {
    href: "/phase1",
    phase: "Phase 1",
    title: "Requirements",
    description: "Mob Elaboration — transform epics into formal Gherkin acceptance criteria",
    icon: FileText,
  },
  {
    href: "/phase2",
    phase: "Phase 2",
    title: "Design",
    description: "Technical architecture & specifications for each epic",
    icon: Compass,
  },
  {
    href: "/phase3",
    phase: "Phase 3",
    title: "Implementation",
    description: "AI-assisted development aligned to Gherkin specs and context",
    icon: Code2,
  },
  {
    href: "/phase4",
    phase: "Phase 4",
    title: "Testing",
    description: "BDD validation, QA coverage tracking and Fix-Apex cycles",
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

  function phaseBadge(phaseHref: string): string | undefined {
    if (!hasProject) return undefined;
    const stats = storyStats.data;
    if (phaseHref === "/phase1" && stats) return `${stats.total} stories`;
    if (phaseHref === "/phase2" && stats && stats.total > 0) {
      const pct = Math.round((stats.phase2_designed / stats.total) * 100);
      const stack = techStack.data?.defined ? " · stack ✓" : "";
      return `${stats.phase2_designed}/${stats.total} designed${stack}`;
    }
    if (phaseHref === "/phase3" && stats && stats.total > 0) return `${stats.phase3_proposed}/${stats.total} ready`;
    if (phaseHref === "/phase4" && stats && stats.total > 0) return `${stats.phase4_tested}/${stats.total} tested`;
    if (phaseHref === "/phase5" && stats && stats.total > 0) return `${stats.phase5_deployed}/${stats.total} deployed`;
    return undefined;
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
            <span className="mt-0.5 text-lg leading-none text-amber-500">⚠</span>
            <div>
              <p className="font-semibold text-amber-400">Not signed in</p>
              <p className="mt-0.5 text-amber-500/80">Sign in via the sidebar to start a session and select a Taiga project.</p>
            </div>
          </div>
        )}
      </div>

      {hasProject ? null : (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-600/40 bg-amber-500/8 px-4 py-3 text-sm">
          <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
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

      <div>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
          SDLC Phases
        </h2>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {phases.map((phase) => (
            <PhaseCard key={phase.href} {...phase} badge={phaseBadge(phase.href)} />
          ))}
        </div>
      </div>
    </section>
  );
}
