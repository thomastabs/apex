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
import { ChevronRight, Figma, LayoutDashboard, Loader2, Monitor, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AIProgressIndicator } from "@/components/ai-progress-indicator";
import { CancelButton } from "@/components/ui/cancel-button";
import { useBuildScreenFlowFromFigma, useGenerateScreenFlow, useLoadScreenFlow, useSaveScreenFlowPositions } from "@/lib/hooks/use-phase2";
import { useFigmaContext } from "@/lib/stores/session-store";
import { figmaGetFile, deriveFramesAndFlows, figmaThumbnails } from "@/lib/api/figma";
import type { ScreenFlowEdge, ScreenFlowNode, ScreenFlowResponse } from "@/lib/api/types";

import "@xyflow/react/dist/style.css";

const SCREEN_FLOW_STEPS = [
  "Parsing the UX brief…",
  "Detecting screens…",
  "Mapping navigation paths…",
  "Laying out the flow…",
];

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

function ScreenNode({ data }: { data: { label: string; description: string; thumb?: string } }) {
  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 shadow-sm bg-white dark:bg-neutral-900 min-w-[140px] text-center overflow-hidden">
      <Handle type="target" position={Position.Left} className="!bg-violet-500 !w-2 !h-2" />
      <div className="bg-violet-600 text-white font-semibold px-3 py-2 text-xs tracking-wide">
        {data.label}
      </div>
      {data.thumb && (
        // Figma frame preview (short-lived URL; re-resolved on each build).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.thumb} alt={data.label} className="w-[140px] max-h-24 object-cover" />
      )}
      {data.description && (
        <div className="px-3 py-1.5 text-[10px] text-slate-400 dark:text-neutral-500 font-mono">
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-violet-500 !w-2 !h-2" />
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
  const figma = useFigmaContext();
  const buildFigmaMut = useBuildScreenFlowFromFigma();
  const [figmaLoading, setFigmaLoading] = useState(false);

  const hasDiagram = nodes.length > 0;
  const canGenerate = uxBriefContent.trim().length > 0;
  const figmaBusy = figmaLoading || buildFigmaMut.isPending;

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
        toast.success("Screen flow generated.");
      },
    });
  }, [canGenerate, uxBriefContent, generateMut, setNodes, setEdges]);

  const handleBuildFromFigma = useCallback(async () => {
    if (!figma) return;
    setFigmaLoading(true);
    try {
      const file = await figmaGetFile(figma.token, figma.fileKey, 2);
      const { frames, flows } = deriveFramesAndFlows(file);
      if (!frames.length) {
        toast.info("No top-level frames found in this Figma file.");
        return;
      }
      const diagram = await buildFigmaMut.mutateAsync({
        frames: frames.map((f) => ({ node_id: f.node_id, name: f.name, page: f.page })),
        flows,
      });
      // Re-resolve thumbnails (short-lived URLs) and overlay them on the nodes.
      const thumbs = await figmaThumbnails(figma.token, figma.fileKey, frames.map((f) => f.node_id)).catch(() => ({} as Record<string, string>));
      const withThumbs: ScreenFlowResponse = {
        ...diagram,
        nodes: diagram.nodes.map((n) => (thumbs[n.id] ? { ...n, data: { ...n.data, thumb: thumbs[n.id] } } : n)),
      };
      setNodes(toDagreNodes(withThumbs) as ScreenFlowNode[]);
      setEdges(withThumbs.edges as ScreenFlowEdge[]);
      setOpen(true);
      toast.success(`Screen flow built from ${frames.length} Figma screen${frames.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build screen flow from Figma.");
    } finally {
      setFigmaLoading(false);
    }
  }, [figma, buildFigmaMut, setNodes, setEdges]);

  const handleReLayout = useCallback(() => {
    const layouted = applyDagreLayout(nodes as ScreenFlowNode[], edges as ScreenFlowEdge[]);
    setNodes(layouted as ScreenFlowNode[]);
    savePosMut.mutate(layouted.map((n) => ({ id: n.id, position: n.position })) as ScreenFlowNode[], {
      onError: () => toast.error("Failed to save screen-flow layout."),
    });
  }, [nodes, edges, setNodes, savePosMut]);

  const handleDragStop = useCallback(
    (_: unknown, __: unknown, allNodes: ScreenFlowNode[]) => {
      if (savePosTimer.current) clearTimeout(savePosTimer.current);
      savePosTimer.current = setTimeout(() => {
        savePosMut.mutate(allNodes.map((n) => ({ id: n.id, position: n.position })) as ScreenFlowNode[], {
          onError: () => toast.error("Failed to save screen-flow positions."),
        });
      }, 1000);
    },
    [savePosMut],
  );

  const edgesWithStyle = useMemo(
    () =>
      edges.map((e) => {
        // Inferred cross-file links (project mode) render dashed + amber, labelled,
        // so they're not mistaken for real prototype flows.
        const crossFile = (e as ScreenFlowEdge).data?.kind === "cross_file";
        const color = crossFile ? "#d97706" : dark ? "#7c3aed" : "#8b5cf6";
        return {
          ...e,
          type: "smoothstep",
          animated: crossFile,
          label: crossFile ? "cross-file (inferred)" : e.label,
          style: { stroke: color, strokeWidth: 1.5, ...(crossFile ? { strokeDasharray: "5 5" } : {}) },
          labelStyle: { fill: crossFile ? "#d97706" : dark ? "#d4d4d4" : "#374151", fontSize: 10 },
          labelBgStyle: { fill: dark ? "#171717" : "#f8fafc", fillOpacity: 0.85 },
          markerEnd: { type: "arrowclosed" as const, color },
        };
      }),
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
          <Monitor className="size-4 text-violet-500" />
          <span className={dark ? "text-neutral-100" : "text-slate-800"}>Screen Flow</span>
          {hasDiagram && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
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
          {hasDiagram && figma && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void handleBuildFromFigma(); }}
              disabled={figmaBusy}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                dark
                  ? "text-violet-300 hover:text-violet-200 hover:bg-neutral-700"
                  : "text-violet-600 hover:text-violet-700 hover:bg-slate-200",
                figmaBusy && "opacity-50 cursor-not-allowed",
              )}
            >
              {figmaBusy ? <Loader2 className="size-3 animate-spin" /> : <Figma className="size-3" />}
              From Figma
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
          {generateMut.isPending && !hasDiagram ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="size-8 animate-spin text-violet-500" />
              <p className={cn("text-sm font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
                Generating screen flow…
              </p>
              <div className="w-full max-w-md">
                <AIProgressIndicator steps={SCREEN_FLOW_STEPS} isPending={generateMut.isPending} dark={dark} />
              </div>
              <CancelButton onCancel={() => generateMut.cancel()} />
            </div>
          ) : figmaBusy && !hasDiagram ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="size-8 animate-spin text-violet-500" />
              <p className={cn("text-sm font-medium", dark ? "text-neutral-300" : "text-slate-600")}>
                Building screen flow from Figma…
              </p>
            </div>
          ) : !hasDiagram ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Monitor className={cn("size-8", dark ? "text-neutral-600" : "text-slate-300")} />
              {figma ? (
                <>
                  <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
                    Build the screen flow from your linked Figma file&apos;s real frames and prototype flows.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleBuildFromFigma()}
                    disabled={figmaBusy}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
                      figmaBusy ? "bg-violet-300 cursor-not-allowed dark:bg-violet-900" : "bg-violet-600 hover:bg-violet-700",
                    )}
                  >
                    <Figma className="size-4" />Build from Figma
                  </button>
                  {canGenerate && (
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generateMut.isPending}
                      className={cn("text-xs underline-offset-2 hover:underline", dark ? "text-neutral-500" : "text-slate-500")}
                    >
                      or generate with AI from the UX Brief
                    </button>
                  )}
                </>
              ) : (
                <>
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
                        ? "bg-violet-600 hover:bg-violet-700"
                        : "bg-violet-300 cursor-not-allowed dark:bg-violet-900",
                    )}
                  >
                    <Monitor className="size-4" />Generate Screen Flow
                  </button>
                </>
              )}
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
                <Background color={dark ? "#404040" : "#ede9fe"} gap={16} />
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
