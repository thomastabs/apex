"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import { CheckCircle2, ChevronRight, GitBranch, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Phase3Task } from "@/lib/api/types";
import { EFFORT_COLORS } from "@/lib/effort-colors";

import "@xyflow/react/dist/style.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskNodeData = {
  label: string;
  taskNum: number;
  effort?: string;
  hasPack: boolean;
};

type TaskFlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: TaskNodeData;
};

type TaskFlowEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  markerEnd?: { type: MarkerType };
};

// ---------------------------------------------------------------------------
// Dagre layout
// ---------------------------------------------------------------------------

function applyDagreLayout(nodes: TaskFlowNode[], edges: TaskFlowEdge[]): TaskFlowNode[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });
  for (const node of nodes) g.setNode(node.id, { width: 200, height: 72 });
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  Dagre.layout(g);
  return nodes.map((node) => {
    const { x, y, width, height } = g.node(node.id);
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
}

// ---------------------------------------------------------------------------
// Custom task node
// ---------------------------------------------------------------------------

function TaskNode({ data }: { data: TaskNodeData }) {
  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800/60 shadow-sm w-[200px] text-xs bg-white dark:bg-neutral-900 overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-2 !h-2" />
      <div className="bg-violet-600 text-white font-semibold px-3 py-1.5 text-xs tracking-wide flex items-center gap-1.5">
        <span className="opacity-70">#{data.taskNum}</span>
        <span className="truncate">{data.label}</span>
      </div>
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        {data.effort ? (
          <span className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ring-1",
            EFFORT_COLORS[data.effort] ?? "bg-neutral-500/15 text-neutral-400 ring-neutral-500/30",
          )}>
            {data.effort}
          </span>
        ) : <span />}
        {data.hasPack && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !w-2 !h-2" />
    </div>
  );
}

const NODE_TYPES = { task: TaskNode };

// ---------------------------------------------------------------------------
// Build ReactFlow nodes + edges from Phase3Task list
// ---------------------------------------------------------------------------

function buildGraph(
  taskList: Phase3Task[],
  packDrafts: Record<number, string>,
): { nodes: TaskFlowNode[]; edges: TaskFlowEdge[] } {
  const nodes: TaskFlowNode[] = taskList.map((t, i) => ({
    id: String(t.id),
    type: "task",
    position: { x: 0, y: 0 },
    data: {
      label: t.subject,
      taskNum: i + 1,
      effort: t.effort_estimate,
      hasPack: Boolean(packDrafts[t.id]),
    },
  }));

  const edges: TaskFlowEdge[] = taskList.flatMap((t) =>
    (t.predecessor_task_ids ?? []).map((predId) => ({
      id: `${predId}-${t.id}`,
      source: String(predId),
      target: String(t.id),
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  );

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// TaskDagPanel
// ---------------------------------------------------------------------------

export function TaskDagPanel({
  taskList,
  packDrafts,
  dark,
}: {
  taskList: Phase3Task[];
  packDrafts: Record<number, string>;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TaskFlowEdge>([]);

  const hasEdges = edges.length > 0;

  // Rebuild graph whenever taskList or packDrafts change
  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(taskList, packDrafts);
    const layouted = applyDagreLayout(n, e);
    setNodes(layouted as TaskFlowNode[]);
    setEdges(e as TaskFlowEdge[]);
  }, [taskList, packDrafts, setNodes, setEdges]);

  const handleReLayout = useCallback(() => {
    const layouted = applyDagreLayout(nodes as TaskFlowNode[], edges as TaskFlowEdge[]);
    setNodes(layouted as TaskFlowNode[]);
  }, [nodes, edges, setNodes]);

  const edgesWithStyle = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        style: { stroke: dark ? "#7c3aed" : "#8b5cf6", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: dark ? "#7c3aed" : "#8b5cf6" },
      })),
    [edges, dark],
  );

  return (
    <div className={cn(
      "rounded-lg border mt-2",
      dark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-slate-50",
    )}>
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-violet-500" />
          <span className={dark ? "text-neutral-100" : "text-slate-800"}>Task Dependency Graph</span>
          {hasEdges && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              {edges.length} {edges.length === 1 ? "dependency" : "dependencies"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <ChevronRight className={cn(
            "size-4 transition-transform",
            dark ? "text-neutral-400" : "text-slate-400",
            open && "rotate-90",
          )} />
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className={cn("border-t px-4 py-4", dark ? "border-neutral-700" : "border-slate-200")}>
          {!hasEdges ? (
            <div className="flex flex-col items-center gap-2 py-5 text-center">
              <GitBranch className={cn("size-7", dark ? "text-neutral-600" : "text-slate-300")} />
              <p className={cn("text-sm", dark ? "text-neutral-400" : "text-slate-500")}>
                No dependencies defined. Edit tasks and check &ldquo;Depends on&rdquo; to add them.
              </p>
            </div>
          ) : (
            <div
              className={cn("rounded-lg border overflow-hidden", dark ? "border-neutral-700" : "border-slate-200")}
              style={{ height: 320 }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edgesWithStyle}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                colorMode={dark ? "dark" : "light"}
                style={{ height: "100%" }}
              >
                <Background color={dark ? "#404040" : "#e2e8f0"} gap={16} />
                <Controls />
              </ReactFlow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
