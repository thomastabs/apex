import { CheckCircle2, Code2, Compass, FileText, Rocket, Wrench } from "lucide-react";
import { PhaseCard } from "@/components/phase-card";

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
  return (
    <section className="px-8 py-8">
      <div className="mb-8 border-b border-slate-200 pb-8">
        <h1 className="text-6xl font-bold tracking-normal text-violet-400">Apex</h1>
        <p className="mt-3 text-lg text-neutral-500">
          Spec-Anchored Human-AI Collaboration Framework for the SDLC
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            ✓ Session state ready
          </span>
          <span className="rounded bg-violet-100 px-2 py-1 text-xs font-medium text-apex-violet">
            API data layer ready
          </span>
        </div>
      </div>
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
