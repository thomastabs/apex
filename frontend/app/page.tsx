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
import { useT } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

const phaseDefs = [
  { href: "/phase1", n: 1, titleKey: "nav.phase1", descKey: "home.phase1Desc", icon: FileText },
  { href: "/phase2", n: 2, titleKey: "nav.phase2", descKey: "home.phase2Desc", icon: Compass },
  { href: "/phase3", n: 3, titleKey: "nav.phase3", descKey: "home.phase3Desc", icon: Code2 },
  { href: "/phase4", n: 4, titleKey: "nav.phase4", descKey: "home.phase4Desc", icon: CheckCircle2 },
  { href: "/phase5", n: 5, titleKey: "nav.phase5", descKey: "home.phase5Desc", icon: Rocket },
  { href: "/phase6", n: 6, titleKey: "nav.phase6", descKey: "home.phase6Desc", icon: Wrench },
] as const;

const toolDefs = [
  { href: "/autopilot", eyebrowKey: "home.tool.automation", titleKey: "nav.autopilot", descKey: "home.tool.autopilotDesc", icon: Bot },
  { href: "/fix-bolt", eyebrowKey: "home.tool.quality", titleKey: "nav.fixBolt", descKey: "home.tool.fixBoltDesc", icon: Bug },
  { href: "/analytics", eyebrowKey: "home.tool.insights", titleKey: "nav.analytics", descKey: "home.tool.analyticsDesc", icon: BarChart2 },
] as const;

