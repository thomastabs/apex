"use client";

import dynamic from "next/dynamic";
import { GitGraph, Loader2, Share2 } from "lucide-react";
import { TraceabilityGraphPanel } from "@/components/traceability-graph-panel";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

// react-force-graph-2d renders to a <canvas> via a browser-only physics
// engine (no SSR support) — load it only on the client, only when picked.
const TraceabilityClusterPanel = dynamic(
  () => import("@/components/traceability-cluster-panel").then((m) => m.TraceabilityClusterPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-58px)] items-center justify-center gap-3 text-sm text-neutral-400">
        <Loader2 className="size-4 animate-spin" /> Loading cluster view…
      </div>
    ),
  },
);

export default function TraceabilityPage() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const view = useUiStore((s) => s.traceabilityView);
  const setView = useUiStore((s) => s.setTraceabilityView);

  return (
    <div className="relative">
      <div
        className={cn(
          "absolute right-8 top-6 z-10 flex overflow-hidden rounded-md border text-xs font-medium",
          dark ? "border-neutral-700 bg-neutral-900" : "border-slate-300 bg-white",
        )}
      >
        <button
          onClick={() => setView("flowchart")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 transition-colors",
            view === "flowchart"
              ? "bg-violet-700 text-white"
              : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-100",
          )}
        >
          <Share2 className="size-3.5" /> Flowchart
        </button>
        <button
          onClick={() => setView("cluster")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 transition-colors",
            view === "cluster"
              ? "bg-violet-700 text-white"
              : dark ? "text-neutral-400 hover:bg-neutral-800" : "text-slate-500 hover:bg-slate-100",
          )}
        >
          <GitGraph className="size-3.5" /> Cluster
        </button>
      </div>
      {view === "cluster" ? <TraceabilityClusterPanel /> : <TraceabilityGraphPanel />}
    </div>
  );
}
