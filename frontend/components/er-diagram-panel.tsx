"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import { ChevronRight, LayoutDashboard, Loader2, Network, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import { useGenerateDiagram, useLoadDiagram, useSaveDiagramPositions } from "@/lib/hooks/use-phase2";
import type { DiagramEdge, DiagramField, DiagramNode, DiagramResponse } from "@/lib/api/types";

import "@xyflow/react/dist/style.css";

const DIAGRAM_STEPS = [
  "Parsing the data model…",
  "Detecting entities & fields…",
  "Resolving relationships…",
  "Laying out the diagram…",
];

// ---------------------------------------------------------------------------
// Dagre auto-layout
// ---------------------------------------------------------------------------

function applyDagreLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramNode[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

  for (const node of nodes) {
    const fieldHeight = (node.data.fields?.length ?? 0) * 22 + 44;
    g.setNode(node.id, { width: 180, height: fieldHeight });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  Dagre.layout(g);

  return nodes.map((node) => {
    const { x, y, width, height } = g.node(node.id);
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
}

// ---------------------------------------------------------------------------
// Custom entity node
// ---------------------------------------------------------------------------

function EntityNode({ data }: { data: { label: string; fields: DiagramField[] } }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-neutral-700 shadow-sm min-w-[170px] text-xs bg-white dark:bg-neutral-900 overflow-hidden">
      <Handle type="target" position={Position.Left} className="!bg-violet-500 !w-2 !h-2" />
      <div className="bg-violet-600 text-white font-semibold px-3 py-1.5 text-xs tracking-wide">
        {data.label}
      </div>
      <div className="px-3 py-2 font-mono space-y-1">
        {data.fields.map((f) => (
          <div key={f.name} className="flex items-center justify-between gap-3">
            <span
              className={cn(
                "truncate",
                f.pk ? "text-amber-500 dark:text-amber-400 font-bold" :
                f.fk ? "text-blue-500 dark:text-blue-400" :
                "text-slate-600 dark:text-neutral-300",
              )}
            >
              {f.name}
            </span>
            <span className="text-slate-400 dark:text-neutral-500 shrink-0">{f.type}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-violet-500 !w-2 !h-2" />
    </div>
  );
}

const NODE_TYPES = { entity: EntityNode };

// ---------------------------------------------------------------------------
// Convert DiagramResponse to ReactFlow nodes/edges with dagre layout
// ---------------------------------------------------------------------------

function toDagreNodes(diagram: DiagramResponse): DiagramNode[] {
  // If nodes already have non-zero positions (user-saved layout), skip dagre
  const hasLayout = diagram.nodes.some((n) => n.position.x !== 0 || n.position.y !== 0);
  if (hasLayout) return diagram.nodes;
  return applyDagreLayout(diagram.nodes, diagram.edges);
}

// ---------------------------------------------------------------------------
// ER Diagram Panel
// ---------------------------------------------------------------------------

export function ERDiagramPanel({
  dataModelContent,
  dark,
}: {
  dataModelContent: string;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>([]);
  const savePosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQuery = useLoadDiagram();
  const generateMut = useGenerateDiagram();
  const savePosMut = useSaveDiagramPositions();

  const hasDiagram = nodes.length > 0;
  const canGenerate = dataModelContent.trim().length > 0;

  // Populate canvas when query loads existing diagram
  useEffect(() => {
    if (loadQuery.data && loadQuery.data.nodes.length > 0) {
      setNodes(toDagreNodes(loadQuery.data) as DiagramNode[]);
      setEdges(loadQuery.data.edges as DiagramEdge[]);
    }
  }, [loadQuery.data, setNodes, setEdges]);

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    generateMut.mutate(dataModelContent, {
      onSuccess: (data) => {
        const layouted = toDagreNodes(data);
        setNodes(layouted as DiagramNode[]);
        setEdges(data.edges as DiagramEdge[]);
        setOpen(true);
        toast.success("ER diagram generated.");
      },
    });
  }, [canGenerate, dataModelContent, generateMut, setNodes, setEdges]);

  const handleReLayout = useCallback(() => {
    const layouted = applyDagreLayout(nodes as DiagramNode[], edges as DiagramEdge[]);
    setNodes(layouted as DiagramNode[]);
    savePosMut.mutate(layouted.map((n) => ({ id: n.id, position: n.position })) as DiagramNode[], {
      onError: () => toast.error("Failed to save diagram layout."),
    });
  }, [nodes, edges, setNodes, savePosMut]);

  const handleDragStop = useCallback(
    (_: unknown, __: unknown, allNodes: DiagramNode[]) => {
      if (savePosTimer.current) clearTimeout(savePosTimer.current);
      savePosTimer.current = setTimeout(() => {
        savePosMut.mutate(allNodes.map((n) => ({ id: n.id, position: n.position })) as DiagramNode[], {
          onError: () => toast.error("Failed to save diagram positions."),
        });
      }, 1000);
    },
    [savePosMut],
  );

  const edgesWithStyle = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        style: { stroke: dark ? "#7c3aed" : "#8b5cf6", strokeWidth: 1.5 },
        labelStyle: { fill: dark ? "#d4d4d4" : "#374151", fontSize: 10 },
        labelBgStyle: { fill: dark ? "#171717" : "#f8fafc", fillOpacity: 0.8 },
      })),
    [edges, dark],
  );

  return (
    <div
      className={cn(
        "rounded-lg border mt-2",
        dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
      )}
    >
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Network className="size-4 text-violet-500" />
          <span className={dark ? "text-neutral-100" : "text-slate-800"}>ER Diagram</span>
          {hasDiagram && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              {nodes.length} {nodes.length === 1 ? "entity" : "entities"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDiagram && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleReLayout(); }}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                dark
                  ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200",
              )}
            >
              <LayoutDashboard className="size-3" />
              Auto-layout
            </button>
          )}
          {hasDiagram && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
              disabled={generateMut.isPending || !canGenerate}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                dark
                  ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200",
                (generateMut.isPending || !canGenerate) && "opacity-50 cursor-not-allowed",
              )}
            >
              {generateMut.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Regenerate
            </button>
          )}
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              dark ? "text-neutral-400" : "text-slate-400",
              open && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Body */}
      {open && (
        <div
          className={cn(
            "border-t px-4 py-4",
            dark ? "border-neutral-700" : "border-slate-200",
          )}
        >
          {generateMut.isPending && !hasDiagram ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="size-8 animate-spin text-violet-500" />
              <p className={cn("text-sm font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
                Generating ER diagram…
              </p>
              <div className="w-full max-w-md">
                <AIProgressIndicator steps={DIAGRAM_STEPS} isPending={generateMut.isPending} dark={dark} />
              </div>
              <CancelButton onCancel={() => generateMut.cancel()} />
            </div>
          ) : !hasDiagram ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Network className={cn("size-8", dark ? "text-neutral-600" : "text-slate-300")} />
              <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
                {canGenerate
                  ? "Generate a visual ER diagram from the Data Model above."
                  : "Generate the Data Model section first."}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateMut.isPending || !canGenerate}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
                  canGenerate && !generateMut.isPending
                    ? "bg-violet-600 hover:bg-violet-700"
                    : "bg-violet-300 cursor-not-allowed dark:bg-violet-900",
                )}
              >
                <Network className="size-4" />
                Generate Diagram
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-lg border overflow-hidden",
                dark ? "border-neutral-700" : "border-slate-200",
              )}
              style={{ resize: "vertical", overflow: "hidden", minHeight: 280, height: 440 }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edgesWithStyle}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleDragStop}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                colorMode={dark ? "dark" : "light"}
                style={{ height: "100%" }}
              >
                <Background color={dark ? "#404040" : "#e2e8f0"} gap={16} />
                <Controls />
                <MiniMap
                  nodeColor={() => "#7c3aed"}
                  maskColor={dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)"}
                />
              </ReactFlow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
