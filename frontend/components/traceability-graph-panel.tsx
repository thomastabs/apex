"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import { AlertTriangle, GitFork, Loader2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiContext } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { SignInRequired } from "@/components/sign-in-required";
import { useTraceabilityGraph } from "@/lib/hooks/use-workspace";
import type { TraceNode as ApiNode, TraceEdge as ApiEdge, TraceNodeType } from "@/lib/api/workspace";

import "@xyflow/react/dist/style.css";

type NodeData = {
  label: string;
  ntype: TraceNodeType;
  phase?: number | null;
  phaseStatus?: string | null;
  scenarioCount?: number | null;
  verified?: boolean | null;
  flags: Record<string, boolean>;
  dark: boolean;
};

// Type → accent colour (header strip + minimap).
const TYPE_COLOR: Record<TraceNodeType, string> = {
  project: "#0ea5e9",
  epic: "#8b5cf6",
  design: "#14b8a6",
  story: "#6366f1",
  gherkin: "#a855f7",
  scenario: "#c084fc",
  tasks: "#f59e0b",
  tests: "#10b981",
  deploy: "#ef4444",
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

function applyDagre(nodes: Node<NodeData>[], edges: Edge[]): Node<NodeData>[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 110 });
  for (const n of nodes) g.setNode(n.id, { width: 168, height: 56 });
  for (const e of edges) g.setEdge(e.source, e.target);
  Dagre.layout(g);
  return nodes.map((n) => {
    const { x, y, width, height } = g.node(n.id);
    return { ...n, position: { x: x - width / 2, y: y - height / 2 } };
  });
}

function TraceFlowNode({ data }: { data: NodeData }) {
  const accent = TYPE_COLOR[data.ntype];
  const conflict = data.flags.conflict;
  const trace = data.flags.trace;
  return (
    <div
      className={cn(
        "w-[168px] overflow-hidden rounded-md border shadow-sm",
        data.dark ? "bg-neutral-900 text-neutral-200" : "bg-white text-slate-700",
        conflict ? "border-amber-500" : trace ? "border-violet-500" : data.dark ? "border-neutral-700" : "border-slate-200",
      )}
      style={conflict || trace ? { borderWidth: 2 } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2" style={{ background: accent }} />
      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white" style={{ background: accent }}>
        <span>{data.ntype}</span>
        <span className="flex items-center gap-1">
          {conflict ? <GitFork className="size-3" /> : null}
          {trace ? <Undo2 className="size-3" /> : null}
          {data.flags.bug ? <AlertTriangle className="size-3" /> : null}
        </span>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium" title={data.label}>{data.label}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
          {data.phaseStatus ? (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ background: STATUS_TINT[data.phaseStatus] ?? "#9ca3af" }} />
              {data.phaseStatus}
            </span>
          ) : null}
          {typeof data.scenarioCount === "number" && data.scenarioCount > 0 ? (
            <span className={data.dark ? "text-neutral-500" : "text-slate-400"}>{data.scenarioCount} scenarios</span>
          ) : null}
          {data.ntype === "scenario" ? (
            data.verified ? (
              <span className="text-emerald-500">✓ verified</span>
            ) : data.flags.gap ? (
              <span className="text-red-500">✗ gap</span>
            ) : (
              <span className={data.dark ? "text-neutral-500" : "text-slate-400"}>untested</span>
            )
          ) : null}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2" style={{ background: accent }} />
    </div>
  );
}

const NODE_TYPES = { trace: TraceFlowNode };

function edgeStyle(kind: ApiEdge["kind"], dark: boolean) {
  switch (kind) {
    case "conflict":
      return { animated: false, style: { stroke: "#f59e0b", strokeWidth: 1.5 } };
    case "trace":
      return { animated: true, style: { stroke: "#8b5cf6", strokeWidth: 1.5, strokeDasharray: "5 4" } };
    case "design":
      return { animated: false, style: { stroke: "#14b8a6", strokeWidth: 1.25, strokeDasharray: "4 3" } };
    case "verify":
      return { animated: false, style: { stroke: "#10b981", strokeWidth: 1.25 } };
    default:
      return { animated: false, style: { stroke: dark ? "#52525b" : "#cbd5e1", strokeWidth: 1.25 } };
  }
}

export function TraceabilityGraphPanel() {
  const dark = useUiStore((s) => s.theme) === "dark";
  const context = useApiContext();
  const router = useRouter();
  const [epicFilter, setEpicFilter] = useState<string>("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { data, isLoading, error } = useTraceabilityGraph(showScenarios);

  const epics = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.type === "epic").map((n) => ({ id: n.id, label: n.label })),
    [data],
  );

  useEffect(() => {
    if (!data) return;

    // Which story ids belong to the selected epic (epic filter cascades to a
    // story's whole artifact subtree).
    const allowedStories = new Set<string>();
    if (epicFilter !== "all") {
      for (const e of data.edges) {
        if (e.kind === "derive" && e.source === epicFilter && e.target.startsWith("story:")) {
          allowedStories.add(e.target.slice("story:".length));
        }
      }
    }

    const flaggedStoryIds = new Set(
      data.nodes.filter((n) => n.type === "story" && (n.flags?.conflict || n.flags?.trace)).map((n) => n.id.slice("story:".length)),
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

    const rfNodes: Node<NodeData>[] = visible.map((n) => ({
      id: n.id,
      type: "trace",
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        ntype: n.type,
        phase: n.phase,
        phaseStatus: n.phase_status,
        scenarioCount: n.scenario_count,
        verified: n.verified,
        flags: n.flags ?? {},
        dark,
      },
    }));
    const rfEdges: Edge[] = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target, ...edgeStyle(e.kind, dark) }));

    setNodes(applyDagre(rfNodes, rfEdges));
    setEdges(rfEdges);
  }, [data, epicFilter, flaggedOnly, dark, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node<NodeData>) => {
      const phase = node.data.phase;
      if (phase && phase >= 1 && phase <= 6) router.push(`/phase${phase}`);
    },
    [router],
  );

  const mutedClass = dark ? "text-neutral-500" : "text-slate-400";
  const hasGraph = (data?.nodes.length ?? 0) > 1;

  return (
    <section className="flex h-[calc(100vh-58px)] flex-col px-8 py-6">
      <div className="mb-4">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-500">Traceability</p>
        <h1 className={cn("text-4xl font-black tracking-tight", dark ? "text-white" : "text-slate-900")}>Living Graph</h1>
        <p className={cn("mt-1.5 text-sm", mutedClass)}>
          The whole project as one derivation graph — epic → story → Gherkin → design → tasks → tests → deploy.
          Amber = design conflict, violet dashed = backward-trace. Click any node to jump to its phase.
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
          <div className="mb-3 flex flex-wrap items-center gap-3">
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
            <span className={cn("ml-auto text-xs", mutedClass)}>{nodes.length} nodes · {edges.length} edges</span>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-hidden rounded-lg border", dark ? "border-neutral-800" : "border-slate-200")}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={NODE_TYPES}
              fitView
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
            >
              <Background color={dark ? "#262626" : "#e5e7eb"} gap={18} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => TYPE_COLOR[(n.data as NodeData)?.ntype] ?? "#8b5cf6"}
                maskColor={dark ? "rgba(0,0,0,0.6)" : "rgba(241,245,249,0.7)"}
              />
            </ReactFlow>
          </div>
        </>
      ) : null}
    </section>
  );
}
