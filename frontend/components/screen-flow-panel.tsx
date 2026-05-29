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
import { ChevronRight, LayoutDashboard, Loader2, Monitor, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGenerateScreenFlow, useLoadScreenFlow, useSaveScreenFlowPositions } from "@/lib/hooks/use-phase2";
import type { ScreenFlowEdge, ScreenFlowNode, ScreenFlowResponse } from "@/lib/api/types";

import "@xyflow/react/dist/style.css";

// ---------------------------------------------------------------------------
// Dagre layout
// ---------------------------------------------------------------------------

function applyDagreLayout(nodes: ScreenFlowNode[], edges: ScreenFlowEdge[]): ScreenFlowNode[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 150 });
  for (const node of nodes) g.setNode(node.id, { width: 160, height: 64 });
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  Dagre.layout(g);
  return nodes.map((node) => {
    const { x, y } = g.node(node.id);
    return { ...node, position: { x: x - 80, y: y - 32 } };
  });
}

function toDagreNodes(diagram: ScreenFlowResponse): ScreenFlowNode[] {
  const hasLayout = diagram.nodes.some((n) => n.position.x !== 0 || n.position.y !== 0);
  if (hasLayout) return diagram.nodes;
  return applyDagreLayout(diagram.nodes, diagram.edges);
}

// ---------------------------------------------------------------------------
// Custom screen node
// ---------------------------------------------------------------------------

function ScreenNode({ data }: { data: { label: string; description: string } }) {
  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-sm bg-white dark:bg-neutral-900 min-w-[140px] text-center overflow-hidden">
      <Handle type="target" position={Position.Left} className="!bg-indigo-500 !w-2 !h-2" />
      <div className="bg-indigo-600 text-white font-semibold px-3 py-2 text-xs tracking-wide">
        {data.label}
      </div>
      {data.description && (
        <div className="px-3 py-1.5 text-[10px] text-slate-400 dark:text-neutral-500 font-mono">
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-indigo-500 !w-2 !h-2" />
    </div>
  );
}

const NODE_TYPES = { screen: ScreenNode };

// ---------------------------------------------------------------------------
// Screen Flow Panel
// ---------------------------------------------------------------------------

export function ScreenFlowPanel({
  uxBriefContent,
  dark,
}: {
  uxBriefContent: string;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<ScreenFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ScreenFlowEdge>([]);
  const savePosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQuery = useLoadScreenFlow();
  const generateMut = useGenerateScreenFlow();
  const savePosMut = useSaveScreenFlowPositions();

  const hasDiagram = nodes.length > 0;
  const canGenerate = uxBriefContent.trim().length > 0;

  useEffect(() => {
    if (loadQuery.data && loadQuery.data.nodes.length > 0) {
      setNodes(toDagreNodes(loadQuery.data) as ScreenFlowNode[]);
      setEdges(loadQuery.data.edges as ScreenFlowEdge[]);
    }
  }, [loadQuery.data, setNodes, setEdges]);

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    generateMut.mutate(uxBriefContent, {
      onSuccess: (data) => {
        setNodes(toDagreNodes(data) as ScreenFlowNode[]);
        setEdges(data.edges as ScreenFlowEdge[]);
        setOpen(true);
      },
    });
  }, [canGenerate, uxBriefContent, generateMut, setNodes, setEdges]);

  const handleReLayout = useCallback(() => {
    const layouted = applyDagreLayout(nodes as ScreenFlowNode[], edges as ScreenFlowEdge[]);
    setNodes(layouted as ScreenFlowNode[]);
    savePosMut.mutate(layouted.map((n) => ({ id: n.id, position: n.position })) as ScreenFlowNode[]);
  }, [nodes, edges, setNodes, savePosMut]);

  const handleDragStop = useCallback(
    (_: unknown, __: unknown, allNodes: ScreenFlowNode[]) => {
      if (savePosTimer.current) clearTimeout(savePosTimer.current);
      savePosTimer.current = setTimeout(() => {
        savePosMut.mutate(allNodes.map((n) => ({ id: n.id, position: n.position })) as ScreenFlowNode[]);
      }, 1000);
    },
    [savePosMut],
  );

  const edgesWithStyle = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: "smoothstep",
        style: { stroke: dark ? "#4f46e5" : "#6366f1", strokeWidth: 1.5 },
        labelStyle: { fill: dark ? "#d4d4d4" : "#374151", fontSize: 10 },
        labelBgStyle: { fill: dark ? "#171717" : "#f8fafc", fillOpacity: 0.85 },
        markerEnd: { type: "arrowclosed" as const, color: dark ? "#4f46e5" : "#6366f1" },
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
          <Monitor className="size-4 text-indigo-500" />
          <span className={dark ? "text-neutral-100" : "text-slate-800"}>Screen Flow</span>
          {hasDiagram && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {nodes.length} {nodes.length === 1 ? "screen" : "screens"}
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
              {generateMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
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
        <div className={cn("border-t px-4 py-4", dark ? "border-neutral-700" : "border-slate-200")}>
          {!hasDiagram ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Monitor className={cn("size-8", dark ? "text-neutral-600" : "text-slate-300")} />
              <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
                {canGenerate
                  ? "Generate a screen navigation flow from the UX Brief above."
                  : "Generate the UX Brief section first."}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateMut.isPending || !canGenerate}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
                  canGenerate && !generateMut.isPending
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-indigo-300 cursor-not-allowed dark:bg-indigo-900",
                )}
              >
                {generateMut.isPending ? (
                  <><Loader2 className="size-4 animate-spin" />Generating…</>
                ) : (
                  <><Monitor className="size-4" />Generate Screen Flow</>
                )}
              </button>
            </div>
          ) : (
            <div
              className={cn("rounded-lg border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}
              style={{ resize: "vertical", overflow: "hidden", minHeight: 280, height: 420 }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edgesWithStyle}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleDragStop}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                colorMode={dark ? "dark" : "light"}
                style={{ height: "100%" }}
              >
                <Background color={dark ? "#404040" : "#e0e7ff"} gap={16} />
                <Controls />
                <MiniMap
                  nodeColor={() => "#4f46e5"}
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
