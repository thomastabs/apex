"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";
import { AlertTriangle, Download, LayoutDashboard, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { SignInRequired } from "@/components/sign-in-required";
import { useSaveTraceLayout, useTraceabilityGraph } from "@/lib/hooks/use-workspace";
import type { TraceNode as ApiNode, TraceEdge as ApiEdge, TraceNodeType } from "@/lib/api/workspace";

// Obsidian-graph-style rendering: same TYPE_COLOR/STATUS_TINT palette and
// filter semantics as traceability-graph-panel.tsx (the Flowchart view), but
// its own fetch + filter logic — kept independent on purpose rather than
// refactored into a shared hook, so a change here can never regress the
// other (proven, user-approved) view.

const TYPE_COLOR: Record<TraceNodeType, string> = {
  project: "#0ea5e9",
  epic: "#8b5cf6",
  design: "#14b8a6",
  runtime: "#06b6d4",
  story: "#6366f1",
  gherkin: "#a855f7",
  scenario: "#c084fc",
  tasks: "#f59e0b",
  tests: "#10b981",
  deploy: "#ef4444",
  figma: "#a259ff",
};

const STATUS_TINT: Record<string, string> = {
  new: "#9ca3af",
  gherkin_locked: "#a855f7",
  design_locked: "#14b8a6",
  implementation: "#f59e0b",
  qa: "#eab308",
  qa_passed: "#22c55e",
  deployed: "#10b981",
};

function linkColor(kind: ApiEdge["kind"], dark: boolean): string {
  switch (kind) {
    case "trace": return "#8b5cf6";
    case "regression": return "#ef4444";
    case "design": return "#14b8a6";
    case "verify": return "#10b981";
    default: return dark ? "#52525b" : "#cbd5e1";
  }
}

function linkDash(kind: ApiEdge["kind"]): number[] | null {
  switch (kind) {
    case "trace": return [5, 4];
    case "regression": return [2, 3];
    case "design": return [4, 3];
    default: return null;
  }
}

// Circle radius scales with connection count, matching Obsidian's
// bigger-hub-nodes look.
function nodeRadius(degree: number): number {
  return Math.max(4, Math.min(14, 3 + degree * 1.2));
}

// react-force-graph has no MiniMap (unlike React Flow in the Flowchart view),
// so this panel draws its own: an overlay canvas with every node as a dot plus
// the current viewport as a rectangle; clicking it pans the graph there.
const MINIMAP_W = 180;
const MINIMAP_H = 132;
const MINIMAP_PAD = 10;

type ClusterNodeData = {
  label: string;
  ntype: TraceNodeType;
  phase?: number | null;
  phaseStatus?: string | null;
  scenarioCount?: number | null;
  verified?: boolean | null;
  flags: Record<string, boolean>;
  degree: number;
};

type ClusterLinkData = { kind: ApiEdge["kind"] };

type GNode = NodeObject<ClusterNodeData>;
type GLink = LinkObject<ClusterNodeData, ClusterLinkData>;

export function TraceabilityClusterPanel() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const router = useRouter();
  const [epicFilter, setEpicFilter] = useState<string>("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useTraceabilityGraph(showScenarios);
  const saveLayout = useSaveTraceLayout();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<ClusterNodeData, ClusterLinkData>>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const epics = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.type === "epic").map((n) => ({ id: n.id, label: n.label })),
    [data],
  );

  const graphData = useMemo(() => {
    if (!data) return null;

    const allowedStories = new Set<string>();
    if (epicFilter !== "all") {
      for (const e of data.edges) {
        if (e.kind === "derive" && e.source === epicFilter && e.target.startsWith("story:")) {
          allowedStories.add(e.target.slice("story:".length));
        }
      }
    }
    const flaggedStoryIds = new Set(
      data.nodes.filter((n) => n.type === "story" && (n.flags?.trace || n.flags?.bug)).map((n) => n.id.slice("story:".length)),
    );
    function nodeVisible(n: ApiNode): boolean {
      if (n.id === "project" || n.type === "design") return true;
      if (n.type === "epic") return epicFilter === "all" || n.id === epicFilter;
      const sid = n.id.includes(":") ? n.id.split(":")[1] : "";
      if (epicFilter !== "all" && !allowedStories.has(sid)) return false;
      if (flaggedOnly && !flaggedStoryIds.has(sid)) return false;
      return true;
    }

    const visible = data.nodes.filter(nodeVisible);
    const visibleIds = new Set(visible.map((n) => n.id));
    const links = data.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

    const degree = new Map<string, number>();
    for (const e of links) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const nodes: GNode[] = visible.map((n) => {
      const node: GNode = {
        id: n.id,
        label: n.label,
        ntype: n.type,
        phase: n.phase,
        phaseStatus: n.phase_status,
        scenarioCount: n.scenario_count,
        verified: n.verified,
        flags: n.flags ?? {},
        degree: degree.get(n.id) ?? 0,
      };
      // Saved manual layout: seed + pin (fx/fy) so it renders fixed instead
      // of re-entering the simulation; unpositioned nodes float freely.
      if (n.position) {
        node.x = n.position.x;
        node.y = n.position.y;
        node.fx = n.position.x;
        node.fy = n.position.y;
      }
      return node;
    });

    const glinks: GLink[] = links.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.kind }));

    return { nodes, links: glinks };
  }, [data, epicFilter, flaggedOnly]);

  const persist = useCallback(
    (nodes: GNode[]) => saveLayout.mutate(
      nodes.filter((n) => typeof n.x === "number" && typeof n.y === "number")
        .map((n) => ({ id: String(n.id), x: n.x as number, y: n.y as number })),
    ),
    [saveLayout],
  );

  const onNodeClick = useCallback((node: GNode) => {
    const phase = node.phase;
    if (phase && phase >= 1 && phase <= 6) router.push(`/phase${phase}`);
  }, [router]);

  const onNodeDragEnd = useCallback((node: GNode) => {
    // Pin where dropped (matches the Flowchart view's drag-to-reposition
    // semantics) and persist, debounced.
    node.fx = node.x;
    node.fy = node.y;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (graphData) persist(graphData.nodes);
    }, 1000);
  }, [graphData, persist]);

  const handleRelayout = useCallback(() => {
    if (!graphData) return;
    for (const n of graphData.nodes) { n.fx = undefined; n.fy = undefined; }
    fgRef.current?.d3ReheatSimulation();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(graphData.nodes), 1500);
  }, [graphData, persist]);

  const minimapRef = useRef<HTMLCanvasElement>(null);
  // Graph→minimap transform of the last draw, kept for click mapping.
  const minimapView = useRef<{ s: number; ox: number; oy: number } | null>(null);

  const drawMinimap = useCallback(() => {
    const canvas = minimapRef.current;
    const fg = fgRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !fg || !ctx || !graphData) return;

    const placed = graphData.nodes.filter((n) => typeof n.x === "number" && typeof n.y === "number");
    if (placed.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of placed) {
      if (n.x! < minX) minX = n.x!;
      if (n.x! > maxX) maxX = n.x!;
      if (n.y! < minY) minY = n.y!;
      if (n.y! > maxY) maxY = n.y!;
    }
    const s = Math.min(
      (MINIMAP_W - MINIMAP_PAD * 2) / Math.max(1, maxX - minX),
      (MINIMAP_H - MINIMAP_PAD * 2) / Math.max(1, maxY - minY),
    );
    const ox = (MINIMAP_W - (maxX - minX) * s) / 2 - minX * s;
    const oy = (MINIMAP_H - (maxY - minY) * s) / 2 - minY * s;
    minimapView.current = { s, ox, oy };

    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
    for (const n of placed) {
      ctx.beginPath();
      ctx.arc(n.x! * s + ox, n.y! * s + oy, 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = TYPE_COLOR[n.ntype as TraceNodeType] ?? "#8b5cf6";
      ctx.fill();
    }

    const tl = fg.screen2GraphCoords(0, 0);
    const br = fg.screen2GraphCoords(size.width, size.height);
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x * s + ox, tl.y * s + oy, (br.x - tl.x) * s, (br.y - tl.y) * s);
  }, [graphData, size]);

  // Ticks stop once the simulation cools, so filter/theme changes need an
  // explicit redraw too.
  useEffect(() => {
    drawMinimap();
  }, [drawMinimap, dark]);

  const onMinimapClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const view = minimapView.current;
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!view || !rect) return;
    fgRef.current?.centerAt(
      (e.clientX - rect.left - view.ox) / view.s,
      (e.clientY - rect.top - view.oy) / view.s,
      400,
    );
  }, []);

  const handleExport = useCallback(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "traceability.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }, []);

  const drawNode = useCallback((node: GNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const accent = TYPE_COLOR[node.ntype as TraceNodeType] ?? "#8b5cf6";
    const flags = node.flags ?? {};
    const ring = flags.trace ? "#8b5cf6" : flags.bug ? "#ef4444" : null;
    const r = nodeRadius(node.degree ?? 0);

    if (ring) {
      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = accent;
    ctx.fill();

    // Labels fade in on zoom-in so a dense graph doesn't become label soup
    // at the initial fit-to-view zoom level.
    if (globalScale < 1.4) return;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = dark ? "#d4d4d8" : "#334155";
    ctx.fillText(node.label ?? "", x, y + r + 2);

    if (node.phaseStatus) {
      ctx.font = `${fontSize * 0.85}px sans-serif`;
      ctx.fillStyle = STATUS_TINT[node.phaseStatus] ?? "#9ca3af";
      ctx.fillText(node.phaseStatus, x, y + r + 2 + fontSize * 1.2);
    }
  }, [dark]);

  // Paints the same circle into react-force-graph's hidden hit-test canvas
  // so clicks/drags register correctly for the custom-drawn node above.
  const paintNodePointerArea = useCallback((node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
    const r = nodeRadius(node.degree ?? 0);
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";
  const hasGraph = (data?.nodes.length ?? 0) > 1;

  return (
    <section className="flex h-[calc(100vh-58px)] min-w-0 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Traceability</p>
        <h1 className={cn("text-2xl font-bold tracking-tight", dark ? "text-white" : "text-slate-900")}>Living Graph</h1>
        <p className={cn("mt-1.5 text-sm", mutedClass)}>
          The whole project as one derivation graph — epic → story → Gherkin → design → tasks → tests → deploy.
          Violet dashed = backward-trace, red dashed = regression loop-back. Click any node to jump to its phase.
        </p>
      </div>

      {!context && <SignInRequired unlocks="the living traceability graph" />}

      {context && isLoading && (
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <Loader2 className="size-4 animate-spin" /> Building the graph…
        </div>
      )}

      {context && error ? (
        <p className="text-sm text-red-400">Failed to load the traceability graph.</p>
      ) : null}

      {context && !isLoading && !error && !hasGraph ? (
        <p className={cn("text-sm", mutedClass)}>No stories yet — push stories in Phase 1 to populate the graph.</p>
      ) : null}

      {context && hasGraph ? (
        <>
          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <select
              aria-label="Filter by epic"
              value={epicFilter}
              onChange={(e) => setEpicFilter(e.target.value)}
              className={cn(
                "h-8 rounded-md border px-2 text-sm outline-none focus:border-violet-500",
                dark ? "border-neutral-700 bg-neutral-950 text-neutral-200" : "border-slate-300 bg-white text-slate-900",
              )}
            >
              <option value="all">All epics</option>
              {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.label}</option>)}
            </select>
            <label className={cn("flex items-center gap-1.5 text-sm", dark ? "text-neutral-300" : "text-slate-600")}>
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="accent-violet-500" />
              Flagged stories only
            </label>
            <label className={cn("flex items-center gap-1.5 text-sm", dark ? "text-neutral-300" : "text-slate-600")}>
              <input type="checkbox" checked={showScenarios} onChange={(e) => setShowScenarios(e.target.checked)} className="accent-violet-500" />
              Show scenarios
            </label>
            <button
              onClick={handleRelayout}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-slate-300 text-slate-600 hover:bg-slate-100",
              )}
            >
              <LayoutDashboard className="size-3.5" /> Re-layout
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-slate-300 text-slate-600 hover:bg-slate-100",
              )}
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Refresh
            </button>
            <button
              onClick={handleExport}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-slate-300 text-slate-600 hover:bg-slate-100",
              )}
            >
              <Download className="size-3.5" /> Export PNG
            </button>
            <span className={cn("text-xs sm:ml-auto", mutedClass)}>
              {graphData?.nodes.length ?? 0} nodes · {graphData?.links.length ?? 0} edges
            </span>
          </div>
          <div
            ref={containerRef}
            className={cn("relative min-h-0 flex-1 overflow-hidden rounded-lg border", dark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-white")}
          >
            {graphData && size.width > 0 ? (
              <>
                <ForceGraph2D<ClusterNodeData, ClusterLinkData>
                  ref={fgRef}
                  graphData={graphData}
                  width={size.width}
                  height={size.height}
                  backgroundColor={dark ? "#0a0a0a" : "#ffffff"}
                  nodeCanvasObject={drawNode}
                  nodeCanvasObjectMode={() => "replace"}
                  nodePointerAreaPaint={paintNodePointerArea}
                  linkColor={(l) => linkColor((l as GLink).kind, dark)}
                  linkLineDash={(l) => linkDash((l as GLink).kind)}
                  linkWidth={1.25}
                  linkDirectionalArrowLength={0}
                  onNodeClick={onNodeClick}
                  onNodeDragEnd={onNodeDragEnd}
                  onEngineTick={drawMinimap}
                  onZoom={drawMinimap}
                  cooldownTicks={200}
                  minZoom={0.3}
                  maxZoom={8}
                />
                <canvas
                  ref={minimapRef}
                  width={MINIMAP_W}
                  height={MINIMAP_H}
                  onClick={onMinimapClick}
                  aria-label="Graph minimap"
                  className={cn(
                    "absolute bottom-3 right-3 z-10 cursor-pointer rounded-md border",
                    dark ? "border-neutral-700 bg-neutral-900/85" : "border-slate-300 bg-white/90",
                  )}
                />
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
