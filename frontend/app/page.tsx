"use client";

import Link from "next/link";
import { CheckCircle2, Code2, Compass, FileText, Rocket, Wrench } from "lucide-react";
import { PhaseCard } from "@/components/phase-card";
import { useSessionStore } from "@/lib/stores/session-store";

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
    description: "Technical architecture & specifications for each user story",
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
          <div className="mt-4 rounded-md border border-neutral-700/60 bg-neutral-500/5 px-4 py-3 text-sm text-neutral-400">
            Sign in via the sidebar to start a session and select a Taiga project.
          </div>
        )}
      </div>

      {hasProject ? null : (
        <div className="mb-6 rounded-md border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-500">
          Phase workflows are available after signing in and selecting a project.
          {!isAuthenticated ? (
            <> <span className="text-violet-400">Sign in via the sidebar.</span></>
          ) : (
            <> <span className="text-violet-400">Select a project in the sidebar.</span></>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
          SDLC Phases
        </h2>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {phases.map((phase) => (
            <PhaseCard key={phase.href} {...phase} />
          ))}
        </div>
      </div>
    </section>
  );
}
