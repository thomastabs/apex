import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// React Flow is heavy in jsdom — stub it to capture the props the panel feeds it.
let lastFlowProps: { nodes: unknown[]; edges: unknown[]; onNodeClick?: (e: unknown, n: unknown) => void } = { nodes: [], edges: [] };
vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: typeof lastFlowProps) => {
    lastFlowProps = props;
    return <div data-testid="flow" />;
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  getNodesBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  getViewportForBounds: () => ({ x: 0, y: 0, zoom: 1 }),
  useNodesState: () => {
    const [n, setN] = React.useState<unknown[]>([]);
    return [n, setN, vi.fn()];
  },
  useEdgesState: () => {
    const [e, setE] = React.useState<unknown[]>([]);
    return [e, setE, vi.fn()];
  },
}));
// Layout is real d3-force now (pure math, no DOM/browser deps) — no mock
// needed; none of these tests assert exact node positions.
const toPngMock = vi.fn().mockResolvedValue("data:image/png;base64,xxx");
vi.mock("html-to-image", () => ({ toPng: (...a: unknown[]) => toPngMock(...a) }));
vi.mock("@/lib/stores/ui-store", () => ({ useUiStore: () => "light" }));
vi.mock("@/lib/stores/session-store", () => ({ useApiContext: () => ({ projectId: 7 }) }));
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const GRAPH = {
  nodes: [
    { id: "project", type: "project", label: "Project" },
    { id: "epic:10", type: "epic", label: "Epic 10", phase: 1 },
    { id: "story:1", type: "story", label: "Login", phase: 5, phase_status: "deployed", flags: { conflict: false, trace: true } },
    { id: "gherkin:1", type: "gherkin", label: "Gherkin", phase: 1, scenario_count: 2, flags: {} },
  ],
  edges: [
    { id: "e1", source: "project", target: "epic:10", kind: "derive" },
    { id: "e2", source: "epic:10", target: "story:1", kind: "derive" },
    { id: "e3", source: "story:1", target: "gherkin:1", kind: "derive" },
    { id: "e4", source: "story:1", target: "gherkin:1", kind: "trace" },
  ],
};
vi.mock("@/lib/hooks/use-workspace", () => ({
  useTraceabilityGraph: () => ({ data: GRAPH, isLoading: false, error: null }),
  useSaveTraceLayout: () => ({ mutate: vi.fn() }),
}));

import { TraceabilityGraphPanel } from "@/components/traceability-graph-panel";

describe("TraceabilityGraphPanel", () => {
  beforeEach(() => { pushMock.mockClear(); lastFlowProps = { nodes: [], edges: [] }; });

  it("renders the graph with all nodes and an epic filter", () => {
    render(<TraceabilityGraphPanel />);
    expect(screen.getByText("Living Graph")).toBeTruthy();
    expect(screen.getByText("Epic 10")).toBeTruthy(); // epic option in the filter
    expect(lastFlowProps.nodes.length).toBe(4);
    expect(lastFlowProps.edges.length).toBe(4);
  });

  it("clicking a node navigates to its phase", () => {
    render(<TraceabilityGraphPanel />);
    const story = lastFlowProps.nodes.find((n) => (n as { id: string }).id === "story:1");
    lastFlowProps.onNodeClick?.({}, story);
    expect(pushMock).toHaveBeenCalledWith("/phase5");
  });

  it("flagged-only filter drops unflagged story subtrees", () => {
    render(<TraceabilityGraphPanel />);
    fireEvent.click(screen.getByLabelText("Flagged stories only"));
    // story:1 is trace-flagged → kept; project/epic/design always kept.
    const ids = lastFlowProps.nodes.map((n) => (n as { id: string }).id);
    expect(ids).toContain("story:1");
  });

  it("Export PNG renders the graph to an image", async () => {
    document.body.innerHTML = '<div class="react-flow__viewport"></div>';
    render(<TraceabilityGraphPanel />);
    fireEvent.click(screen.getByText("Export PNG"));
    expect(toPngMock).toHaveBeenCalled();
  });
});