export default function HomePage() {
  const theme = useUiStore((s) => s.theme);
  const dark = theme === "dark";
  const t = useT();

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
  const loopSignalCount = (stats?.trace_flagged ?? 0) + (stats?.conformance_regressed ?? 0);
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
        ? { badge: t("home.badge.pushed", { n: stats.total }), status: "done" }
        : { badge: t("home.badge.noStoriesYet"), status: "active" };
    }
    if (phaseHref === "/phase2") {
      if (!phase1Done) return { badge: t("home.badge.needsPhase", { n: 1 }), status: "pending" };
      if (phase2Done)  return { badge: t("home.badge.designLocked"), status: "done" };
      if (stackDefined) return { badge: t("home.badge.stackDesignPending"), status: "active" };
      return { badge: t("home.badge.stackPending"), status: "active" };
    }
    if (phaseHref === "/phase3") {
      if (!phase2Done) return { badge: t("home.badge.needsPhase", { n: 2 }), status: "pending" };
      if (stats && stats.phase3_proposed > 0) return { badge: t("home.badge.proposed", { n: stats.phase3_proposed, total: stats.total }), status: "active" };
      return { badge: t("home.badge.readyToStart"), status: "active" };
    }
    if (phaseHref === "/phase4") {
      if (stats && stats.phase4_tested > 0) return { badge: t("home.badge.tested", { n: stats.phase4_tested, total: stats.total }), status: "active" };
      return { status: "pending" };
    }
    if (phaseHref === "/phase5") {
      if (stats && stats.phase5_deployed > 0) return { badge: t("home.badge.deployed", { n: stats.phase5_deployed, total: stats.total }), status: "active" };
      return { status: "pending" };
    }
    if (phaseHref === "/phase6") {
      // Maintenance is a loop, not a completable step — never "done" here, only
      // "pending" (no project yet) or "active" (the loop is always live once a
      // project exists, whether or not anything is currently flagged).
      if (openMaintenanceCount > 0 || regressedCount > 0) {
        const parts = [];
        if (openMaintenanceCount > 0) parts.push(t("home.badge.openCount", { n: openMaintenanceCount }));
        if (regressedCount > 0) parts.push(t("home.attention.regressed", { n: regressedCount }));
        return { badge: parts.join(" · "), status: "active" };
      }
      return { badge: t("home.badge.noActiveIssues"), status: "active" };
    }
    return { status: "pending" };
  }

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Apex</p>
          <h1 className={cn("text-5xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>
            {t("home.title")}
          </h1>
          <p className={cn("mt-2", dark ? "text-neutral-500" : "text-slate-400")}>
            {t("home.tagline")}
          </p>
        </div>
        {hasProject && (
          <span className={cn(
            "rounded border px-2 py-0.5 text-xs font-medium sm:mt-2",
            dark ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : "border-violet-300 bg-violet-50 text-violet-600",
          )}>
            {projectName || t("home.projectFallback", { id: projectId ?? "" })}
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
            <p className="font-semibold">{t("home.notSignedIn.title")}</p>
            <p className={cn("mt-0.5 text-xs", dark ? "text-amber-500/80" : "text-amber-600/80")}>
              {t("home.notSignedIn.desc")}
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
          <p>{t("home.selectProject")}</p>
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
            {t("home.reimportStories")}
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
                {t(attentionCount === 1 ? "home.attention.titleOne" : "home.attention.titleOther", { count: attentionCount })}
              </p>
              <p className={cn("text-xs", dark ? "text-red-500/80" : "text-red-600/80")}>
                {[
                  regressedCount > 0 ? t("home.attention.regressed", { n: regressedCount }) : null,
                  (stats?.trace_flagged ?? 0) > 0 ? t("home.attention.traceFlagged", { n: stats?.trace_flagged ?? 0 }) : null,
                  openMaintenanceCount > 0 ? t(openMaintenanceCount === 1 ? "home.attention.openMaintenanceOne" : "home.attention.openMaintenanceOther", { n: openMaintenanceCount }) : null,
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
          ? { href: "/phase5", title: t("home.next.deployed.title"), body: t("home.next.deployed.body", { deployed: stats.phase5_deployed, total }) }
          : anyTested
            ? { href: "/phase4", title: t("home.next.tested.title"), body: t("home.next.tested.body", { tested: stats.phase4_tested, total }) }
            : anyProposed
              ? { href: "/phase3", title: t("home.next.proposed.title"), body: t("home.next.proposed.body", { proposed: stats.phase3_proposed, total }) }
              : { href: "/phase3", title: t("home.next.readyPhase3.title"), body: t("home.next.readyPhase3.body") };
        return (
          <Link
            href={next.href}
            className={cn(
              "mb-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm transition-colors",
              dark
                ? "border-violet-500/30 bg-violet-500/8 hover:border-violet-500/60"
                : "border-violet-300 bg-violet-50 hover:border-violet-400",
            )}
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-4 shrink-0 text-violet-400" />
              <div>
                <p className={cn("font-semibold", dark ? "text-violet-300" : "text-violet-700")}>{next.title}</p>
                <p className={cn("text-xs", dark ? "text-violet-400/80" : "text-violet-600/80")}>{next.body}</p>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-violet-400" />
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
          {t("home.liveTraceability")}
        </h2>
        <PhaseCard
          href="/traceability"
          phase={t("home.traceGraph.phase")}
          title={t("nav.traceGraph")}
          description={t("home.traceGraph.description")}
          icon={GitGraph}
          badge={!hasProject ? undefined : loopSignalCount > 0 ? t(loopSignalCount === 1 ? "home.traceGraph.badgeActiveOne" : "home.traceGraph.badgeActiveOther", { n: loopSignalCount }) : t("home.traceGraph.badgeSteady")}
          status={!hasProject ? "pending" : loopSignalCount > 0 ? "active" : "done"}
          dark={dark}
        />
      </div>

      {/* SDLC Phases — full cards on purpose: this grid is the app's main
          navigation, so it keeps card-level presence (the loop framing is
          carried by the Live Traceability section + attention banner above). */}
      <div>
        <h2 className={cn(
          "mb-3 text-[11px] font-bold uppercase tracking-[0.1em]",
          dark ? "text-neutral-600" : "text-slate-400",
        )}>
          {t("home.sdlcPhases")}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {phaseDefs.map((phase) => {
            const { badge, status } = phaseInfo(phase.href);
            return (
              <PhaseCard
                key={phase.href}
                href={phase.href}
                phase={t("common.phaseEyebrow", { n: phase.n })}
                title={t(phase.titleKey)}
                description={t(phase.descKey)}
                icon={phase.icon}
                badge={badge}
                status={status}
                dark={dark}
              />
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
          {t("home.toolsInsights")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {toolDefs.map((tool) => (
            <PhaseCard
              key={tool.href}
              href={tool.href}
              phase={t(tool.eyebrowKey)}
              title={t(tool.titleKey)}
              description={t(tool.descKey)}
              icon={tool.icon}
              status={hasProject ? "active" : "pending"}
              dark={dark}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
